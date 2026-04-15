// trainmate-backend/controllers/roadmap.controller.js
import { db } from "../config/firebase.js";
import { parseCvFromUrl } from "../services/cvParser.service.js";
import { retrieveDeptDocsFromPinecone } from "../services/pineconeService.js";
import { generateRoadmap } from "../services/llmService.js";
import { extractSkillsFromText } from "../services/skillExtractor.service.js";
import { extractSkillsAgentically } from "../services/agenticSkillExtractor.service.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateRoadmapPDF } from "../services/pdfService.js";
import { handleRoadmapGenerated } from "../services/notificationService.js";

const MAX_QUIZ_ATTEMPTS = 3; // Must match QuizController.js

let roadmapModel = null;

function initializeModel() {
  if (!roadmapModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    roadmapModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return roadmapModel;
}

const ROADMAP_MAX_RETRIES = 2;
const PLAN_MAX_QUERIES = 4;
const MAX_CONTEXT_CHARS = 8000;
const ROADMAP_LOCK_TTL_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateText(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
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

function safeParseJson(text) {
  const trimmed = String(text || "").replace(/```json/g, "").replace(/```/g, "").trim();
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

function isRoadmapComplete(modules) {
  if (!Array.isArray(modules) || modules.length === 0) return false;
  return modules.every((m) => 
    m.moduleTitle && 
    m.description && 
    Number.isFinite(m.estimatedDays) &&
    Array.isArray(m.skillsCovered) && m.skillsCovered.length > 0
  );
}

function normalizeRoadmapModules(modules) {
  if (!Array.isArray(modules)) return [];
  return modules.map((module, idx) => ({
    moduleTitle: module.moduleTitle ?? `Module ${idx + 1}`,
    description: module.description ?? "No description provided",
    estimatedDays: Number.isFinite(module.estimatedDays) ? module.estimatedDays : 1,
    skillsCovered: Array.isArray(module.skillsCovered) ? module.skillsCovered : []
  }));
}

function mapRoadmapSnapshot(snapshot) {
  if (!snapshot || snapshot.empty) return [];
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function parseTrainingDurationDays(duration) {
  if (Number.isFinite(duration)) return Math.max(1, Math.round(duration));
  const raw = String(duration || "").trim().toLowerCase();
  if (!raw) return null;

  const numberMatch = raw.match(/\d+(?:\.\d+)?/);
  const value = numberMatch ? parseFloat(numberMatch[0]) : NaN;
  if (!Number.isFinite(value)) return null;

  if (raw.includes("week")) return Math.max(1, Math.round(value * 7));
  if (raw.includes("month")) return Math.max(1, Math.round(value * 30));
  if (raw.includes("day")) return Math.max(1, Math.round(value));

  return Math.max(1, Math.round(value));
}



function enforceTrainingDuration(modules, durationDays) {
  if (!Array.isArray(modules) || modules.length === 0) return modules;
  if (!Number.isFinite(durationDays) || durationDays <= 0) return modules;

  const adjusted = modules.map((m) => ({ ...m }));
  const totalDays = adjusted.reduce((sum, m) => sum + (m.estimatedDays || 1), 0);
  if (totalDays === durationDays) return adjusted;

  if (totalDays > durationDays) {
    let remaining = totalDays - durationDays;
    for (let i = adjusted.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const current = adjusted[i].estimatedDays || 1;
      const reducible = Math.max(0, current - 1);
      const reduceBy = Math.min(reducible, remaining);
      adjusted[i].estimatedDays = current - reduceBy;
      remaining -= reduceBy;
    }
    return adjusted;
  }

  const addDays = durationDays - totalDays;
  adjusted[adjusted.length - 1].estimatedDays =
    (adjusted[adjusted.length - 1].estimatedDays || 1) + addDays;
  return adjusted;
}

async function generateRoadmapModel(prompt) {
  const attempts = 3;
  let lastErr;
  const model = initializeModel();

  for (let i = 0; i < attempts; i += 1) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      if (status !== 503 || i === attempts - 1) break;
      await sleep(800 * Math.pow(2, i));
    }
  }

  throw lastErr;
}

async function generateRoadmapPlan({ trainingOn, cvText, skillGap, learningProfile }) {
  const weakConcepts = learningProfile?.weakConcepts || [];
  const weaknessRelatedSkills = learningProfile?.weaknessRelatedSkills || [];
  const otherCompanySkills = learningProfile?.otherCompanySkills || [];
  const balancedApproach = learningProfile?.balancedApproach || false;
  
  const prompt = `
You are a planning agent for personalized training roadmaps.

TARGET DOMAIN: "${trainingOn || "General"}"

CV SUMMARY (partial):
${truncateText(cvText, 1200)}

SKILL GAP: ${Array.isArray(skillGap) ? skillGap.slice(0, 15).join(", ") : "None"}

${weakConcepts.length > 0 ? `WEAK CONCEPTS (from quiz failures): ${weakConcepts.slice(0, 8).join(", ")}` : ''}

${weaknessRelatedSkills.length > 0 ? `WEAKNESS-RELATED COMPANY SKILLS: ${weaknessRelatedSkills.slice(0, 8).join(", ")}` : ''}

${otherCompanySkills.length > 0 ? `OTHER COMPANY REQUIREMENTS: ${otherCompanySkills.slice(0, 10).join(", ")}` : ''}

LEARNING PROFILE:
${learningProfile?.summary || "No prior learning history."}
${learningProfile?.regenerationContext || ''}

${balancedApproach ? `
⚖️ BALANCED APPROACH REQUIRED:
Create queries that cover BOTH:
- Weak concepts from quiz failures (50% of queries)
- General company requirements and topics (50% of queries)
` : ''}

Create a compact retrieval plan with targeted search queries focusing on:
${balancedApproach ? `
1. Weak concepts from quiz failures (half of queries)
2. Company requirements not related to weaknesses (half of queries)
3. Ensure balanced coverage of both areas
` : `
1. Weak concepts identified from quiz failures
2. Company-specific implementations of those concepts
3. Skills from company documentation related to weak areas
`}

Return JSON only:
{
  "queries": ["string"],
  "focusAreas": ["string"],
  "priority": "high|medium|low"
}

Constraints:
- 2 to ${PLAN_MAX_QUERIES} queries
${balancedApproach ? '- Split queries 50/50: half for weaknesses, half for company requirements' : '- Prioritize queries about weak concepts in company context'}
- Keep queries concise and specific to the domain
- Output valid JSON only
`;

  try {
    const result = await generateRoadmapModel(prompt);
    const text = result?.response?.text()?.trim() || "";
    const parsed = safeParseJson(text);
    const queries = Array.isArray(parsed?.queries) ? parsed.queries.slice(0, PLAN_MAX_QUERIES) : [];
    const focusAreas = Array.isArray(parsed?.focusAreas) ? parsed.focusAreas.slice(0, 8) : [];
    if (queries.length >= 2) {
      return { queries, focusAreas, priority: parsed?.priority || "high" };
    }
  } catch (err) {
    console.warn("Roadmap plan generation failed, using fallback plan:", err.message);
  }

  return {
    queries: [
      `${trainingOn} best practices`,
      `${trainingOn} procedures and standards`,
      `${trainingOn} real-world scenarios`,
    ],
    focusAreas: ["fundamentals", "procedures", "best practices", "scenarios"],
    priority: "high",
  };
}

async function fetchPlannedDocs({ queries, companyId, deptName }) {
  const results = [];
  for (const queryText of queries) {
    try {
      const docs = await retrieveDeptDocsFromPinecone({ queryText, companyId, deptName });
      results.push(...docs);
    } catch (err) {
      console.warn(`Planned retrieval failed for query "${queryText}":`, err.message);
    }
  }
  return results;
}

async function buildLearningProfile({ userRef, moduleId = null }) {
  try {
    const roadmapSnap = await userRef.collection("roadmap").orderBy("createdAt", "desc").limit(5).get();
    if (roadmapSnap.empty) {
      return { 
        summary: "No prior learning history.", 
        strugglingAreas: [], 
        masteredTopics: [], 
        avgScore: null,
        quizAttempts: [],
        wrongQuestions: [],
        weakConcepts: []
      };
    }

    const memorySnaps = await Promise.all(
      roadmapSnap.docs.map((doc) => doc.ref.collection("agentMemory").doc("summary").get())
    );

    const summaries = [];
    const strugglingAreas = [];
    const masteredTopics = [];
    const scores = [];
    const allQuizAttempts = [];
    const wrongQuestions = [];
    const weakConceptsMap = new Map();

    // Collect memory data
    for (const snap of memorySnaps) {
      if (!snap.exists) continue;
      const data = snap.data() || {};
      if (data.summary) summaries.push(data.summary);
      if (Array.isArray(data.strugglingAreas)) strugglingAreas.push(...data.strugglingAreas);
      if (Array.isArray(data.masteredTopics)) masteredTopics.push(...data.masteredTopics);
      if (Number.isFinite(data.lastQuizScore)) scores.push(data.lastQuizScore);
    }

    // Analyze quiz attempts for weakness patterns
    for (const moduleDoc of roadmapSnap.docs) {
      const quizAttemptsSnap = await moduleDoc.ref
        .collection("quiz")
        .doc("current")
        .collection("quizAttempts")
        .orderBy("attemptNumber", "desc")
        .limit(3)
        .get();

      for (const attemptDoc of quizAttemptsSnap.docs) {
        const attemptData = attemptDoc.data();
        allQuizAttempts.push({
          moduleId: moduleDoc.id,
          moduleTitle: moduleDoc.data().moduleTitle,
          score: attemptData.score,
          attemptNumber: attemptData.attemptNumber,
          submittedAt: attemptData.submittedAt,
        });

        // Analyze results to find wrong questions
        const resultsSnap = await moduleDoc.ref
          .collection("quiz")
          .doc("current")
          .collection("results")
          .doc("latest")
          .get();

        if (resultsSnap.exists) {
          const results = resultsSnap.data();
          
          // Collect wrong MCQ questions
          if (Array.isArray(results.mcq)) {
            results.mcq.forEach(q => {
              if (!q.isCorrect) {
                wrongQuestions.push({
                  type: "MCQ",
                  question: q.question,
                  correctAnswer: q.correctAnswer,
                  moduleTitle: moduleDoc.data().moduleTitle,
                });
                // Extract concepts from wrong questions
                const concepts = extractConceptsFromQuestion(q.question);
                concepts.forEach(concept => {
                  weakConceptsMap.set(concept, (weakConceptsMap.get(concept) || 0) + 1);
                });
              }
            });
          }

          // Collect wrong one-liner questions
          if (Array.isArray(results.oneLiners)) {
            results.oneLiners.forEach(q => {
              if (!q.isCorrect) {
                wrongQuestions.push({
                  type: "One-Liner",
                  question: q.question,
                  correctAnswer: q.correctAnswer,
                  moduleTitle: moduleDoc.data().moduleTitle,
                });
                const concepts = extractConceptsFromQuestion(q.question);
                concepts.forEach(concept => {
                  weakConceptsMap.set(concept, (weakConceptsMap.get(concept) || 0) + 1);
                });
              }
            });
          }

          // Collect failed coding questions
          if (Array.isArray(results.coding)) {
            results.coding.forEach(q => {
              if (!q.isCorrect || (q.score && q.score < 70)) {
                wrongQuestions.push({
                  type: "Coding",
                  question: q.question,
                  feedback: q.feedback,
                  improvements: q.improvements,
                  moduleTitle: moduleDoc.data().moduleTitle,
                });
                const concepts = extractConceptsFromQuestion(q.question);
                concepts.forEach(concept => {
                  weakConceptsMap.set(concept, (weakConceptsMap.get(concept) || 0) + 2); // Weight coding more
                });
              }
            });
          }
        }
      }
    }

    // Sort weak concepts by frequency
    const weakConcepts = Array.from(weakConceptsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([concept, count]) => ({ concept, frequency: count }));

    const uniqueStruggling = Array.from(new Set([...strugglingAreas, ...weakConcepts.map(w => w.concept)])).slice(0, 15);
    const uniqueMastered = Array.from(new Set(masteredTopics)).slice(0, 12);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    return {
      summary: summaries.join(" | ").substring(0, 800) || "No prior learning history.",
      strugglingAreas: uniqueStruggling,
      masteredTopics: uniqueMastered,
      avgScore,
      quizAttempts: allQuizAttempts,
      wrongQuestions: wrongQuestions.slice(0, 20), // Last 20 wrong questions
      weakConcepts: weakConcepts,
      totalAttempts: allQuizAttempts.length,
    };
  } catch (err) {
    console.warn("Failed to build learning profile:", err.message);
    return { 
      summary: "No prior learning history.", 
      strugglingAreas: [], 
      masteredTopics: [], 
      avgScore: null,
      quizAttempts: [],
      wrongQuestions: [],
      weakConcepts: []
    };
  }
}

function extractConceptsFromQuestion(questionText) {
  if (!questionText) return [];
  
  // Extract technical terms (capitalized words, camelCase, technical patterns)
  const concepts = [];
  
  // Match capitalized words (like React, JavaScript, API)
  const capitalizedWords = questionText.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g) || [];
  concepts.push(...capitalizedWords);
  
  // Match common technical terms
  const technicalTerms = questionText.match(/\b(function|class|object|array|string|method|property|component|hook|state|props|async|await|promise|callback|API|REST|HTTP|JSON|CSS|HTML|DOM|event|handler|lifecycle|render|virtual|real)\b/gi) || [];
  concepts.push(...technicalTerms);
  
  // Remove duplicates and return lowercase
  return Array.from(new Set(concepts.map(c => c.toLowerCase()))).filter(c => c.length > 2);
}

async function critiqueRoadmap({ trainingOn, modules, trainingDuration }) {
  const prompt = `
You are a strict roadmap quality auditor.

DOMAIN: "${trainingOn}"
TIME CONSTRAINT: ${trainingDuration}

ROADMAP JSON:
${JSON.stringify(modules)}

Check for:
- Logical progression from fundamentals to advanced
- Estimated days sum fits the time constraint
- Descriptions include 2-3 specific sub-topics or tools
- No duplicate module titles

Return JSON only:
{
  "pass": true|false,
  "issues": ["string"],
  "score": 0-100
}
`;

  try {
    const result = await generateRoadmapModel(prompt);
    const text = result?.response?.text()?.trim() || "";
    const parsed = safeParseJson(text);
    if (typeof parsed?.pass === "boolean") {
      return parsed;
    }
  } catch (err) {
    console.warn("Roadmap critique failed:", err.message);
  }

  return { pass: isRoadmapComplete(modules), issues: ["Critique unavailable"], score: isRoadmapComplete(modules) ? 80 : 40 };
}

async function refineRoadmap({ trainingOn, modules, issues, trainingDuration }) {
  const prompt = `
You are a curriculum editor. Fix the roadmap issues below.

DOMAIN: "${trainingOn}"
TIME CONSTRAINT: ${trainingDuration}

ISSUES:
${(issues || []).map((issue) => `- ${issue}`).join("\n")}

CURRENT ROADMAP JSON:
${JSON.stringify(modules)}

Return ONLY the corrected JSON array with this schema:
[
  {
    "moduleTitle": "string",
    "description": "string",
    "estimatedDays": number,
    "skillsCovered": ["skill1", "skill2", "skill3"]
  }
]
`;

  try {
    const result = await generateRoadmapModel(prompt);
    const text = result?.response?.text()?.trim() || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return normalizeRoadmapModules(parsed);
  } catch (err) {
    console.warn("Roadmap refinement failed:", err.message);
    return normalizeRoadmapModules(modules);
  }
}

async function generateRoadmapAgentic({
  cvText,
  pineconeContext,
  companyContext,
  expertise,
  trainingOn,
  level,
  trainingDuration,
  skillGap,
  learningProfile,
  planFocusAreas,
}) {
  let lastModules = null;
  let critique = null;

  for (let attempt = 0; attempt < ROADMAP_MAX_RETRIES; attempt += 1) {
    const modules = await generateRoadmap({
      cvText,
      pineconeContext,
      companyContext,
      expertise,
      trainingOn,
      trainingLevel: level,
      trainingDuration,
      skillGap,
      learningProfile,
      planFocusAreas,
    });

    const normalized = normalizeRoadmapModules(modules);
    const durationDays = parseTrainingDurationDays(trainingDuration);
    const adjusted = enforceTrainingDuration(normalized, durationDays);
    lastModules = adjusted;
    if (!isRoadmapComplete(normalized)) {
      critique = { pass: false, issues: ["Incomplete roadmap structure"], score: 40 };
      continue;
    }

    critique = await critiqueRoadmap({ trainingOn, modules: adjusted, trainingDuration: durationDays || trainingDuration });
    if (critique?.pass) {
      return { modules: adjusted, critique };
    }

    const refined = await refineRoadmap({
      trainingOn,
      modules: adjusted,
      issues: critique?.issues,
      trainingDuration: durationDays || trainingDuration,
    });

    const refinedAdjusted = enforceTrainingDuration(refined, durationDays);
    lastModules = refinedAdjusted;
    const refinedCritique = await critiqueRoadmap({ trainingOn, modules: refinedAdjusted, trainingDuration: durationDays || trainingDuration });
    if (refinedCritique?.pass) {
      return { modules: refinedAdjusted, critique: refinedCritique };
    }
  }

  if (lastModules) {
    return { modules: lastModules, critique: critique || { pass: false, issues: ["Fallback roadmap"], score: 50 } };
  }

  throw new Error("Failed to generate a valid roadmap");
}

export const generateUserRoadmap = async (req, res) => {
  console.log("🚀 Roadmap generation request received");
  console.log("📦 Request body:", req.body);

  let lockAcquired = false;

  try {
    const {
      companyId,
      deptId,
      userId,
      trainingTime,
      trainingOn: trainingOnFromClient,
      expertiseScore,
    } = req.body;

    console.log("👤 Fetching user from Firestore...");

    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      console.error("❌ User not found");
      return res.status(404).json({ error: "User not found" });
    }

    const user = userSnap.data();
    console.log("✅ User fetched:", user.name);

    if (!user.onboarding?.onboardingCompleted || !user.cvUrl) {
      console.warn("⚠️ Onboarding incomplete or CV missing");
      return res.status(400).json({ error: "Onboarding incomplete" });
    }

    const existingRoadmapSnap = await userRef.collection("roadmap").get();
    if (!existingRoadmapSnap.empty) {
      return res.json({
        success: true,
        modules: mapRoadmapSnapshot(existingRoadmapSnap),
        reused: true,
      });
    }

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return;
      const data = snap.data() || {};
      const lock = data.roadmapGenerationLock || {};
      const now = Date.now();
      const expiresAt = lock.expiresAt?.toDate ? lock.expiresAt.toDate().getTime() : lock.expiresAt;

      if (expiresAt && expiresAt > now) {
        return;
      }

      tx.set(userRef, {
        roadmapGenerationLock: {
          startedAt: new Date(now),
          expiresAt: new Date(now + ROADMAP_LOCK_TTL_MS),
        },
      }, { merge: true });

      lockAcquired = true;
    });

    if (!lockAcquired) {
      return res.status(409).json({
        error: "Roadmap generation already in progress",
      });
    }

  // 1️⃣ Fetch onboarding duration
