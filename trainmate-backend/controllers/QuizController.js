import admin from "firebase-admin";
import { db } from "../config/firebase.js";
import { getPineconeIndex } from "../config/pinecone.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CohereClient } from "cohere-ai";
import { updateMemoryAfterQuiz } from "../services/memoryService.js";
import { evaluateCode } from "../services/codeEvaluator.service.js";
import { createDailyModuleReminder, createQuizUnlockReminder } from "../services/calendarService.js";
import { sendTrainingLockedEmail, sendQuizSecurityAlertEmail } from "../services/emailService.js";

let primaryModel = null;
let fallbackModel = null;

function initializeQuizModels() {
  if (!primaryModel || !fallbackModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    primaryModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }
  return { primaryModel, fallbackModel };
}

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

// Agentic quiz system - AI makes dynamic decisions
const QUIZ_MAX_RETRIES = 2;
const PLAN_MAX_QUERIES = 4;
const MAX_CONTEXT_CHARS = 8000;
const QUIZ_PASS_THRESHOLD = 80; // Base threshold, AI can adjust
const MAX_QUIZ_ATTEMPTS = 3; // Maximum possible attempts (AI decides actual count)
const ADMIN_FINAL_RETRY_ATTEMPTS = 1;
const QUIZ_UNLOCK_TIME_PERCENT = 0.5; // Quiz unlocks after 50% of module time

/**
 * Calculate when quiz should be unlocked (50% of module time)
 * @param {Date} moduleStartDate - When module became active
 * @param {number} estimatedDays - Total estimated days for the module
 * @returns {Date} - The date/time when quiz unlocks
 */
function calculateQuizUnlockTime(moduleStartDate, estimatedDays) {
	if (!moduleStartDate || !estimatedDays) return null;
	
	const startTime = moduleStartDate instanceof Date 
		? moduleStartDate.getTime() 
		: moduleStartDate.toDate ? moduleStartDate.toDate().getTime() : new Date(moduleStartDate).getTime();
	
	const unlockDelay = estimatedDays * QUIZ_UNLOCK_TIME_PERCENT * 24 * 60 * 60 * 1000; // 50% of days in ms
	return new Date(startTime + unlockDelay);
}

/**
 * Check if quiz is unlocked based on time requirement
 * @param {Object} moduleData - Module data from Firestore
 * @returns {Object} - { isUnlocked: boolean, unlockTime: Date, remainingTime: string }
 */
function checkQuizTimeUnlock(moduleData) {
	const startDate = moduleData.startedAt || moduleData.startDate;
	const estimatedDays = moduleData.estimatedDays || 1;
	
	if (!startDate) {
		return {
			isUnlocked: false,
			unlockTime: null,
			remainingTime: "Module not started yet",
			message: "Please start the module before attempting the quiz."
		};
	}
	
	const unlockTime = calculateQuizUnlockTime(startDate, estimatedDays);
	const now = Date.now();
	const unlockTimestamp = unlockTime.getTime();
	
	if (now >= unlockTimestamp) {
		return {
			isUnlocked: true,
			unlockTime,
			remainingTime: null,
			message: "Quiz is now available!"
		};
	}
	
	// Calculate remaining time
	const remainingMs = unlockTimestamp - now;
	const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
	const remainingHours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
	const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
	
	let remainingTimeStr = "";
	if (remainingDays > 0) {
		remainingTimeStr = `${remainingDays} day${remainingDays > 1 ? 's' : ''} and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
	} else if (remainingHours > 0) {
		remainingTimeStr = `${remainingHours} hour${remainingHours !== 1 ? 's' : ''} and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
	} else {
		remainingTimeStr = `${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
	}
	
	return {
		isUnlocked: false,
		unlockTime,
		remainingTime: remainingTimeStr,
		message: `Quiz will be available after you've spent 50% of the module time. Unlock in: ${remainingTimeStr}`
	};
}

async function createOrUpdateModuleLockNotification({
	companyId,
	deptId,
	userId,
	moduleId,
	userName,
	userEmail,
	moduleTitle,
	attemptNumber,
	score,
}) {
	const notificationId = `module-lock-${deptId}-${userId}-${moduleId}`;
	const notificationRef = db
		.collection("companies")
		.doc(companyId)
		.collection("adminNotifications")
		.doc(notificationId);

	await notificationRef.set(
		{
			type: "module_lock",
			status: "pending",
			companyId,
			deptId,
			userId,
			moduleId,
			userName: userName || "",
			userEmail: userEmail || "",
			moduleTitle: moduleTitle || "",
			attemptNumber,
			score,
			message: `${userName || "Fresher"} exceeded quiz retries for ${moduleTitle || "module"}. Give one final retry?`,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			resolvedAt: null,
		},
		{ merge: true }
	);

	return notificationId;
}

async function unlockNextModuleForUser({ userRef, currentModuleOrder }) {
	const roadmapSnap = await userRef.collection("roadmap").orderBy("order").get();
	const modules = roadmapSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
	const nextModule = modules
		.filter((mod) => (mod.order || 0) > currentModuleOrder && !mod.completed)
		.sort((a, b) => (a.order || 0) - (b.order || 0))[0];

	if (!nextModule) return null;

	await userRef.collection("roadmap").doc(nextModule.id).set(
		{
			status: "in-progress",
			moduleLocked: false,
			startedAt: admin.firestore.FieldValue.serverTimestamp(),
		},
		{ merge: true }
	);

	return nextModule;
}

async function embedText(text) {
	const res = await cohere.embed({
		model: "embed-english-v3.0",
		texts: [text],
		inputType: "search_query",
	});
	return res.embeddings[0];
}

async function queryPinecone({ embedding, companyId, deptId, topK = 8 }) {
	const index = getPineconeIndex();
	const res = await index
		.namespace(`company-${companyId}`)
		.query({
			vector: embedding,
			topK,
			includeMetadata: true,
			filter: { deptName: { $eq: deptId.toUpperCase() } },
		});

	return (res.matches || []).map((m) => ({
		text: m.metadata?.text || "",
		score: m.score || 0,
	}));
}

function safeParseJson(text) {
	const trimmed = text.replace(/```json/g, "").replace(/```/g, "").trim();
	const jsonStart = trimmed.indexOf("{");
	const jsonEnd = trimmed.lastIndexOf("}");
	if (jsonStart === -1 || jsonEnd === -1) return null;
	const cleanJson = trimmed.substring(jsonStart, jsonEnd + 1);
	try {
		return JSON.parse(cleanJson);
	} catch (err) {
		return null;
	}
}

function normalizeText(value) {
	return String(value || "")
		.trim()
		.toLowerCase();
}

