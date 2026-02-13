import admin from "firebase-admin";
import { db } from "../config/firebase.js";
import { getPineconeIndex } from "../config/pinecone.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CohereClient } from "cohere-ai";
import { updateMemoryAfterQuiz } from "../services/memoryService.js";

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

const QUIZ_COUNTS = { mcq: 15, oneLiners: 5 };
const QUIZ_MAX_RETRIES = 2;
const PLAN_MAX_QUERIES = 4;
const MAX_CONTEXT_CHARS = 8000;

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

function isQuizComplete(quiz) {
	if (!quiz || !Array.isArray(quiz.mcq) || !Array.isArray(quiz.oneLiners)) {
		return false;
	}
	if (quiz.mcq.length !== QUIZ_COUNTS.mcq || quiz.oneLiners.length !== QUIZ_COUNTS.oneLiners) {
		return false;
	}
	const mcqValid = quiz.mcq.every((q) => Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4);
	const oneLinersValid = quiz.oneLiners.every((q) => q.question && q.answer);
	return mcqValid && oneLinersValid;
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

async function critiqueQuiz({ title, quiz }) {
	const prompt = `
You are a strict quiz quality auditor.

MODULE: "${title}"

QUIZ JSON:
${JSON.stringify(quiz)}

Check for:
- Exactly ${QUIZ_COUNTS.mcq} MCQs and ${QUIZ_COUNTS.oneLiners} one-liners
- Each MCQ has 4 options and one correct answer
- Questions are specific to the module and advanced-level
- No duplicate questions or options

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

	return { pass: isQuizComplete(quiz), issues: ["Critique unavailable"], score: isQuizComplete(quiz) ? 80 : 40 };
}

function buildQuizPrompt({ title, context, critiqueIssues }) {
	const critiqueBlock = critiqueIssues && critiqueIssues.length
		? `\n\nCRITIQUE ISSUES TO FIX:\n- ${critiqueIssues.join("\n- ")}`
		: "";

	return `
You are an expert corporate trainer creating an assessment for: "${title}"

Your task is to generate a comprehensive quiz that evaluates the trainee's understanding of this specific module.

CONTEXT SOURCES:
${context}

QUIZ GENERATION INSTRUCTIONS:
1. Focus Questions on Module: All questions must be directly related to "${title}"
2. Source Weighting:
   - 90% of questions should come from the COMPANY TRAINING MATERIALS (official policies, procedures, technical details)
   - 10% can incorporate insights from PERSONALIZED LEARNING CONTEXT (if available)
3. Question Quality:
   - Create advanced-level questions that test practical application, not just memorization
   - Include scenario-based questions relevant to "${title}"
   - Cover key concepts, definitions, best practices, and procedures
   - Each MCQ must have 4 distinct options with only one correct answer
   - One-liner questions should test specific knowledge and skills
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
		// ... exactly ${QUIZ_COUNTS.mcq} MCQs total
	],
	"oneLiners": [
		{
			"id": "ol-1",
			"question": "string (specific to ${title})",
			"answer": "string (concise correct answer)",
			"explanation": "string (why this is correct)"
		}
		// ... exactly ${QUIZ_COUNTS.oneLiners} one-liners total
	]
}