const onboardingRef = db
  .collection("companies")
  .doc(companyId)
  .collection("onboardingAnswers");

const onboardingSnap = await onboardingRef
  .orderBy("createdAt", "desc") // 🔥 KEY FIX
  .limit(1)
  .get();

let trainingDurationFromOnboarding = null;

if (!onboardingSnap.empty) {
  const data = onboardingSnap.docs[0].data();
  trainingDurationFromOnboarding = data?.answers?.["2"] || data?.answers?.[2] || data?.answers?.["1"] || null;
}

console.log("🎯 Training duration from onboarding:", trainingDurationFromOnboarding);

    const trainingOn = trainingOnFromClient || user.trainingOn || "General";
    const expertise = expertiseScore ?? user.expertise ?? 1;
    const level = user.trainingLevel || "Beginner";
    const finalTrainingDuration =
      trainingDurationFromOnboarding || user.trainingDurationFromOnboarding || trainingTime || null;

    console.log("🎯 FINAL VALUES USED:", {
      trainingOn,
      expertise,
      level,
      trainingDuration: finalTrainingDuration,
    });

    /* --------------------------------------------------
       3️⃣ Download & Extract CV
    -------------------------------------------------- */
    console.log("📄 Parsing CV with agentic parser:", user.cvUrl);
    const cvParseResult = await parseCvFromUrl(user.cvUrl);
    const cvText = cvParseResult?.rawText || "";

    if (!cvText || typeof cvText !== "string") {
      throw new Error("❌ CV text extraction failed");
    }

    console.log("✅ CV text extracted, length:", cvText.length);
    const structuredCv = cvParseResult?.structured || null;

    /* --------------------------------------------------
       4️⃣ 🤖 Agentic Skill Extraction (CV + Company Docs)
    -------------------------------------------------- */
    console.log("🤖 Starting agentic skill extraction...");

    // Fetch Pinecone documents for company context
    console.log("🔎 Fetching Pinecone documents for company context...");
    const basePineconeContext = await retrieveDeptDocsFromPinecone({
      queryText: cvText,
      companyId,
      deptName: deptId,
    });

    if (!Array.isArray(basePineconeContext)) {
      console.warn("⚠️ Pinecone returned empty or invalid context");
    }

    const baseDocsText = Array.isArray(basePineconeContext)
      ? basePineconeContext.map((c) => c.text || "").join("\n")
      : "";

    // Use agentic skill extraction
    const {
      cvSkills,
      companySkills,
      skillGap,
      criticalGaps,
      extractionDetails,
    } = await extractSkillsAgentically({
      cvText,
      companyDocsText: baseDocsText,
      expertise,
      trainingOn,
    });

    console.log("✅ Agentic skill extraction complete");
    console.log("📄 Skills from CV:", cvSkills);
    console.log("📚 Skills from company docs:", companySkills);
    console.log("⚡ Skill gaps identified:", skillGap);
    console.log("🔴 Critical gaps:", criticalGaps);
    console.log("📊 Extraction details:", extractionDetails);

    /* --------------------------------------------------
       5️⃣ Build Learning Profile + Generate Agentic Plan
    -------------------------------------------------- */
    console.log("🧩 Building learning profile...");
    const learningProfile = await buildLearningProfile({ userRef });
    console.log("✅ Learning profile loaded");

    console.log("🧭 Generating agentic roadmap plan...");
    const plan = await generateRoadmapPlan({
      trainingOn,
      cvText,
      skillGap,
      learningProfile,
    });
    console.log(`✅ Roadmap plan created with ${plan.queries.length} queries`);

    /* --------------------------------------------------
       6️⃣ Multi-Query Retrieval for Enhanced Company Context
    -------------------------------------------------- */
    console.log("📚 Fetching additional company docs based on planned queries...");
    const plannedDocs = await fetchPlannedDocs({
      queries: plan.queries,
      companyId,
      deptName: deptId,
    });

    const mergedDocs = mergeDocs([...(basePineconeContext || []), ...plannedDocs]);
    const companyDocsText = truncateText(
      mergedDocs.map((c) => c.text || "").join("\n"),
      MAX_CONTEXT_CHARS
    );
    console.log("✅ Merged and contextualized company documentation");

    /* --------------------------------------------------
       7️⃣ Generate Roadmap via Agentic AI
       (Skills extracted by agentic agents above)
    -------------------------------------------------- */
    console.log("🤖 Generating personalized roadmap via agentic AI...");

    const companyContext = `COMPANY DOCUMENTS:\n${companyDocsText || "No company documents available."}`;
    const { modules: roadmapModules, critique } = await generateRoadmapAgentic({
      cvText,
      pineconeContext: mergedDocs,
      companyContext,
      expertise,
      trainingOn,
      level,
      trainingDuration: finalTrainingDuration,
      skillGap,
      learningProfile: {
        ...learningProfile,
        structuredCv,
      },
      planFocusAreas: plan.focusAreas,
    });

    if (!Array.isArray(roadmapModules)) {
      throw new Error("❌ LLM did not return roadmap modules");
    }

    console.log("✅ Roadmap generated, modules:", roadmapModules.length);

    try {
      await userRef.set({
        roadmapAgentic: {
          planQueries: plan.queries,
          planFocusAreas: plan.focusAreas,
          critiqueScore: critique?.score || null,
          critiquePass: critique?.pass || false,
          // 🤖 Agentic Skill Extraction Results
          extractedSkills: {
            cvSkills,
            companySkills,
            skillGap,
            criticalGaps,
            extractionDetails,
          },
          learningProfile: {
            summary: learningProfile.summary,
            strugglingAreas: learningProfile.strugglingAreas,
            masteredTopics: learningProfile.masteredTopics,
            avgScore: learningProfile.avgScore,
          },
          generatedAt: new Date(),
        },
      }, { merge: true });
    } catch (err) {
      console.warn("⚠️ Failed to store roadmap agentic metadata:", err.message || err);
    }

     /* --------------------------------------------------
       8️⃣ Save Roadmap to Firestore with Extracted Skills
     -------------------------------------------------- */
    console.log("💾 Saving roadmap with agentic skill extraction metadata to Firestore...");

    const roadmapCollection = userRef.collection("roadmap");

    for (let i = 0; i < roadmapModules.length; i++) {
      await roadmapCollection.add({
        ...roadmapModules[i],
        skillsCovered: roadmapModules[i].skillsCovered || [],
        // Include skill extraction context
        skillExtractionContext: {
          cvSkillsCount: cvSkills.length,
          companySkillsCount: companySkills.length,
          skillGapCount: skillGap.length,
          criticalGapsCount: criticalGaps.length,
        },
        order: i + 1,
        completed: false, 
        status: "pending",
        createdAt: new Date(),
        FirstTimeCreatedAt: new Date(),
      });
    }

    // Initialize progress on user document to 0
    try {
      await userRef.update({ progress: 0 });
    } catch (err) {
      console.warn("⚠️ Failed to set initial progress on user doc:", err.message || err);
    }
    console.log("🎉 Roadmap saved successfully");

    // Get company details once for email + calendar scheduling
    let companyName = "Your Company";
    try {
      const companyRef = db.collection("companies").doc(companyId);
      const companySnap = await companyRef.get();
      companyName = companySnap.exists ? companySnap.data().name || "Your Company" : "Your Company";
    } catch (err) {
      console.warn("⚠️ Failed to fetch company name:", err.message || err);
    }

    // 📧 Send notifications (simplified: one calendar event + daily reminders)
    try {
      console.log("📧 Generating PDF and scheduling notifications...");
      
      // Generate PDF
      const pdfBuffer = await generateRoadmapPDF({
        userName: user.name || "Trainee",
        companyName: companyName,
        trainingTopic: trainingOn,
        modules: roadmapModules,
      });
      
      // Handle roadmap generation: sends email + creates ONE recurring calendar event
      const notificationResult = await handleRoadmapGenerated({
        companyId,
        deptId,
        userId: user.userId,
        userEmail: user.email,        // Using actual user email
        userName: user.name,
        companyName,
        trainingTopic: trainingOn,
        modules: roadmapModules,
        pdfBuffer,
      });

      if (notificationResult?.calendarEventCreated) {
        console.log(`✅ Roadmap notifications scheduled for ${user.email}`);
      } else {
        console.warn(
          `⚠️ Roadmap email sent but calendar scheduling failed for ${user.email}: ${notificationResult?.calendarError || "unknown error"}`
        );
      }
    } catch (notificationErr) {
      console.warn("⚠️ Notification sending failed (non-critical):", notificationErr.message);
      // Don't fail the request if notifications fail
    }

    return res.json({
      success: true,
      modules: roadmapModules,
    });

  } catch (error) {
    console.error("🔥 Roadmap generation failed:");
    console.error(error);
    return res.status(500).json({
      error: error.message || "Roadmap generation failed",
    });
  } finally {
    if (lockAcquired) {
      try {
        await db
          .collection("freshers")
          .doc(req.body.companyId)
          .collection("departments")
          .doc(req.body.deptId)
          .collection("users")
          .doc(req.body.userId)
          .set({ roadmapGenerationLock: null }, { merge: true });
      } catch (err) {
        console.warn("⚠️ Failed to clear roadmap lock:", err.message || err);
      }
    }
  }
};