function truncateText(text, maxChars) {
	if (!text) return "";
	return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/**
 * Validate quiz structure (AI-decided, so flexible validation)
 * @param {Object} quiz - Quiz object
 * @param {boolean} allowCoding - Whether department allows coding questions
 * @returns {boolean} - Whether quiz structure is valid
 */
function isQuizComplete(quiz, allowCoding = false) {
	if (!quiz || !Array.isArray(quiz.mcq) || !Array.isArray(quiz.oneLiners)) {
		return false;
	}
	
	// AI decides counts, so just check minimum reasonable values
	if (quiz.mcq.length < 5 || quiz.mcq.length > 25) return false;
	if (quiz.oneLiners.length < 2 || quiz.oneLiners.length > 15) return false;
	
	const mcqValid = quiz.mcq.every((q) => 
		Array.isArray(q.options) && 
		q.options.length === 4 && 
		Number.isInteger(q.correctIndex) && 
		q.correctIndex >= 0 && 
		q.correctIndex < 4
	);
	
	const oneLinersValid = quiz.oneLiners.every((q) => q.question && q.answer);
	
	// Coding questions validation (only if department allows)
	const codingValid = !Array.isArray(quiz.coding) || 
		quiz.coding.length === 0 ||
		(allowCoding && quiz.coding.every((q) => q.question && q.expectedApproach && q.language));
	
	// If coding exists but not allowed, fail validation
	if (quiz.coding && quiz.coding.length > 0 && !allowCoding) {
		return false;
	}
	
	return mcqValid && oneLinersValid && codingValid;
}

function mergeDocs(docsList) {
	const map = new Map();
	for (const doc of docsList) {
		const key = doc.text || "";
		if (!key) continue;
		const prev = map.get(key);
		if (!prev || (doc.score || 0) > (prev.score || 0)) {
			map.set(key, doc);
		}
	}
	return Array.from(map.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
}

async function generateAgenticPlan({ title, baseContext, agentMemorySnippet }) {
	const prompt = `
You are a planning agent for corporate training quiz generation.

MODULE: "${title}"

BASE CONTEXT (may be partial):
${truncateText(baseContext, 1200)}

PERSONALIZED CONTEXT (optional):
${truncateText(agentMemorySnippet, 800)}

Create a compact retrieval plan that identifies the most important subtopics and suggests targeted search queries.

Return JSON only in this format:
{
  "queries": ["string"],
  "focusAreas": ["string"],
  "difficulty": "advanced"
}

Constraints:
- 2 to ${PLAN_MAX_QUERIES} queries
- Queries should be concise and specific
- Output valid JSON only
`;

	try {
		const result = await generateWithRetry(prompt);
		const text = result?.response?.text()?.trim() || "";
		const parsed = safeParseJson(text);
		const queries = Array.isArray(parsed?.queries) ? parsed.queries.slice(0, PLAN_MAX_QUERIES) : [];
		const focusAreas = Array.isArray(parsed?.focusAreas) ? parsed.focusAreas.slice(0, 6) : [];
		if (queries.length >= 2) {
			return { queries, focusAreas, difficulty: parsed?.difficulty || "advanced" };
		}
	} catch (err) {
		console.warn("Agentic plan generation failed, using fallback plan:", err.message);
	}

	return {
		queries: [
			`${title} policies and procedures`,
			`${title} best practices and pitfalls`,
			`${title} real-world scenarios and troubleshooting`,
		],
		focusAreas: ["definitions", "procedures", "best practices", "scenarios"],
		difficulty: "advanced",
	};
}

async function fetchPlannedDocs({ queries, companyId, deptId }) {
	const results = [];
	for (const q of queries) {
		try {
			const embedding = await embedText(q);
			const docs = await queryPinecone({ embedding, companyId, deptId, topK: 6 });
			results.push(...docs);
		} catch (err) {
			console.warn(`Planned retrieval failed for query "${q}":`, err.message);
		}
	}
	return results;
}

async function critiqueQuiz({ title, quiz, allowCoding = false, companyName = "", deptName = "" }) {
	const companyLabel = companyName?.trim() ? companyName.trim() : "this company";
	const departmentLabel = deptName?.trim() ? deptName.trim() : "this department";
	const prompt = `
You are a strict quiz quality auditor for company-specific training.

MODULE: "${title}"
COMPANY: "${companyLabel}"
DEPARTMENT: "${departmentLabel}"

QUIZ JSON:
${JSON.stringify(quiz)}

CRITICAL CHECKS:
- Questions should be 90% based on THIS COMPANY'S training materials and learner's chat history
- 10% can include general best practices (but NO other company references)
- Reject any question that mentions a company name other than "${companyLabel}" or uses invented company names
- Appropriate number of MCQs (5-25) and one-liners (2-15)
- Each MCQ has 4 options and one correct answer
- Questions are specific to the module and advanced-level
- No duplicate questions or options
- Coding questions ${allowCoding ? 'are allowed and should be relevant to company materials' : 'should NOT be present'}
- Total question count is reasonable (10-40 questions total)
- Every question must be contextually relevant to THIS company's business (no other company info)

Return JSON only:
{
  "pass": true|false,
  "issues": ["string"],
  "score": 0-100
}
`;

	try {
		const result = await generateWithRetry(prompt);
		const text = result?.response?.text()?.trim() || "";
		const parsed = safeParseJson(text);
		if (typeof parsed?.pass === "boolean") {
			return parsed;
		}
	} catch (err) {
		console.warn("Quiz critique failed:", err.message);
	}

	return { pass: isQuizComplete(quiz, allowCoding), issues: ["Critique unavailable"], score: isQuizComplete(quiz, allowCoding) ? 80 : 40 };
}

/**
 *  AGENTIC DECISION MAKER
 * AI analyzes quiz performance and makes intelligent decisions about:
 * - Number of retry attempts to grant
 * - Whether roadmap regeneration is needed
 * - What resources to unlock
 * - Personalized recommendations
 */
async function makeAgenticDecision({ 
	score, 
	attemptNumber, 
	mcqScore, 
	oneLinerScore, 
	codingScore,
	weakAreas = [],
	moduleTitle = "",
	timeRemaining = null,
	previousAttempts = [],
	maxAttempts = MAX_QUIZ_ATTEMPTS
}) {
	const { primaryModel } = initializeQuizModels();
	
	const attemptsHistory = previousAttempts.map((att, idx) => 
		`Attempt ${idx + 1}: Score ${att.score}%`
	).join(", ");
	
	const prompt = `
You are an intelligent learning assessment agent. Analyze this learner's quiz performance and make strategic decisions.

MODULE: "${moduleTitle}"
CURRENT ATTEMPT: ${attemptNumber}
CURRENT SCORE: ${score}%
PASS THRESHOLD: ${QUIZ_PASS_THRESHOLD}%

SCORE BREAKDOWN:
- MCQ Score: ${mcqScore}%
- One-liner Score: ${oneLinerScore}%
${codingScore !== null ? `- Coding Score: ${codingScore}%` : ''}

${attemptsHistory ? `PREVIOUS ATTEMPTS: ${attemptsHistory}` : 'This is the first attempt'}

${weakAreas.length > 0 ? `WEAK AREAS: ${weakAreas.join(", ")}` : ''}

${timeRemaining ? `TIME REMAINING IN MODULE: ${timeRemaining}` : 'No time constraint'}

ANALYZE AND DECIDE:

1. **Retry Strategy**: Based on the score gap (${QUIZ_PASS_THRESHOLD - score}%), learning trajectory, and improvement potential:
   - If score is close to passing (60-69%): Recommend 1-2 more attempts
   - If score shows learning gaps (40-59%): May need roadmap adjustment + retries
   - If score is very low (<40%): Consider intensive intervention
   
2. **Roadmap Regeneration**: Determine if learner needs adjusted learning path:
   - YES if there are significant knowledge gaps
   - NO if just minor review needed
   
3. **Resource Allocation**: What should be unlocked for continued learning?

4. **Personalized Message**: Provide encouraging, specific feedback

Return JSON only:
{
  "allowRetry": true|false,
  "retriesGranted": 1-2,
  "requiresRoadmapRegeneration": true|false,
  "unlockResources": ["quiz", "module", "chatbot"],
  "lockModule": true|false,
  "contactAdmin": true|false,
  "message": "Personalized message",
  "recommendations": ["specific action items"],
  "reasoning": "Brief explanation of decision"
}

CONSTRAINTS:
- Maximum ${maxAttempts} total attempts allowed
- Be encouraging but realistic
- Focus on learner's growth and improvement
- Consider time constraints if provided
`;

	try {
		const result = await primaryModel.generateContent(prompt);
		const text = result?.response?.text()?.trim() || "";
		const parsed = safeParseJson(text);
		
		if (parsed && typeof parsed.allowRetry === "boolean") {
			console.log("🤖 Agentic Decision:", parsed.reasoning || "Decision made");
			return parsed;
		}
	} catch (err) {
		console.warn("⚠️ Agentic decision failed, using fallback logic:", err.message);
	}
	
	// Fallback logic if AI fails
	const scoreGap = QUIZ_PASS_THRESHOLD - score;
	const allowRetry = attemptNumber < maxAttempts && scoreGap < 30;
	const needsRegeneration = scoreGap > 20 && attemptNumber < maxAttempts;
	
	return {
		allowRetry,
		retriesGranted: allowRetry ? 1 : 0,
		requiresRoadmapRegeneration: needsRegeneration,
		unlockResources: allowRetry ? ["quiz"] : [],
		lockModule: !allowRetry && attemptNumber >= maxAttempts,
		contactAdmin: !allowRetry,
		message: allowRetry 
			? `You scored ${score}%. Review the materials and try again - you're getting closer!`
			: `After ${attemptNumber} attempts, please contact your admin for additional support.`,
		recommendations: [
			"Review weak areas identified in the results",
			"Use the chatbot for clarification",
			"Take notes on key concepts"
		],
		reasoning: "Fallback decision logic applied"
	};
}

function buildQuizPrompt({ title, context, critiqueIssues, allowCoding = false, moduleDescription = "", companyName = "", deptName = "" }) {
	const critiqueBlock = critiqueIssues && critiqueIssues.length
		? `\n\nCRITIQUE ISSUES TO FIX:\n- ${critiqueIssues.join("\n- ")}`
		: "";
	
	const codingBlock = allowCoding ? `
5. Coding Questions (OPTIONAL - YOU DECIDE HOW MANY if needed):
   - Include coding challenges ONLY if "${title}" involves programming/technical implementation
   - Decide the count based on module complexity (typically 0-3 questions)
   - Each coding question should test problem-solving and implementation skills
   - Base coding scenarios on THIS COMPANY'S training materials and practices (no other company info)
   - Include expected approach and programming language
   - Focus on real-world scenarios from this company's context` : `
5. NO CODING QUESTIONS:
   - This department does NOT allow coding questions
   - Do NOT include any "coding" field in your response
   - Focus only on MCQs and one-liner questions`;

	const companyLabel = companyName?.trim() ? companyName.trim() : "this company";
	const departmentLabel = deptName?.trim() ? deptName.trim() : "this department";

	return `
You are an expert corporate trainer creating an assessment for: "${title}"

COMPANY: "${companyLabel}"
DEPARTMENT: "${departmentLabel}"
MODULE DESCRIPTION: ${moduleDescription}

Your task is to generate a comprehensive quiz that evaluates the trainee's understanding of this specific module.

CONTEXT SOURCES:
${context}

QUIZ GENERATION INSTRUCTIONS:
1. <b>AI-DECIDED STRUCTURE</b>: YOU decide the optimal number of questions based on:
   - Module complexity and scope
   - Content depth from training materials
   - Recommended ranges: MCQs (8-20), One-liners (3-10), Coding (0-3 if allowed)
   - Adjust counts to ensure comprehensive coverage without overwhelming the trainee

2. Focus Questions on Module: All questions must be directly related to "${title}"

3. Source Weighting:
	- 90% of questions should come from THIS COMPANY'S TRAINING MATERIALS and the learner's CHAT HISTORY (official policies, procedures, technical details, personalized learning context)
	- 10% can incorporate general best practices and industry standards (but NEVER use other company examples or information)
	- DO NOT mention other companies, brand names, or fictional company names
	- ONLY refer to the company as "${companyLabel}" or "the company"
	- All questions must be contextually relevant to this company's business and operations

4. Question Quality:
   - Create advanced-level questions that test practical application, not just memorization
   - Include scenario-based questions relevant to "${title}" and THIS COMPANY'S context
   - Cover key concepts, definitions, best practices, and procedures
   - Each MCQ must have 4 distinct options with only one correct answer
   - One-liner questions should test specific knowledge and skills
	- IMPORTANT: Never reference or use information from other companies or invented company names
${codingBlock}
${critiqueBlock}

REQUIRED OUTPUT FORMAT (JSON only):
{
	"mcq": [
		{
			"id": "mcq-1",
			"question": "string (related to ${title})",
			"options": ["Option A", "Option B", "Option C", "Option D"],
			"correctIndex": 0,
			"explanation": "string (brief explanation of correct answer)"
		}
		// ... YOU DECIDE how many MCQs (8-20 recommended)
	],
	"oneLiners": [
		{
			"id": "ol-1",
			"question": "string (specific to ${title})",
			"answer": "string (concise correct answer)",
			"explanation": "string (why this is correct)"
		}
		// ... YOU DECIDE how many one-liners (3-10 recommended)
	]${allowCoding ? `,
	"coding": [
		{
			"id": "code-1",
			"question": "string (coding challenge related to ${title})",
			"expectedApproach": "string (describe the expected solution approach)",
			"language": "JavaScript|Python|Java|etc",
			"sampleInput": "string (optional test case input)",
			"sampleOutput": "string (optional expected output)",
			"hints": ["string"] (optional hints for the trainee)
		}
		// ... ONLY if module involves coding (0-3 questions, YOU DECIDE)
	]` : ''}
}

Return ONLY valid JSON with the structure above. YOU DECIDE the optimal question counts within the recommended ranges.
`;
}

async function generateQuizAgentic({ title, context, allowCoding = false, moduleDescription = "", companyName = "", deptName = "" }) {
	let lastQuiz = null;
	let critique = null;

	for (let attempt = 0; attempt < QUIZ_MAX_RETRIES; attempt += 1) {
		const prompt = buildQuizPrompt({ 
			title, 
			context, 
			critiqueIssues: critique?.issues || [], 
			allowCoding,
			moduleDescription,
			companyName,
			deptName
		});
		const result = await generateWithRetry(prompt);
		const text = result?.response?.text()?.trim() || "";
		const parsed = safeParseJson(text);
		if (!parsed) {
			critique = { pass: false, issues: ["Invalid JSON output"], score: 0 };
			continue;
		}

		const quiz = shapeQuizPayload(parsed, allowCoding);
		lastQuiz = quiz;
		const localValid = isQuizComplete(quiz, allowCoding);
		if (!localValid) {
			critique = { pass: false, issues: ["Incomplete quiz structure"], score: 40 };
			continue;
		}

		critique = await critiqueQuiz({ title, quiz, allowCoding, companyName, deptName });
		if (critique?.pass) {
			return { quiz, critique };
		}
	}

	if (lastQuiz) {
		return { quiz: lastQuiz, critique: critique || { pass: false, issues: ["Fallback quiz"], score: 50 } };
	}

	throw new Error("Failed to generate a valid quiz");
}

async function generateRemediationPlan({ title, mcqResults, oneLinerResults }) {
	const weakMcq = mcqResults.filter((r) => !r.isCorrect).map((r) => ({ question: r.question, correctAnswer: r.correctAnswer }));
	const weakOneLiners = oneLinerResults.filter((r) => !r.isCorrect).map((r) => ({ question: r.question, correctAnswer: r.correctAnswer }));

	const prompt = `
You are a corporate training coach. Create a remediation plan based on missed quiz items.

MODULE: "${title}"

MISSED MCQ ITEMS:
${JSON.stringify(weakMcq)}

MISSED ONE-LINERS:
${JSON.stringify(weakOneLiners)}

Return JSON only:
{
  "summary": "string",
  "focusAreas": ["string"],
  "actions": ["string"],
  "recommendedRetryInDays": 1-30
}
`;

	try {
		const result = await generateWithRetry(prompt);
		const text = result?.response?.text()?.trim() || "";
		const parsed = safeParseJson(text);
		if (parsed?.summary && Array.isArray(parsed?.actions)) {
			return parsed;
		}
	} catch (err) {
		console.warn("Remediation plan generation failed:", err.message);
	}

	return {
		summary: "Review incorrect items and revisit module materials.",
		focusAreas: ["core concepts", "procedures", "best practices"],
		actions: ["Re-read module materials", "Review missed questions", "Attempt practice scenarios"],
		recommendedRetryInDays: 3,
	};
}

async function evaluateOneLinerWithLLM(question, correctAnswer, userResponse) {
	if (!userResponse || userResponse.trim().length === 0) {
		return false;
	}

	// First try exact match (faster)
	if (normalizeText(userResponse) === normalizeText(correctAnswer)) {
		return true;
	}

	// Use LLM for semantic evaluation
	const prompt = `You are an expert evaluator for corporate training quizzes.

Question: ${question}
Correct Answer: ${correctAnswer}
User's Answer: ${userResponse}

Evaluate if the user's answer is semantically correct and captures the key concepts of the correct answer.
Consider the answer correct if it:
- Contains the core meaning of the correct answer
- Uses different but accurate terminology
- Includes the essential facts/concepts

Respond with ONLY "CORRECT" or "INCORRECT" followed by a brief reason.

Format: CORRECT|reason or INCORRECT|reason`;

	try {
		const result = await generateWithRetry(prompt);
		const text = result?.response?.text()?.trim() || "";
		const isCorrect = text.toUpperCase().startsWith("CORRECT");
		console.log(`  LLM Evaluation - Q: "${question.substring(0, 50)}..." | User: "${userResponse}" | Result: ${isCorrect ? "✓" : "✗"}`);
		return isCorrect;
	} catch (err) {
		console.error("LLM evaluation error, falling back to exact match:", err.message);
		return normalizeText(userResponse) === normalizeText(correctAnswer);
	}
}

function shapeQuizPayload(raw, allowCoding = false) {
	const mcq = Array.isArray(raw?.mcq) ? raw.mcq : [];
	const oneLiners = Array.isArray(raw?.oneLiners) ? raw.oneLiners : [];
	const coding = allowCoding && Array.isArray(raw?.coding) ? raw.coding : [];

	const shapedMcq = mcq.map((q, i) => ({
		id: q.id || `mcq-${i + 1}`,
		question: q.question || "",
		options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
		correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
		explanation: q.explanation || "",
	}));

	const shapedOneLiners = oneLiners.map((q, i) => ({
		id: q.id || `ol-${i + 1}`,
		question: q.question || "",
		answer: q.answer || "",
		explanation: q.explanation || "",
	}));
	
	const shapedCoding = coding.map((q, i) => ({
		id: q.id || `code-${i + 1}`,
		question: q.question || "",
		expectedApproach: q.expectedApproach || "",
		language: q.language || "JavaScript",
		sampleInput: q.sampleInput || "",
		sampleOutput: q.sampleOutput || "",
		hints: Array.isArray(q.hints) ? q.hints : [],
	}));

	return { mcq: shapedMcq, oneLiners: shapedOneLiners, coding: shapedCoding };
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch department settings for quiz configuration
 * @param {string} companyId - Company ID
 * @param {string} deptId - Department ID
 * @returns {Promise<Object>} - Department settings
 */
async function getDepartmentSettings(companyId, deptId) {
	try {
		const deptRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId);
		
		const deptSnap = await deptRef.get();
		
		if (deptSnap.exists) {
			const deptData = deptSnap.data();
			return {
				allowCodingQuestions: deptData.quizSettings?.allowCodingQuestions ?? true, // Default true
				quizPreferences: deptData.quizSettings || {},
			};
		}
		
		console.log(`Department ${deptId} not found or no settings. Using defaults.`);
		return {
			allowCodingQuestions: true, // Default: allow coding questions
			quizPreferences: {},
		};
	} catch (err) {
		console.warn(`Failed to fetch department settings: ${err.message}`);
		return {
			allowCodingQuestions: true, // Fallback: allow coding questions
			quizPreferences: {},
		};
	}
}

async function generateWithRetry(prompt) {
	const attempts = 3;
	let lastErr;
	const { primaryModel: pm, fallbackModel: fm } = initializeQuizModels();

	for (let i = 0; i < attempts; i += 1) {
		try {
			return await pm.generateContent(prompt);
		} catch (err) {
			lastErr = err;
			const status = err?.status || err?.response?.status;
			if (status !== 503 || i === attempts - 1) break;
			const delayMs = 800 * Math.pow(2, i);
			await sleep(delayMs);
		}
	}

	try {
		return await fm.generateContent(prompt);
	} catch (err) {
		throw lastErr || err;
	}
}

export const generateQuiz = async (req, res) => {
	try {
		const { companyId, deptId, userId, moduleId, moduleTitle } = req.body;

		if (!companyId || !deptId || !userId || !moduleId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		console.log(`\n=== GENERATE QUIZ START ===`);
		console.log(`CompanyId: ${companyId}, DeptId: ${deptId}, UserId: ${userId}, ModuleId: ${moduleId}`);

		const moduleRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId)
			.collection("roadmap")
			.doc(moduleId);

		const moduleSnap = await moduleRef.get();
		const moduleData = moduleSnap.exists ? moduleSnap.data() : {};
		const title = moduleTitle || moduleData?.moduleTitle || "Training Module";
		const description = moduleData?.description || "";
		console.log(`Module title: ${title}`);
		
		/*
		// 🔒 CHECK: Quiz unlock time requirement (50% of module time)
		console.log(`Checking quiz unlock time requirement...`);
		const quizUnlockStatus = checkQuizTimeUnlock(moduleData);
		
		if (!quizUnlockStatus.isUnlocked) {
			console.log(`❌ Quiz locked: ${quizUnlockStatus.message}`);
			return res.status(403).json({
				error: "Quiz is locked",
				message: quizUnlockStatus.message,
				unlockTime: quizUnlockStatus.unlockTime,
				remainingTime: quizUnlockStatus.remainingTime,
				requirementMet: false
			});
		}
		
		console.log(`✅ Quiz unlock requirement met - generating quiz`);
		*/
		
		// Fetch department settings for quiz configuration
		console.log(`Fetching department settings...`);
		const deptSettings = await getDepartmentSettings(companyId, deptId);
		const allowCoding = deptSettings.allowCodingQuestions;
		console.log(`Department allows coding questions: ${allowCoding ? "YES" : "NO"}`);

		// Fetch company and department labels for strict prompt grounding
		let companyName = "";
		let deptName = "";
		try {
			const companySnap = await db.collection("companies").doc(companyId).get();
			if (companySnap.exists) {
				companyName = companySnap.data()?.name || "";
			}
			const deptSnap = await db
				.collection("companies")
				.doc(companyId)
				.collection("departments")
				.doc(deptId)
				.get();
			if (deptSnap.exists) {
				deptName = deptSnap.data()?.name || deptSnap.data()?.deptName || "";
			}
		} catch (labelErr) {
			console.warn("⚠️ Failed to fetch company/department labels:", labelErr.message);
		}

		// Fetch agent memory summary for personalized context (10% weight)
		let agentMemoryContext = "";
		try {
			const agentMemorySummaryRef = moduleRef.collection("agentMemory").doc("summary");
			const agentMemorySnap = await agentMemorySummaryRef.get();
			if (agentMemorySnap.exists) {
				const memoryData = agentMemorySnap.data();
				agentMemoryContext = memoryData?.content || memoryData?.summary || memoryData?.text || "";
				console.log(`✓ Agent memory found: ${agentMemoryContext.length} characters`);
			} else {
				console.log(`No agent memory found for this module`);
			}
		} catch (memErr) {
			console.warn(`Could not fetch agent memory: ${memErr.message}`);
		}

		// Agentic retrieval plan + multi-query expansion
		const baseQueryText = `${title}: Key concepts, technical skills, best practices, procedures, policies, and practical applications for ${title}`;
		const baseEmbedding = await embedText(baseQueryText);
		const baseDocs = await queryPinecone({ embedding: baseEmbedding, companyId, deptId, topK: 12 });

		const baseDocsContext = baseDocs.map((d) => d.text).join("\n\n");
		const agentMemorySnippet = agentMemoryContext.slice(0, 800);
		const plan = await generateAgenticPlan({
			title,
			baseContext: baseDocsContext,
			agentMemorySnippet,
		});
		console.log(`Agentic plan: ${plan.queries.length} queries, focus areas: ${plan.focusAreas.join(", ")}`);

		const plannedDocs = await fetchPlannedDocs({ queries: plan.queries, companyId, deptId });
		const mergedDocs = mergeDocs([...baseDocs, ...plannedDocs]);
		const companyDocsContext = truncateText(mergedDocs.map((d) => d.text).join("\n\n"), MAX_CONTEXT_CHARS);
		
		const context = `COMPANY TRAINING MATERIALS (Primary Source):
${companyDocsContext || "No company documents available."}

${agentMemorySnippet ? `\nPERSONALIZED LEARNING CONTEXT:
${agentMemorySnippet}` : ""}`;

		console.log(`Context built: ${companyDocsContext.length} chars from docs, ${agentMemorySnippet.length} chars from memory`);

		console.log(`Generating quiz with agentic loop (AI decides structure)...`);
		const { quiz, critique } = await generateQuizAgentic({ 
			title, 
			context, 
			allowCoding,
			moduleDescription: description,
			companyName,
			deptName
		});
		console.log(`✓ Quiz parsed: ${quiz.mcq.length} MCQs, ${quiz.oneLiners.length} one-liners, ${quiz.coding?.length || 0} coding questions (critique pass=${critique?.pass})`);

		try {
			// Ensure module document exists before writing to subcollection
			const moduleSnap = await moduleRef.get();
			if (!moduleSnap.exists) {
				console.log(`Module document doesn't exist, creating it first...`);
				await moduleRef.set({ 
					moduleId, 
					createdAt: admin.firestore.FieldValue.serverTimestamp() 
				}, { merge: true });
			}

			const quizRef = moduleRef.collection("quiz").doc("current");
			const quizPath = `freshers/${companyId}/departments/${deptId}/users/${userId}/roadmap/${moduleId}/quiz/current`;
			console.log(`Attempting to store quiz at: ${quizPath}`);
			
			const quizData = {
				...quiz,
				moduleTitle: title,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				sourceCount: mergedDocs.length,
				hasAgentMemory: agentMemorySnippet.length > 0,
				contextSources: {
					companyDocs: mergedDocs.length,
					agentMemoryLength: agentMemorySnippet.length,
				},
				agentic: {
					planQueries: plan.queries,
					planFocusAreas: plan.focusAreas,
					critiqueScore: critique?.score || null,
					critiquePass: critique?.pass || false,
					aiDecidedStructure: true, // AI decided question counts
					allowCodingQuestions: allowCoding,
					questionCounts: {
						mcq: quiz.mcq.length,
						oneLiners: quiz.oneLiners.length,
						coding: quiz.coding?.length || 0,
					},
				},
			};
			
			await quizRef.set(quizData);
			console.log(`✓ Quiz document written successfully`);
			console.log(`✓ Quiz data: ${quiz.mcq.length} MCQs, ${quiz.oneLiners.length} one-liners, ${quiz.coding?.length || 0} coding questions`);

			// Verify the write immediately
			await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms for write to propagate
			const verifyQuiz = await quizRef.get();
			if (verifyQuiz.exists) {
				console.log(`✓ Quiz document verified in Firestore at: ${quizPath}`);
				const data = verifyQuiz.data();
				console.log(`✓ Verified MCQs: ${data.mcq?.length}, One-liners: ${data.oneLiners?.length}`);
			} else {
				console.error(`✗ CRITICAL: Quiz document NOT found after write at: ${quizPath}`);
				console.error(`✗ This may indicate a Firestore permission or configuration issue`);
			}

			await moduleRef.set({
				quizGenerated: true,
				quizId: "current",
				lastQuizGenerated: admin.firestore.FieldValue.serverTimestamp(),
			}, { merge: true });
			console.log(`✓ Module document updated with quiz flags`);
			
			// Verify module update
			const verifyModule = await moduleRef.get();
			if (verifyModule.exists) {
				const moduleData = verifyModule.data();
				console.log(`✓ Module flags verified: quizGenerated=${moduleData.quizGenerated}, quizId=${moduleData.quizId}`);
			}
		} catch (writeErr) {
			console.error("Error writing quiz to Firestore:", writeErr);
			console.error("Error code:", writeErr.code);
			console.error("Error details:", writeErr.details);
			throw new Error(`Firestore write failed: ${writeErr.message}`);
		}

		const safeQuiz = {
			quizId: "current",
			moduleTitle: title,
			mcq: quiz.mcq.map(({ correctIndex, explanation, ...rest }) => rest),
			oneLiners: quiz.oneLiners.map(({ answer, explanation, ...rest }) => rest),
			coding: (quiz.coding || []).map(({ expectedApproach, ...rest }) => rest), // Hide solution from client
			hasCoding: (quiz.coding || []).length > 0,
		};

		console.log(`=== GENERATE QUIZ COMPLETE ===\n`);
		return res.json(safeQuiz);
	} catch (err) {
		console.error("Quiz generation error:", err);
		console.error("Error stack:", err.stack);
		return res.status(500).json({ error: "Quiz generation failed", details: err.message });
	}
};

export const submitQuiz = async (req, res) => {
	try {
		const { companyId, deptId, userId, moduleId, quizId, answers } = req.body;

		if (!companyId || !deptId || !userId || !moduleId || !quizId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		console.log(`\n=== SUBMIT QUIZ START ===`);
		console.log(`CompanyId: ${companyId}, DeptId: ${deptId}, UserId: ${userId}, ModuleId: ${moduleId}, QuizId: ${quizId}`);

		const moduleRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId)
			.collection("roadmap")
			.doc(moduleId);

		const quizRef = moduleRef.collection("quiz").doc(quizId);
		const moduleSnap = await moduleRef.get();
		const moduleData = moduleSnap.exists ? moduleSnap.data() : {};
		const moduleTitle = moduleData.moduleTitle || "Current Module";
		const maxAttemptsOverride = Number.isInteger(moduleData?.maxAttemptsOverride)
			? moduleData.maxAttemptsOverride
			: 0;
		const effectiveMaxAttempts = Math.min(
			MAX_QUIZ_ATTEMPTS + ADMIN_FINAL_RETRY_ATTEMPTS,
			Math.max(MAX_QUIZ_ATTEMPTS, maxAttemptsOverride)
		);

		/*
		// 🔒 CHECK: Quiz unlock time requirement (50% of module time)
		console.log(`Checking quiz unlock time requirement...`);
		const quizUnlockStatus = checkQuizTimeUnlock(moduleData);
		
		if (!quizUnlockStatus.isUnlocked) {
			console.log(`❌ Quiz submission blocked: ${quizUnlockStatus.message}`);
			return res.status(403).json({
				error: "Quiz is locked",
				message: quizUnlockStatus.message,
				unlockTime: quizUnlockStatus.unlockTime,
				remainingTime: quizUnlockStatus.remainingTime,
				requirementMet: false
			});
		}
		
		console.log(`✅ Quiz unlock requirement met - proceeding with submission`);
		*/

		const quizSnap = await quizRef.get();
		if (!quizSnap.exists) {
			console.error(`Quiz document not found at: quiz/${quizId}`);
			return res.status(404).json({ error: "Quiz not found" });
		}
		console.log(`✓ Quiz document found`);

		const quizData = quizSnap.data();
		
		// Get quiz attempt count
		const attemptsRef = moduleRef.collection("quizAttempts");
		const attemptsSnap = await attemptsRef.get();
		const attemptNumber = attemptsSnap.size + 1;
		console.log(`📝 Quiz attempt #${attemptNumber} of ${effectiveMaxAttempts} allowed`);

		if (attemptNumber > effectiveMaxAttempts) {
			return res.status(403).json({
				error: "Maximum attempts exceeded",
				message: "This module is locked. Please contact your admin.",
				lockModule: true,
				allowRetry: false,
				attemptNumber,
				maxAttempts: effectiveMaxAttempts,
			});
		}
		
		const mcqAnswers = Array.isArray(answers?.mcq) ? answers.mcq : [];
		const oneLinerAnswers = Array.isArray(answers?.oneLiners) ? answers.oneLiners : [];
		const codingAnswers = Array.isArray(answers?.coding) ? answers.coding : [];

		// Evaluate MCQs
		const mcqResults = quizData.mcq.map((q) => {
			const submitted = mcqAnswers.find((a) => a.id === q.id);
			const selectedIndex = Number.isInteger(submitted?.selectedIndex)
				? submitted.selectedIndex
				: null;
			const isCorrect = selectedIndex === q.correctIndex;
			return {
				id: q.id,
				question: q.question,
				options: q.options,
				selectedIndex,
				correctIndex: q.correctIndex,
				correctAnswer: q.options?.[q.correctIndex] || "",
				isCorrect,
				explanation: q.explanation || "",
			};
		});
		console.log(`Evaluating ${mcqResults.length} MCQ answers...`);
		const mcqCorrect = mcqResults.filter((r) => r.isCorrect).length;
		console.log(`✓ MCQs: ${mcqCorrect}/${mcqResults.length} correct`);

		// Evaluate one-liners with LLM
		console.log(`Evaluating ${quizData.oneLiners.length} one-liner answers with LLM...`);
		const oneLinerResults = await Promise.all(
			quizData.oneLiners.map(async (q) => {
				const submitted = oneLinerAnswers.find((a) => a.id === q.id);
				const response = submitted?.response || "";
				const isCorrect = await evaluateOneLinerWithLLM(
					q.question,
					q.answer,
					response
				);
				return {
					id: q.id,
					question: q.question,
					response,
					correctAnswer: q.answer,
					isCorrect,
					explanation: q.explanation || "",
				};
			})
		);
		const oneLinerCorrect = oneLinerResults.filter((r) => r.isCorrect).length;
		console.log(`✓ One-liners: ${oneLinerCorrect}/${oneLinerResults.length} correct`);

		// Evaluate coding questions if present
		let codingResults = [];
		let codingCorrect = 0;
		if (Array.isArray(quizData.coding) && quizData.coding.length > 0) {
			console.log(`Evaluating ${quizData.coding.length} coding questions with AI...`);
			codingResults = await Promise.all(
				quizData.coding.map(async (q) => {
					const submitted = codingAnswers.find((a) => a.id === q.id);
					const code = submitted?.code || "";
					
					const evaluation = await evaluateCode({
						question: q.question,
						code,
						expectedApproach: q.expectedApproach,
						language: q.language,
					});
					
					return {
						id: q.id,
						question: q.question,
						code,
						expectedApproach: q.expectedApproach,
						language: q.language,
						isCorrect: evaluation.isCorrect,
						score: evaluation.score,
						feedback: evaluation.feedback,
						strengths: evaluation.strengths,
						improvements: evaluation.improvements,
					};
				})
			);
			codingCorrect = codingResults.filter((r) => r.isCorrect).length;
			console.log(`✓ Coding: ${codingCorrect}/${codingResults.length} correct`);
		}

		// Calculate comprehensive score
		const mcqWeight = 0.5; // 50%
		const oneLinerWeight = 0.25; // 25%
		const codingWeight = 0.25; // 25%
		
		const mcqScore = mcqResults.length > 0 ? (mcqCorrect / mcqResults.length) * 100 : 0;
		const oneLinerScore = oneLinerResults.length > 0 ? (oneLinerCorrect / oneLinerResults.length) * 100 : 0;
		const codingScore = codingResults.length > 0
			? codingResults.reduce((sum, r) => sum + r.score, 0) / codingResults.length
			: 0;
			
		const hasCodingQuestions = codingResults.length > 0;
		const finalScore = hasCodingQuestions
			? Math.round(mcqScore * mcqWeight + oneLinerScore * oneLinerWeight + codingScore * codingWeight)
			: Math.round(mcqScore * 0.65 + oneLinerScore * 0.35); // Redistribute weights if no coding
			
		const passed = finalScore >= QUIZ_PASS_THRESHOLD;
		console.log(`📊 Final Score: ${finalScore}% (Threshold: ${QUIZ_PASS_THRESHOLD}%) - ${passed ? "PASSED ✓" : "FAILED ✗"}`);
		
		// 🤖 AGENTIC DECISION MAKING
		let message = "";
		let allowRetry = false;
		let requiresRoadmapRegeneration = false;
		let unlockResources = [];
		let lockModule = false;
		let contactAdmin = false;
		let recommendations = [];
		let retriesGranted = 0;
		
		if (passed) {
			message = `🎉 Congratulations! You passed the quiz with ${finalScore}%. Excellent work!`;
		} else {
			// Get previous attempts for AI analysis
			const previousAttempts = [];
			const prevAttemptsSnap = await attemptsRef.get();
			prevAttemptsSnap.forEach(doc => {
				const data = doc.data();
				if (data.score !== undefined) {
					previousAttempts.push({ score: data.score, passed: data.passed });
				}
			});
			
			// Get module info for context (already fetched above)
			
			// Calculate time remaining (if available)
			let timeRemaining = null;
			if (moduleData.FirstTimeCreatedAt && moduleData.estimatedDays) {
				const startDate = moduleData.FirstTimeCreatedAt.toDate();
				const totalDays = moduleData.estimatedDays;
				const deadlineDate = new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
				const now = new Date();
				const msRemaining = deadlineDate - now;
				if (msRemaining > 0) {
					const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
					const hoursRemaining = Math.floor((msRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
					timeRemaining = `${daysRemaining}d ${hoursRemaining}h`;
				} else {
					timeRemaining = "Expired";
				}
			}
			
			// Identify weak areas
			const weakAreas = [];
			if (mcqScore < 60) weakAreas.push("Multiple Choice Questions");
			if (oneLinerScore < 60) weakAreas.push("Short Answer Questions");
			if (hasCodingQuestions && codingScore < 60) weakAreas.push("Coding Challenges");
			
			console.log("🤖 Invoking Agentic Decision Maker...");
			const agenticDecision = await makeAgenticDecision({
				score: finalScore,
				attemptNumber,
				mcqScore,
				oneLinerScore,
				codingScore: hasCodingQuestions ? codingScore : null,
				weakAreas,
				moduleTitle,
				timeRemaining,
				previousAttempts,
				maxAttempts: effectiveMaxAttempts
			});
			
			// Apply agentic decisions
			allowRetry = agenticDecision.allowRetry;
			retriesGranted = agenticDecision.retriesGranted || 0;
			requiresRoadmapRegeneration = agenticDecision.requiresRoadmapRegeneration;
			unlockResources = agenticDecision.unlockResources || [];
			lockModule = agenticDecision.lockModule;
			contactAdmin = agenticDecision.contactAdmin;
			message = agenticDecision.message;
			recommendations = agenticDecision.recommendations || [];

			if (attemptNumber >= effectiveMaxAttempts) {
				allowRetry = false;
				retriesGranted = 0;
				lockModule = true;
				contactAdmin = true;
				message = `You have reached the maximum allowed attempts (${effectiveMaxAttempts}) for this module. This module is now locked and your admin has been notified.`;
			}
			
			console.log(`✓ Agentic Decision Applied: allowRetry=${allowRetry}, retriesGranted=${retriesGranted}, regenerate=${requiresRoadmapRegeneration}, lock=${lockModule}`);
		}

		try {
			// Store attempt
			const attemptRef = attemptsRef.doc(`attempt-${attemptNumber}`);
			await attemptRef.set({
				attemptNumber,
				answers: answers || {},
				score: finalScore,
				passed,
				mcqScore,
				oneLinerScore,
				codingScore: hasCodingQuestions ? codingScore : null,
				submittedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
			console.log(`✓ Attempt #${attemptNumber} stored`);
			
			const resultRef = quizRef.collection("results").doc("latest");
			const resultPath = `freshers/${companyId}/departments/${deptId}/users/${userId}/roadmap/${moduleId}/quiz/${quizId}/results/latest`;
			console.log(`Attempting to store results at: ${resultPath}`);
			
			const quizDocSnap = await quizRef.get();
			if (!quizDocSnap.exists) {
				console.error(`✗ CRITICAL: Quiz parent document doesn't exist at quiz/${quizId}`);
				throw new Error("Quiz parent document not found. Cannot store results.");
			}
			console.log(`✓ Quiz parent document exists`);
			
			const resultData = {
				answers: answers || {},
				score: finalScore,
				passed,
				message,
				allowRetry,
				attemptNumber,
				maxAttempts: effectiveMaxAttempts,
				retriesGranted,
				requiresRoadmapRegeneration,
				unlockResources,
				lockModule,
				contactAdmin,
				recommendations,
				mcq: mcqResults,
				oneLiners: oneLinerResults,
				coding: codingResults,
				scoreBreakdown: {
					mcqScore,
					oneLinerScore,
						codingScore: hasCodingQuestions ? codingScore : null,
					},
					submittedAt: admin.firestore.FieldValue.serverTimestamp(),
				};
				
				await resultRef.set(resultData);
				console.log(`✓ Results document written successfully: score=${finalScore}, passed=${passed}`);

				await new Promise(resolve => setTimeout(resolve, 500));
				const verifyResult = await resultRef.get();
				if (verifyResult.exists) {
					const resultVerifyData = verifyResult.data();
					console.log(`✓ Results verified in Firestore at: ${resultPath}`);
					console.log(`✓ Verified score: ${resultVerifyData.score}, passed: ${resultVerifyData.passed}`);
				} else {
					console.error(`✗ CRITICAL: Results document NOT found after write at: ${resultPath}`);
				}

				if (passed) {
					await moduleRef.set({
						completed: true,
						status: "completed",
						progress: 100,
						quizLocked: false,
						quizPassed: true,
						quizAttempts: attemptNumber,
						retriesGranted: 0,
						lastQuizSubmitted: admin.firestore.FieldValue.serverTimestamp(),
					}, { merge: true });
					console.log(`✓ Module updated: quiz passed`);

					const userRef = db
						.collection("freshers")
						.doc(companyId)
						.collection("departments")
						.doc(deptId)
						.collection("users")
						.doc(userId);

					const userSnap = await userRef.get();
					const userData = userSnap.exists ? userSnap.data() : {};

					const roadmapSnap = await userRef.collection("roadmap").orderBy("order").get();
					const modules = roadmapSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
					const currentOrder = moduleData?.order ?? modules.find((m) => m.id === moduleId)?.order ?? 0;
					const remainingModules = modules
						.filter((m) => (m.order || 0) > currentOrder && !m.completed)
						.sort((a, b) => (a.order || 0) - (b.order || 0));

					const nextModule = remainingModules[0];
					if (nextModule) {
						await userRef.collection("roadmap").doc(nextModule.id).set({
							status: "in-progress",
							moduleLocked: false,
							startedAt: admin.firestore.FieldValue.serverTimestamp(),
						}, { merge: true });
						console.log(`✓ Next module unlocked: ${nextModule.moduleTitle}`);
					}

					// Schedule calendar reminders for next active module
					try {
						const timeZone = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
						const reminderTime = process.env.DAILY_REMINDER_TIME || "22:15";
						const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
						const testRecipient = process.env.TEST_NOTIFICATION_EMAIL || null;

						const userEmail = testRecipient || userData?.email;

						if (!userEmail) {
							console.warn("⚠️ User email not found, skipping calendar notifications");
						} else {
							const nextModule = modules.find(m => (m.order || 0) > currentOrder && !m.completed);

							if (!nextModule) {
								console.log("ℹ️ No next module found to schedule reminders");
							} else {
								const companySnap = await db.collection("companies").doc(companyId).get();
								const companyName = companySnap.exists ? companySnap.data().name || "TrainMate" : "TrainMate";

								const startDate = new Date();
								const estimatedDays = nextModule.estimatedDays || 1;
								const unlockDate = startDate;

								console.log("📅 Scheduling daily module reminders", {
									moduleTitle: nextModule.moduleTitle,
									estimatedDays,
									reminderTime,
									attendeeEmail: userEmail,
								});

								await createDailyModuleReminder({
									calendarId,
									moduleTitle: nextModule.moduleTitle,
									companyName,
									startDate,
									occurrenceCount: estimatedDays,
									reminderTime,
									timeZone,
									attendeeEmail: userEmail,
								});

								console.log("📅 Scheduling quiz unlock reminder", {
									moduleTitle: nextModule.moduleTitle,
									unlockDate: unlockDate.toISOString(),
									reminderTime,
									attendeeEmail: userEmail,
								});

								await createQuizUnlockReminder({
									calendarId,
									moduleTitle: nextModule.moduleTitle,
									companyName,
									unlockDate,
									reminderTime,
									timeZone,
									attendeeEmail: userEmail,
								});

								console.log("✅ Calendar notifications scheduled for next active module:", nextModule.moduleTitle);
							}
						}
					} catch (calErr) {
						console.warn("⚠️ Calendar scheduling failed (non-critical):", calErr.message);
					}
				} else {
					// 🤖 Apply agentic decisions to module state
					const updateData = {
						quizPassed: false,
						quizAttempts: attemptNumber,
						retriesGranted,
						lastQuizSubmitted: admin.firestore.FieldValue.serverTimestamp(),
					};
					
					// Lock/unlock based on agentic decision
					if (lockModule) {
						updateData.quizLocked = true;
						updateData.moduleLocked = true;
						updateData.status = "locked";
						updateData.requiresAdminContact = contactAdmin;
						console.log(`Module locked by TrainMate decision after ${attemptNumber} attempts`);
						
						// 🔒 Lock entire training for user
						const userRef = db
							.collection("freshers")
							.doc(companyId)
							.collection("departments")
							.doc(deptId)
							.collection("users")
							.doc(userId);

						const userSnap = await userRef.get();
						const userData = userSnap.exists ? userSnap.data() : {};
						
						await userRef.set({
							trainingLocked: true,
							trainingLockedAt: admin.firestore.FieldValue.serverTimestamp(),
							trainingLockedReason: `Failed quiz "${moduleData.moduleTitle}" after ${attemptNumber} attempts`,
							requiresAdminContact: true,
						}, { merge: true });
						console.log(`✓ User training locked - requires admin intervention`);

						try {
							const currentOrder = moduleData?.order || 0;
							const nextModule = await unlockNextModuleForUser({ userRef, currentModuleOrder: currentOrder });
							if (nextModule) {
								console.log(`✓ Next module unlocked after lock: ${nextModule.moduleTitle}`);
							}
						} catch (unlockErr) {
							console.warn("Failed to unlock next module after lock:", unlockErr.message);
						}

						let createdNotificationId = null;
						try {
							createdNotificationId = await createOrUpdateModuleLockNotification({
								companyId,
								deptId,
								userId,
								moduleId,
								userName: userData?.name || "",
								userEmail: userData?.email || "",
								moduleTitle: moduleData?.moduleTitle || "",
								attemptNumber,
								score: finalScore,
							});
							updateData.adminNotificationId = createdNotificationId;
							console.log(`✓ Admin notification created: ${createdNotificationId}`);
						} catch (notificationErr) {
							console.warn("Failed to create admin module-lock notification:", notificationErr.message);
						}

						// Notify company by email (non-blocking)
						try {
							const companySnap = await db.collection("companies").doc(companyId).get();
							const companyData = companySnap.exists ? companySnap.data() : {};
							const companyEmail = companyData?.email || companyData?.companyEmail || null;
							const companyName = companyData?.name || "TrainMate Company";

							if (!companyEmail) {
								console.warn("Company email not found, skipping lock notification email");
							} else {
								await sendTrainingLockedEmail({
									companyEmail,
									companyName,
									userName: userData?.name || "",
									userEmail: userData?.email || "",
									moduleTitle: moduleData?.moduleTitle || "",
									attemptNumber,
									score: finalScore,
								});
								console.log("Company notification email sent for training lock");
							}
						} catch (emailErr) {
							console.warn("Training lock email failed (non-critical):", emailErr.message);
						}
					} else if (allowRetry) {
						updateData.quizLocked = false; // Unlock for retry
						console.log(`Quiz unlocked for retry by TrainMate decision (${retriesGranted} retries granted)`);
					}
					
					// Unlock specific resources if AI decided
					if (unlockResources.includes("module")) {
						updateData.moduleLocked = false;
					}
					if (unlockResources.includes("chatbot")) {
						updateData.chatbotLocked = false;
					}
					
					await moduleRef.set(updateData, { merge: true });
					console.log(`✓ Module updated with agentic decisions`);
				}
		} catch (writeErr) {
			console.error("Error storing quiz results:", writeErr);
			console.error("Error code:", writeErr.code);
			console.error("Error details:", writeErr.details);
			throw new Error(`Firestore write failed: ${writeErr.message}`);
		}

		// 🧠 Update agent memory with quiz results (async, non-blocking)
		updateMemoryAfterQuiz({
			userId,
			companyId,
			deptId,
			moduleId,
			moduleTitle: moduleData.moduleTitle,
			score: finalScore,
			passed,
			mcqResults,
			oneLinerResults
		}).catch(err => {
			console.warn("⚠️ Memory update after quiz failed (non-critical):", err.message);
		});
		
		console.log(`=== SUBMIT QUIZ COMPLETE ===\n`);
		return res.json({
			score: finalScore,
			passed,
			message,
			allowRetry,
			attemptNumber,
			maxAttempts: effectiveMaxAttempts,
			retriesGranted,
			requiresRoadmapRegeneration,
			unlockResources,
			lockModule,
			contactAdmin,
			recommendations,
			mcq: mcqResults,
			oneLiners: oneLinerResults,
			coding: codingResults,
			scoreBreakdown: {
				mcqScore,
				oneLinerScore,
				codingScore: hasCodingQuestions ? codingScore : null,
			},
		});
	} catch (err) {
		console.error("Quiz submission error:", err);
		console.error("Error stack:", err.stack);
		return res.status(500).json({ error: "Quiz submission failed", details: err.message });
	}
};

export const adminUnlockModule = async (req, res) => {
	try {
		const { companyId, deptId, userId, moduleId, notificationId } = req.body;
		if (!companyId || !deptId || !userId || !moduleId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const moduleRef = userRef.collection("roadmap").doc(moduleId);
		const moduleSnap = await moduleRef.get();
		if (!moduleSnap.exists) {
			return res.status(404).json({ error: "Module not found" });
		}

		const moduleData = moduleSnap.data() || {};
		const attemptsSnap = await moduleRef.collection("quizAttempts").get();
		const currentAttempts = attemptsSnap.size;

		if (moduleData.adminFinalRetryGranted) {
			return res.status(400).json({
				error: "Final retry already granted for this module",
				maxAttemptsOverride: moduleData.maxAttemptsOverride || MAX_QUIZ_ATTEMPTS + ADMIN_FINAL_RETRY_ATTEMPTS,
			});
		}

		const maxAttemptsOverride = MAX_QUIZ_ATTEMPTS + ADMIN_FINAL_RETRY_ATTEMPTS;

		await moduleRef.set({
			quizLocked: false,
			moduleLocked: false,
			status: "in-progress",
			requiresAdminContact: false,
			adminUnlockAttemptsGranted: ADMIN_FINAL_RETRY_ATTEMPTS,
			adminFinalRetryGranted: true,
			maxAttemptsOverride,
			adminUnlockedAt: admin.firestore.FieldValue.serverTimestamp(),
		}, { merge: true });

		await userRef.set({
			trainingLocked: false,
			trainingLockedAt: admin.firestore.FieldValue.delete(),
			trainingLockedReason: admin.firestore.FieldValue.delete(),
			requiresAdminContact: false,
		}, { merge: true });

		if (notificationId) {
			const notificationRef = db
				.collection("companies")
				.doc(companyId)
				.collection("adminNotifications")
				.doc(notificationId);

			await notificationRef.set(
				{
					status: "approved",
					resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true }
			);
		}

		return res.json({
			success: true,
			currentAttempts,
			attemptsGranted: ADMIN_FINAL_RETRY_ATTEMPTS,
			maxAttemptsOverride,
		});
	} catch (err) {
		console.error("Admin unlock error:", err);
		return res.status(500).json({ error: "Failed to unlock module", details: err.message });
	}
};
export const reportProctoringViolation = async (req, res) => {
	try {
		const {
			companyId,
			deptId,
			userId,
			moduleId,
			quizId = null,
			timeAwaySeconds = 0,
			violationCount = 0,
			action = "warning",
			notifyAdmin = false,
		} = req.body || {};

		if (!companyId || !deptId || !userId || !moduleId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		const safeAwaySeconds = Math.max(0, Number(timeAwaySeconds) || 0);
		const safeViolationCount = Math.max(0, Number(violationCount) || 0);

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const moduleRef = userRef.collection("roadmap").doc(moduleId);

		const [userSnap, moduleSnap] = await Promise.all([userRef.get(), moduleRef.get()]);
		const userData = userSnap.exists ? userSnap.data() : {};
		const moduleData = moduleSnap.exists ? moduleSnap.data() : {};

		await moduleRef.collection("proctoringViolations").add({
			quizId,
			timeAwaySeconds: safeAwaySeconds,
			violationCount: safeViolationCount,
			action,
			notifyAdmin: Boolean(notifyAdmin),
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		await moduleRef.set(
			{
				lastProctoringViolationAt: admin.firestore.FieldValue.serverTimestamp(),
				lastProctoringViolationSeconds: safeAwaySeconds,
				proctoringViolationCount: safeViolationCount,
			},
			{ merge: true }
		);

		if (notifyAdmin) {
			try {
				const companySnap = await db.collection("companies").doc(companyId).get();
				const companyData = companySnap.exists ? companySnap.data() : {};
				const companyEmail = companyData?.email || companyData?.companyEmail || null;
				const companyName = companyData?.name || "TrainMate Company";

				if (!companyEmail) {
					console.warn("Company email not found, skipping proctoring alert email");
				} else {
					await sendQuizSecurityAlertEmail({
						companyEmail,
						companyName,
						userName: userData?.name || "",
						userEmail: userData?.email || "",
						moduleTitle: moduleData?.moduleTitle || "",
						violationCount: safeViolationCount,
						timeAwaySeconds: safeAwaySeconds,
					});
				}
			} catch (emailErr) {
				console.warn("Proctoring security alert email failed (non-critical):", emailErr.message);
			}
		}

		return res.json({
			success: true,
			violationCount: safeViolationCount,
			timeAwaySeconds: safeAwaySeconds,
			notifyAdmin: Boolean(notifyAdmin),
		});
	} catch (err) {
		console.error("Proctoring violation report error:", err);
		return res.status(500).json({ error: "Failed to report proctoring violation", details: err.message });
	}
};

// Test endpoint to verify Firestore write operations
export const testFirestoreWrite = async (req, res) => {
	try {
		const { companyId, deptId, userId, moduleId } = req.body;
		
		if (!companyId || !deptId || !userId || !moduleId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		console.log("\n=== FIRESTORE WRITE TEST START ===");
		
		const moduleRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId)
			.collection("roadmap")
			.doc(moduleId);

		const testPath = `freshers/${companyId}/departments/${deptId}/users/${userId}/roadmap/${moduleId}/quiz/test-doc`;
		console.log(`Testing write to: ${testPath}`);

		// Test 1: Write to subcollection
		const testRef = moduleRef.collection("quiz").doc("test-doc");
		await testRef.set({
			test: true,
			message: "This is a test document",
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
		});
		console.log("✓ Test document written");

		// Test 2: Verify write
		await new Promise(resolve => setTimeout(resolve, 1000));
		const verify = await testRef.get();
		if (verify.exists) {
			console.log("✓ Test document verified in Firestore");
			const data = verify.data();
			console.log("✓ Test data:", data);
			
			// Test 3: Write to nested subcollection
			const nestedRef = testRef.collection("nested").doc("test-nested");
			await nestedRef.set({
				nested: true,
				message: "This is a nested test",
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
			});
			console.log("✓ Nested test document written");
			
			await new Promise(resolve => setTimeout(resolve, 1000));
			const verifyNested = await nestedRef.get();
			if (verifyNested.exists) {
				console.log("✓ Nested test document verified");
				console.log("=== FIRESTORE WRITE TEST PASSED ===\n");
				return res.json({
					success: true,
					message: "Firestore writes are working correctly",
					testPath,
					nestedPath: `${testPath}/nested/test-nested`,
				});
			} else {
				console.error("✗ Nested test document NOT found");
				return res.status(500).json({ error: "Nested write verification failed" });
			}
		} else {
			console.error("✗ Test document NOT found after write");
			console.log("=== FIRESTORE WRITE TEST FAILED ===\n");
			return res.status(500).json({ error: "Firestore write verification failed" });
		}
	} catch (err) {
		console.error("Firestore test error:", err);
		console.error("Error code:", err.code);
		console.error("Error details:", err.details);
		return res.status(500).json({ error: "Firestore test failed", details: err.message });
	}
};