Generate exactly ${QUIZ_COUNTS.mcq} MCQs and ${QUIZ_COUNTS.oneLiners} one-liner questions. Return ONLY valid JSON, no other text.
`;
}

async function generateQuizAgentic({ title, context }) {
	let lastQuiz = null;
	let critique = null;

	for (let attempt = 0; attempt < QUIZ_MAX_RETRIES; attempt += 1) {
		const prompt = buildQuizPrompt({ title, context, critiqueIssues: critique?.issues || [] });
		const result = await generateWithRetry(prompt);
		const text = result?.response?.text()?.trim() || "";
		const parsed = safeParseJson(text);
		if (!parsed) {
			critique = { pass: false, issues: ["Invalid JSON output"], score: 0 };
			continue;
		}

		const quiz = shapeQuizPayload(parsed);
		lastQuiz = quiz;
		const localValid = isQuizComplete(quiz);
		if (!localValid) {
			critique = { pass: false, issues: ["Incomplete quiz structure"], score: 40 };
			continue;
		}

		critique = await critiqueQuiz({ title, quiz });
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

function shapeQuizPayload(raw) {
	const mcq = Array.isArray(raw?.mcq) ? raw.mcq : [];
	const oneLiners = Array.isArray(raw?.oneLiners) ? raw.oneLiners : [];

	const shapedMcq = mcq.slice(0, QUIZ_COUNTS.mcq).map((q, i) => ({
		id: q.id || `mcq-${i + 1}`,
		question: q.question || "",
		options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
		correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
		explanation: q.explanation || "",
	}));

	const shapedOneLiners = oneLiners.slice(0, QUIZ_COUNTS.oneLiners).map((q, i) => ({
		id: q.id || `ol-${i + 1}`,
		question: q.question || "",
		answer: q.answer || "",
		explanation: q.explanation || "",
	}));

	return { mcq: shapedMcq, oneLiners: shapedOneLiners };
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
		console.log(`Module title: ${title}`);

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

		console.log(`Generating quiz with agentic loop...`);
		const { quiz, critique } = await generateQuizAgentic({ title, context });
		console.log(`✓ Quiz parsed: ${quiz.mcq.length} MCQs, ${quiz.oneLiners.length} one-liners (critique pass=${critique?.pass})`);

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
				},
			};
			
			await quizRef.set(quizData);
			console.log(`✓ Quiz document written successfully`);
			console.log(`✓ Quiz data: ${quiz.mcq.length} MCQs, ${quiz.oneLiners.length} one-liners`);

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

		const quizSnap = await quizRef.get();
		if (!quizSnap.exists) {
			console.error(`Quiz document not found at: quiz/${quizId}`);
			return res.status(404).json({ error: "Quiz not found" });
		}
		console.log(`✓ Quiz document found`);

		const quizData = quizSnap.data();
		const mcqAnswers = Array.isArray(answers?.mcq) ? answers.mcq : [];
		const oneLinerAnswers = Array.isArray(answers?.oneLiners) ? answers.oneLiners : [];

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

		// Evaluate MCQs (simple index comparison)
		console.log(`Evaluating ${mcqResults.length} MCQ answers...`);
		const mcqCorrect = mcqResults.filter((r) => r.isCorrect).length;
		console.log(`✓ MCQs: ${mcqCorrect}/${mcqResults.length} correct`);

		// Evaluate one-liners with LLM for semantic correctness
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

		const totalQuestions = mcqResults.length + oneLinerResults.length;
		const correctCount =
			mcqResults.filter((r) => r.isCorrect).length +
			oneLinerResults.filter((r) => r.isCorrect).length;
		const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
		const passed = score >= 80;
		const message = passed
			? "You passed the quiz. Great job!"
			: "You failed the quiz. Please contact your company admin to allow another attempt.";

		try {
			const resultRef = quizRef.collection("results").doc("latest");
			const resultPath = `freshers/${companyId}/departments/${deptId}/users/${userId}/roadmap/${moduleId}/quiz/${quizId}/results/latest`;
			console.log(`Attempting to store results at: ${resultPath}`);
			
			// Ensure quiz parent document exists
			const quizDocSnap = await quizRef.get();
			if (!quizDocSnap.exists) {
				console.error(`✗ CRITICAL: Quiz parent document doesn't exist at quiz/${quizId}`);
				throw new Error("Quiz parent document not found. Cannot store results.");
			}
			console.log(`✓ Quiz parent document exists`);
			
			const resultData = {
				answers: answers || {},
				score,
				passed,
				message,
				mcq: mcqResults,
				oneLiners: oneLinerResults,
				submittedAt: admin.firestore.FieldValue.serverTimestamp(),
			};
			
			await resultRef.set(resultData);
			console.log(`✓ Results document written successfully: score=${score}, passed=${passed}`);

			// Verify the write immediately
			await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms for write to propagate
			const verifyResult = await resultRef.get();
			if (verifyResult.exists) {
				const resultVerifyData = verifyResult.data();
				console.log(`✓ Results verified in Firestore at: ${resultPath}`);
				console.log(`✓ Verified score: ${resultVerifyData.score}, passed: ${resultVerifyData.passed}`);
			} else {
				console.error(`✗ CRITICAL: Results document NOT found after write at: ${resultPath}`);
				console.error(`✗ This may indicate a Firestore permission or configuration issue`);
			}

			if (passed) {
				await moduleRef.set({
					completed: true,
					status: "completed",
					progress: 100,
					quizLocked: false,
					quizPassed: true,
					lastQuizSubmitted: admin.firestore.FieldValue.serverTimestamp(),
				}, { merge: true });
				console.log(`✓ Module updated: quiz passed`);
			} else {
				await moduleRef.set({
					quizLocked: true,
					quizPassed: false,
					lastQuizSubmitted: admin.firestore.FieldValue.serverTimestamp(),
				}, { merge: true });
				console.log(`✓ Module updated: quiz locked`);

				const remediationPlan = await generateRemediationPlan({
					title: quizData.moduleTitle || "Module",
					mcqResults,
					oneLinerResults,
				});
				const remediationRef = quizRef.collection("remediation").doc("latest");
				await remediationRef.set({
					...remediationPlan,
					createdAt: admin.firestore.FieldValue.serverTimestamp(),
				});
				console.log(`✓ Remediation plan stored`);
			}
			
			// Verify module update
			const verifyModule = await moduleRef.get();
			if (verifyModule.exists) {
				const moduleData = verifyModule.data();
				console.log(`✓ Module state verified: quizPassed=${moduleData.quizPassed}, quizLocked=${moduleData.quizLocked}`);
			}

			// Update agent memory with quiz results (async, non-blocking)
			updateMemoryAfterQuiz({
				userId,
				companyId,
				deptId,
				moduleId,
				moduleTitle: quizData.moduleTitle || "Module",
				score,
				passed,
				mcqResults,
				oneLinerResults
			}).catch(err => console.warn("⚠️ Memory update after quiz skipped:", err.message));

		} catch (writeErr) {
			console.error("Error writing quiz results to Firestore:", writeErr);
			console.error("Error code:", writeErr.code);
			console.error("Error details:", writeErr.details);
			throw new Error(`Firestore write failed: ${writeErr.message}`);
		}

		console.log(`=== SUBMIT QUIZ COMPLETE ===\n`);
		return res.json({
			score,
			passed,
			message,
			mcq: mcqResults,
			oneLiners: oneLinerResults,
		});
	} catch (err) {
		console.error("Quiz submission error:", err);
		console.error("Error stack:", err.stack);
		return res.status(500).json({ error: "Quiz submission failed", details: err.message });
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