function splitDaysEvenly(totalDays, parts) {
  const safeParts = Math.max(1, Math.floor(parts || 1));
  const safeTotal = Math.max(safeParts, Math.floor(totalDays || safeParts));
  const base = Math.floor(safeTotal / safeParts);
  const remainder = safeTotal % safeParts;

  return Array.from({ length: safeParts }, (_, index) => base + (index < remainder ? 1 : 0));
}

function buildFallbackRegeneratedModules({ moduleTitle, moduleDescription, splitCount, splitDays, weakConcepts }) {
  const baseTitle = moduleTitle || "Module";
  const conceptList = Array.isArray(weakConcepts) ? weakConcepts.slice(0, 8) : [];

  return Array.from({ length: splitCount }, (_, index) => {
    const phase = index + 1;
    const conceptSlice = conceptList.slice(index * 3, index * 3 + 3);
    return {
      moduleTitle: `${baseTitle} - Recovery Part ${phase}`,
      description:
        moduleDescription ||
        `Focused remediation module part ${phase} to strengthen quiz weak areas before progression.`,
      estimatedDays: splitDays[index] || 1,
      skillsCovered: conceptSlice.length ? conceptSlice : ["concept reinforcement", "applied practice", "assessment readiness"],
    };
  });
}

async function fetchModuleFailureInsights({ userRef, moduleId }) {
  const moduleRef = userRef.collection("roadmap").doc(moduleId);
  const moduleSnap = await moduleRef.get();

  if (!moduleSnap.exists) {
    throw new Error("Module not found");
  }

  const moduleData = moduleSnap.data() || {};

  const attemptsSnap = await moduleRef
    .collection("quiz")
    .doc("current")
    .collection("quizAttempts")
    .orderBy("attemptNumber", "desc")
    .limit(6)
    .get();

  const attempts = attemptsSnap.docs.map((doc) => doc.data() || {});
  const failedAttempts = attempts.filter((attempt) => !attempt.passed).length;
  const latestAttempt = attempts[0] || null;

  const latestResultSnap = await moduleRef
    .collection("quiz")
    .doc("current")
    .collection("results")
    .doc("latest")
    .get();

  const latestResult = latestResultSnap.exists ? latestResultSnap.data() || {} : {};
  const wrongQuestions = [];

  const collectWrong = (arr, type) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item?.isCorrect) {
        wrongQuestions.push({
          type,
          question: item.question || "",
          correctAnswer: item.correctAnswer || "",
        });
      }
    }
  };

  collectWrong(latestResult.mcq, "MCQ");
  collectWrong(latestResult.oneLiners, "One-Liner");
  collectWrong(latestResult.coding, "Coding");

  const weakConceptSet = new Set();
  for (const wrong of wrongQuestions) {
    extractConceptsFromQuestion(wrong.question).forEach((concept) => weakConceptSet.add(concept));
  }

  const weakConcepts = Array.from(weakConceptSet).slice(0, 12);
  const latestScore = Number.isFinite(latestResult.score)
    ? latestResult.score
    : Number.isFinite(latestAttempt?.score)
      ? latestAttempt.score
      : null;

  return {
    moduleRef,
    moduleData,
    latestScore,
    failedAttempts,
    totalAttempts: attempts.length,
    weakConcepts,
    wrongQuestions: wrongQuestions.slice(0, 12),
  };
}

async function generateRegeneratedSubmodules({
  targetModule,
  weakConcepts,
  wrongQuestions,
  splitCount,
  splitDays,
  learningProfile,
}) {
  const prompt = `
You are an AI curriculum recovery planner.

Goal:
- Regenerate ONLY the failed module into exactly ${splitCount} focused recovery modules.
- Keep sequence pedagogically progressive.
- Each module must target weak areas from failed quiz questions.
- Total modules must be ${splitCount} (no more, no less).
- Keep estimatedDays close to this distribution: ${JSON.stringify(splitDays)}

Failed Module:
${JSON.stringify({
  moduleTitle: targetModule.moduleTitle,
  description: targetModule.description,
  skillsCovered: targetModule.skillsCovered || [],
  estimatedDays: targetModule.estimatedDays || 1,
})}

Weak Concepts:
${JSON.stringify(weakConcepts || [])}

Wrong Questions (sample):
${JSON.stringify((wrongQuestions || []).slice(0, 8))}

Learning Profile Context:
${JSON.stringify({
  summary: learningProfile?.summary || "",
  avgScore: learningProfile?.avgScore ?? null,
  strugglingAreas: learningProfile?.strugglingAreas || [],
}, null, 2)}

Return JSON only as array with this schema:
[
  {
    "moduleTitle": "string",
    "description": "string",
    "estimatedDays": number,
    "skillsCovered": ["skill1", "skill2", "skill3"]
  }
]

Constraints:
- Exactly ${splitCount} items
- estimatedDays positive integers
- Focus on weakness remediation + practical application
- Do not include markdown or extra text
`;

  try {
    const llmResponse = await generateRoadmapModel(prompt);
    const llmText = llmResponse?.response?.text()?.trim() || "";
    const parsed = JSON.parse(llmText.replace(/```json|```/g, "").trim());
    const normalized = normalizeRoadmapModules(parsed);

    if (normalized.length !== splitCount) {
      throw new Error("Regenerated module count mismatch");
    }

    const adjusted = normalized.map((module, index) => ({
      ...module,
      estimatedDays: splitDays[index] || module.estimatedDays || 1,
    }));

    return adjusted;
  } catch (err) {
    console.warn("Regenerated submodule AI generation failed, using fallback:", err.message);
    return buildFallbackRegeneratedModules({
      moduleTitle: targetModule.moduleTitle,
      moduleDescription: targetModule.description,
      splitCount,
      splitDays,
      weakConcepts,
    });
  }
}

export const regenerateRoadmapModule = async (req, res) => {
  try {
    const { companyId, deptId, userId, moduleId, notificationId } = req.body || {};

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

    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const roadmapSnap = await userRef.collection("roadmap").orderBy("order").get();
    if (roadmapSnap.empty) {
      return res.status(404).json({ error: "Roadmap not found" });
    }

    const roadmapModules = roadmapSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const targetIndex = roadmapModules.findIndex((module) => module.id === moduleId);

    if (targetIndex === -1) {
      return res.status(404).json({ error: "Target module not found in roadmap" });
    }

    const targetModule = roadmapModules[targetIndex];
    const targetOrder = targetModule.order || targetIndex + 1;

    if (targetModule.completed && targetModule.quizPassed) {
      return res.status(400).json({ error: "Cannot regenerate a completed module" });
    }

    const rawStartDate = targetModule.startedAt || targetModule.FirstTimeCreatedAt || targetModule.createdAt || null;
    const moduleStartDate = rawStartDate?.toDate ? rawStartDate.toDate() : rawStartDate ? new Date(rawStartDate) : null;
    const estimatedDays = Math.max(1, Number(targetModule.estimatedDays) || 1);

    let daysLeft = estimatedDays;
    if (moduleStartDate && !Number.isNaN(moduleStartDate.getTime())) {
      const elapsedMs = Date.now() - moduleStartDate.getTime();
      const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
      daysLeft = Math.max(1, estimatedDays - elapsedDays);
    }

    const [moduleInsights, learningProfile] = await Promise.all([
      fetchModuleFailureInsights({ userRef, moduleId }),
      buildLearningProfile({ userRef, moduleId }),
    ]);

    const weakConceptCount = moduleInsights.weakConcepts.length;
    const lowScore = Number.isFinite(moduleInsights.latestScore) && moduleInsights.latestScore < 55;
    const severeAttempts = moduleInsights.failedAttempts >= 3;

    const splitCount = lowScore || severeAttempts || weakConceptCount >= 4 ? 3 : 2;
    const cappedSplitCount = Math.min(3, Math.max(2, splitCount));

    const originalDays = Math.max(1, Number(targetModule.estimatedDays) || 1);
    const adaptiveExtraDays = lowScore && severeAttempts ? 2 : lowScore || severeAttempts ? 1 : 0;
    const baseDaysForRegeneration = Math.max(daysLeft, Math.ceil(originalDays * 0.6));
    const regeneratedTotalDays = Math.max(cappedSplitCount, baseDaysForRegeneration + adaptiveExtraDays);
    const splitDays = splitDaysEvenly(regeneratedTotalDays, cappedSplitCount);

    const regeneratedModules = await generateRegeneratedSubmodules({
      targetModule,
      weakConcepts: moduleInsights.weakConcepts,
      wrongQuestions: moduleInsights.wrongQuestions,
      splitCount: cappedSplitCount,
      splitDays,
      learningProfile,
    });

    const orderShift = cappedSplitCount - 1;
    const now = new Date();

    const targetDocRef = userRef.collection("roadmap").doc(moduleId);
    await db.recursiveDelete(targetDocRef);

    const newModuleRefs = [];
    for (let index = 0; index < regeneratedModules.length; index += 1) {
      const regenerated = regeneratedModules[index];
      const newRef = userRef.collection("roadmap").doc();
      newModuleRefs.push(newRef);

      await newRef.set({
        ...regenerated,
        order: targetOrder + index,
        completed: false,
        quizPassed: false,
        quizAttempts: 0,
        status: index === 0 ? "in-progress" : "pending",
        progress: 0,
        quizLocked: false,
        moduleLocked: false,
        requiresAdminContact: false,
        createdAt: now,
        FirstTimeCreatedAt: now,
        startedAt: index === 0 ? now : null,
        regeneratedFromModuleId: moduleId,
        regeneratedBy: "admin",
        regenerationIndex: index + 1,
        regenerationTotalParts: regeneratedModules.length,
      });
    }

    const modulesAfterTarget = roadmapModules.filter((module) => (module.order || 0) > targetOrder);
    for (const module of modulesAfterTarget) {
      const updateData = { order: (module.order || 0) + orderShift };

      if (!module.completed) {
        updateData.status = "pending";
        updateData.startedAt = null;
        updateData.quizLocked = false;
        updateData.moduleLocked = false;
        updateData.requiresAdminContact = false;
      }

      await userRef.collection("roadmap").doc(module.id).set(updateData, { merge: true });
    }

    await userRef.set(
      {
        trainingLocked: false,
        trainingLockedAt: null,
        trainingLockedReason: null,
        requiresAdminContact: false,
        roadmapRegenerated: true,
        roadmapRegeneratedAt: now,
        weaknessAnalysis: {
          sourceModuleId: moduleId,
          sourceModuleTitle: targetModule.moduleTitle || "",
          latestScore: moduleInsights.latestScore,
          failedAttempts: moduleInsights.failedAttempts,
          weakConcepts: moduleInsights.weakConcepts,
          wrongQuestions: moduleInsights.wrongQuestions,
          regeneratedParts: regeneratedModules.length,
          originalEstimatedDays: originalDays,
          daysLeftAtRegeneration: daysLeft,
          regeneratedDays: regeneratedTotalDays,
          generatedAt: now,
        },
      },
      { merge: true }
    );

    if (notificationId) {
      await db
        .collection("companies")
        .doc(companyId)
        .collection("adminNotifications")
        .doc(notificationId)
        .set(
          {
            status: "approved",
            adminAction: "roadmap_regenerated",
            resolvedAt: now,
          },
          { merge: true }
        );
    }

    return res.json({
      success: true,
      message: "Module regenerated successfully",
      splitCount: regeneratedModules.length,
      regeneratedTotalDays,
      newModuleIds: newModuleRefs.map((ref) => ref.id),
    });
  } catch (error) {
    console.error("🔥 Roadmap regeneration failed:", error);
    return res.status(500).json({
      error: error.message || "Roadmap regeneration failed",
    });
  }
};



