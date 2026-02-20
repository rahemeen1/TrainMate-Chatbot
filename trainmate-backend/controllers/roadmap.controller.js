// trainmate-backend/controllers/roadmap.controller.js
import { db } from "../config/firebase.js";
import { parseCvFromUrl } from "../services/cvParser.service.js";
import { retrieveDeptDocsFromPinecone } from "../services/pineconeService.js";
import { generateRoadmap } from "../services/llmService.js";
import { extractSkillsFromText } from "../services/skillExtractor.service.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sendRoadmapEmail } from "../services/emailService.js";
import { generateRoadmapPDF } from "../services/pdfService.js";
import { createDailyModuleReminder, createQuizUnlockReminder, createRoadmapGeneratedEvent } from "../services/calendarService.js";

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

function parseTrainingDurationDays(value) {
  if (value === null || value === undefined) return null;
  // Training duration is always in months - convert to days (1 month = 30 days)
  let months;
  if (Number.isFinite(value)) {
    months = value;
  } else {
    const match = String(value).match(/\d+/);
    if (!match) return null;
    months = parseInt(match[0], 10);
  }
  if (!Number.isFinite(months)) return null;
  return Math.max(1, Math.round(months * 30));
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

  try {
    const {
      companyId,
      deptId,
      userId,
      trainingTime,
      trainingOn: trainingOnFromClient,
      expertiseScore,
      expertiseLevel,
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
  trainingDurationFromOnboarding = data?.answers?.["1"] || null; 
}

console.log("🎯 Training duration from onboarding:", trainingDurationFromOnboarding);

    const trainingOn = trainingOnFromClient || user.trainingOn || "General";
    const expertise = expertiseScore ?? user.expertise ?? 1;
    const level = user.trainingLevel || expertiseLevel || "Beginner";
    const finalTrainingDuration = parseTrainingDurationDays(trainingDurationFromOnboarding)
      || parseTrainingDurationDays(trainingTime)
      || parseTrainingDurationDays(user.trainingDuration);

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
       4️⃣ Extract Skills from CV
    -------------------------------------------------- */
    console.log("🧠 Extracting skills from CV...");
    const cvSkills = extractSkillsFromText(cvText);
    console.log("📄 Skills extracted from CV:", cvSkills);

    /* --------------------------------------------------
       5️⃣ Fetch Department Docs (base) + Learning Profile
    -------------------------------------------------- */
    console.log("🔎 Fetching Pinecone documents...");

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

    const baseCompanySkills = extractSkillsFromText(baseDocsText);
    const baseSkillGap = baseCompanySkills.filter((skill) => !cvSkills.includes(skill));
    console.log(`📚 Pinecone skills for ${deptId}:`, baseCompanySkills);
    console.log("⚡ Base skill gap identified:", baseSkillGap);

    const learningProfile = await buildLearningProfile({ userRef });
    console.log("🧩 Learning profile loaded");

    /* --------------------------------------------------
       6️⃣ Agentic Plan + Multi-Query Retrieval
    -------------------------------------------------- */
    const plan = await generateRoadmapPlan({
      trainingOn,
      cvText,
      skillGap: baseSkillGap,
      learningProfile,
    });
    console.log(`🧭 Roadmap plan created with ${plan.queries.length} queries`);

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

    /* --------------------------------------------------
       7️⃣ Extract Company Skills + Skill Gap (refined)
    -------------------------------------------------- */
    const companySkills = extractSkillsFromText(companyDocsText);
    const skillGap = companySkills.filter((skill) => !cvSkills.includes(skill));
    console.log("⚡ Refined skill gap identified:", skillGap);

    /* --------------------------------------------------
       8️⃣ Generate Roadmap via Agentic Loop
    -------------------------------------------------- */
    console.log("🤖 Generating roadmap via agentic loop...");

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
       9️⃣ Save Roadmap to Firestore
     -------------------------------------------------- */
    console.log("💾 Saving roadmap to Firestore...");

    const roadmapCollection = userRef.collection("roadmap");

    for (let i = 0; i < roadmapModules.length; i++) {
      await roadmapCollection.add({
        ...roadmapModules[i],
        skillsCovered: roadmapModules[i].skillsCovered || [],
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

    // 📧 Send email with PDF attachment (async, non-blocking)
    try {
      console.log("📧 Generating PDF and sending email...");
      
      // Generate PDF
      const pdfBuffer = await generateRoadmapPDF({
        userName: user.name || "Trainee",
        companyName: companyName,
        trainingTopic: trainingOn,
        modules: roadmapModules,
      });
      
      // Send email
      if (user.email) {
        await sendRoadmapEmail({
          userEmail: user.email,
          userName: user.name || "Trainee",
          companyName: companyName,
          trainingTopic: trainingOn,
          moduleCount: roadmapModules.length,
          pdfBuffer: pdfBuffer,
        });
        console.log("✅ Roadmap email sent successfully to:", user.email);

        try {
          const timeZone = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
          const reminderTime = process.env.DAILY_REMINDER_TIME || "22:15";
          const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

          await createRoadmapGeneratedEvent({
            calendarId,
            userName: user.name || "Trainee",
            companyName,
            trainingTopic: trainingOn,
            generatedAt: new Date(),
            reminderTime,
            timeZone,
            attendeeEmail: user.email,
          });

          console.log("✅ Roadmap generated event added to calendar for:", user.email);
        } catch (calEmailErr) {
          console.warn("⚠️ Calendar event for roadmap generation failed (non-critical):", calEmailErr.message);
        }
      } else {
        console.warn("⚠️ User email not found, skipping email");
      }
    } catch (emailErr) {
      console.warn("⚠️ Email sending failed (non-critical):", emailErr.message);
      // Don't fail the request if email fails
    }

    // 📅 Schedule Google Calendar notifications for ACTIVE module only
    try {
      const timeZone = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
      const reminderTime = process.env.DAILY_REMINDER_TIME || "22:15";
      const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
      const testRecipient = process.env.TEST_NOTIFICATION_EMAIL || null;
      const attendeeEmail = testRecipient || user.email;

      if (!attendeeEmail) {
        console.warn("⚠️ User email not found, skipping calendar notifications");
      } else {
        const moduleStartDate = new Date();
        const activeModule = roadmapModules[0];

        if (!activeModule) {
          console.warn("⚠️ No modules available, skipping calendar scheduling");
        } else {
          const estimatedDays = activeModule.estimatedDays || 1;
          const unlockDays = Math.max(1, Math.ceil(estimatedDays / 2));
          const unlockDate = new Date(
            moduleStartDate.getTime() + unlockDays * 24 * 60 * 60 * 1000
          );

          console.log("📅 Scheduling daily module reminders", {
            moduleTitle: activeModule.moduleTitle,
            estimatedDays,
            reminderTime,
            attendeeEmail,
          });

          await createDailyModuleReminder({
            calendarId,
            moduleTitle: activeModule.moduleTitle,
            companyName: companyName,
            startDate: moduleStartDate,
            occurrenceCount: estimatedDays,
            reminderTime,
            timeZone,
            attendeeEmail,
          });

          console.log("📅 Scheduling quiz unlock reminder", {
            moduleTitle: activeModule.moduleTitle,
            unlockDate: unlockDate.toISOString(),
            reminderTime,
            attendeeEmail,
          });

          await createQuizUnlockReminder({
            calendarId,
            moduleTitle: activeModule.moduleTitle,
            companyName: companyName,
            unlockDate,
            reminderTime,
            timeZone,
            attendeeEmail,
          });

          console.log("✅ Calendar notifications scheduled for active module:", activeModule.moduleTitle);
        }
      }
    } catch (calErr) {
      console.warn("⚠️ Calendar scheduling failed (non-critical):", calErr.message);
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
  }
};

/**
 * Regenerate roadmap after failed quiz attempts
 * Calculates days already spent and generates new roadmap with remaining time
 */
export const regenerateRoadmapAfterFailure = async (req, res) => {
  try {
    const { companyId, deptId, userId, moduleId } = req.body;

    if (!companyId || !deptId || !userId || !moduleId) {
      return res.status(400).json({ error: "Missing required IDs" });
    }

    console.log("🔄 === ROADMAP REGENERATION START ===");
    console.log(`CompanyId: ${companyId}, DeptId: ${deptId}, UserId: ${userId}, FailedModuleId: ${moduleId}`);

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

    const user = userSnap.data();
    console.log("✅ User fetched:", user.name);

    // Get failed module
    const failedModuleRef = userRef.collection("roadmap").doc(moduleId);
    const failedModuleSnap = await failedModuleRef.get();
    
    if (!failedModuleSnap.exists) {
      return res.status(404).json({ error: "Module not found" });
    }
    
    const failedModuleData = failedModuleSnap.data();
    console.log(`📚 Failed module: ${failedModuleData.moduleTitle}`);

    // Get original training duration
    const onboardingRef = db
      .collection("companies")
      .doc(companyId)
      .collection("onboardingAnswers");

    const onboardingSnap = await onboardingRef
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    let originalTrainingDuration = 90; // Default 90 days
    if (!onboardingSnap.empty) {
      const onboardingData = onboardingSnap.docs[0].data();
      originalTrainingDuration = parseInt(onboardingData?.answers?.["1"]) || 90;
    }
    console.log(`⏱️ Original training duration: ${originalTrainingDuration} days`);

    // Calculate days already spent
    const roadmapSnap = await userRef.collection("roadmap")
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();

    let daysSpent = 0;
    if (!roadmapSnap.empty) {
      const firstModule = roadmapSnap.docs[0];
      const firstModuleData = firstModule.data();
      
      if (firstModuleData.createdAt) {
        const startDate = firstModuleData.createdAt.toDate
          ? firstModuleData.createdAt.toDate()
          : new Date(firstModuleData.createdAt);
        const today = new Date();
        daysSpent = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
      }
    }
    
    const remainingDays = Math.max(7, originalTrainingDuration - daysSpent); // Minimum 7 days
    console.log(`📅 Days spent: ${daysSpent}, Remaining days: ${remainingDays}`);

    // Get all modules to find completed ones
    const allModulesSnap = await userRef.collection("roadmap").get();
    const completedModules = [];
    const incompletModules = [];
    
    allModulesSnap.forEach((doc) => {
      const moduleData = doc.data();
      if (moduleData.completed) {
        completedModules.push({ id: doc.id, ...moduleData });
      } else {
        incompletModules.push(doc.id);
      }
    });
    
    console.log(`✅ Completed modules: ${completedModules.length}`);
    console.log(`❌ Incomplete modules: ${incompletModules.length}`);

    // Build comprehensive learning profile with quiz weakness analysis
    const learningProfile = await buildLearningProfile({ userRef, moduleId });
    const masteredTopics = learningProfile.masteredTopics || [];
    const strugglingAreas = learningProfile.strugglingAreas || [];
    const wrongQuestions = learningProfile.wrongQuestions || [];
    const weakConcepts = learningProfile.weakConcepts || [];
    
    console.log(`🧩 Mastered topics: ${masteredTopics.length}`);
    console.log(`⚠️ Struggling areas: ${strugglingAreas.length}`);
    console.log(`❌ Wrong questions analyzed: ${wrongQuestions.length}`);
    console.log(`🎯 Weak concepts identified: ${weakConcepts.map(w => `${w.concept}(${w.frequency})`).join(", ")}`);

    // Get CV text
    if (!user.cvUrl) {
      return res.status(400).json({ error: "CV URL not found. Cannot regenerate roadmap." });
    }

    console.log("📄 Parsing CV...");
    const cvParseResult = await parseCvFromUrl(user.cvUrl);
    const cvText = cvParseResult?.rawText || "";
    
    if (!cvText) {
      throw new Error("CV text extraction failed");
    }

    // Fetch company context - both general and weakness-specific
    console.log("🔎 Fetching company training materials...");
    const basePineconeContext = await retrieveDeptDocsFromPinecone({
      queryText: cvText,
      companyId,
      deptName: deptId,
    });

    // ENHANCED: Fetch company docs specifically about weak concepts
    console.log("🎯 Fetching company docs for weak concepts...");
    const weakConceptQueries = weakConcepts.slice(0, 5).map(w => w.concept);
    const weaknessSpecificDocs = [];
    
    for (const concept of weakConceptQueries) {
      try {
        const docs = await retrieveDeptDocsFromPinecone({
          queryText: `${concept} ${user.trainingOn} implementation best practices examples`,
          companyId,
          deptName: deptId,
        });
        weaknessSpecificDocs.push(...docs);
        console.log(`  ✓ Fetched ${docs.length} docs for "${concept}"`);
      } catch (err) {
        console.warn(`  ✗ Failed to fetch docs for "${concept}":`, err.message);
      }
    }

    const baseDocsText = Array.isArray(basePineconeContext)
      ? basePineconeContext.map((c) => c.text || "").join("\n")
      : "";
    
    const weaknessDocsText = weaknessSpecificDocs
      .map((c) => c.text || "").join("\n");

    const baseCompanySkills = extractSkillsFromText(baseDocsText);
    const weaknessCompanySkills = extractSkillsFromText(weaknessDocsText);
    const cvSkills = extractSkillsFromText(cvText);
    
    // Calculate skill gap: company skills MINUS (CV skills + mastered topics)
    const allMasteredSkills = [...new Set([...cvSkills, ...masteredTopics])];
    const allCompanySkills = [...new Set([...baseCompanySkills, ...weaknessCompanySkills])];
    const skillGap = allCompanySkills.filter((skill) => !allMasteredSkills.includes(skill));
    
    // Identify company skills related to weak concepts (for prioritization, not exclusivity)
    const weaknessRelatedGap = skillGap.filter(skill => 
      weakConcepts.some(w => 
        skill.toLowerCase().includes(w.concept.toLowerCase()) ||
        w.concept.toLowerCase().includes(skill.toLowerCase())
      )
    );
    
    // Get remaining company skills (not related to weaknesses)
    const otherCompanySkills = skillGap.filter(s => !weaknessRelatedGap.includes(s));
    
    console.log(`⚡ Total skill gap: ${skillGap.length} skills`);
    console.log(`🎯 Weakness-related skills: ${weaknessRelatedGap.length} - ${weaknessRelatedGap.slice(0, 5).join(", ")}`);
    console.log(`📚 Other company skills: ${otherCompanySkills.length} - ${otherCompanySkills.slice(0, 5).join(", ")}`);
    console.log(`🔀 Strategy: Mix of ${Math.round(weaknessRelatedGap.length / skillGap.length * 100)}% weakness-related and ${Math.round(otherCompanySkills.length / skillGap.length * 100)}% general company skills`);

    // Generate agentic plan with BALANCED focus: weak areas + company requirements
    const weaknessContext = `
QUIZ WEAKNESS ANALYSIS:
${weakConcepts.map(w => `- ${w.concept} (failed ${w.frequency} times)`).join("\n")}

WRONG QUESTIONS PATTERNS:
${wrongQuestions.slice(0, 10).map(q => `- [${q.type}] ${q.question.substring(0, 80)}...`).join("\n")}

STRUGGLING AREAS: ${strugglingAreas.join(", ")}
AVERAGE QUIZ SCORE: ${learningProfile.avgScore}%

WEAKNESS-RELATED COMPANY SKILLS: ${weaknessRelatedGap.slice(0, 8).join(", ")}
OTHER COMPANY REQUIREMENTS: ${otherCompanySkills.slice(0, 8).join(", ")}`;

    const plan = await generateRoadmapPlan({
      trainingOn: user.trainingOn || "General",
      cvText,
      skillGap: skillGap, // Use ALL skills, not prioritized
      learningProfile: {
        ...learningProfile,
        regenerationContext: `Regenerating roadmap after ${MAX_QUIZ_ATTEMPTS} failed quiz attempts. Create a BALANCED roadmap that addresses user weaknesses AND covers remaining company requirements. ${weaknessContext}`,
        weakConcepts: weakConcepts.map(w => w.concept),
        weaknessRelatedSkills: weaknessRelatedGap,
        otherCompanySkills: otherCompanySkills,
        balancedApproach: true,
      },
    });

    console.log(`🧭 Regeneration plan created with ${plan.queries.length} queries targeting weak areas`);

    // Fetch additional planned docs
    const plannedDocs = await fetchPlannedDocs({
      queries: plan.queries,
      companyId,
      deptName: deptId,
    });

    // Merge ALL docs: base + weakness-specific + planned
    const mergedDocs = mergeDocs([
      ...(basePineconeContext || []), 
      ...weaknessSpecificDocs,
      ...plannedDocs
    ]);
    
    console.log(`📄 Total context docs: ${mergedDocs.length} (${basePineconeContext.length} base + ${weaknessSpecificDocs.length} weakness-specific + ${plannedDocs.length} planned)`);
    
    const companyDocsText = truncateText(
      mergedDocs.map((c) => c.text || "").join("\n"),
      MAX_CONTEXT_CHARS
    );

    const companyContext = `COMPANY DOCUMENTS (Including weakness-specific materials):\n${companyDocsText || "No company documents available."}\n\nCOMPANY SKILLS TO FOCUS ON: ${weaknessRelatedGap.slice(0, 15).join(", ")}`;

    // Generate new roadmap with BALANCED approach: weak areas + company requirements
    console.log("🤖 Generating new roadmap via agentic loop...");
    const { modules: roadmapModules, critique } = await generateRoadmapAgentic({
      cvText,
      pineconeContext: mergedDocs,
      companyContext,
      expertise: user.expertise || 1,
      trainingOn: user.trainingOn || "General",
      level: user.trainingLevel || "Beginner",
      trainingDuration: remainingDays,
      skillGap: skillGap, // All skills, not prioritized
      learningProfile: {
        ...learningProfile,
        structuredCv: cvParseResult?.structured || null,
        weakConcepts: weakConcepts.map(w => w.concept),
        weaknessRelatedSkills: weaknessRelatedGap,
        otherCompanySkills: otherCompanySkills,
        balancedApproach: true,
      },
      planFocusAreas: [...(weakConcepts.slice(0, 3).map(w => w.concept)), ...plan.focusAreas], // Mix weak concepts + plan areas
    });

    if (!Array.isArray(roadmapModules) || roadmapModules.length === 0) {
      throw new Error("❌ LLM did not return roadmap modules");
    }

    console.log(`✅ New roadmap generated: ${roadmapModules.length} modules`);

    // Delete incomplete modules
    console.log(`🗑️ Deleting ${incompletModules.length} incomplete modules...`);
    const deletePromises = incompletModules.map((id) =>
      userRef.collection("roadmap").doc(id).delete()
    );
    await Promise.all(deletePromises);
    console.log(`✅ Incomplete modules deleted`);

    // Store new roadmap modules
    console.log("💾 Saving new roadmap to Firestore...");
    const roadmapCollection = userRef.collection("roadmap");
    const startOrder = completedModules.length + 1;

    for (let i = 0; i < roadmapModules.length; i++) {
      await roadmapCollection.add({
        ...roadmapModules[i],
        skillsCovered: roadmapModules[i].skillsCovered || [],
        order: startOrder + i,
        completed: false,
        status: "pending",
        createdAt: new Date(),
        FirstTimeCreatedAt: new Date(),
        regenerated: true,
        regenerationReason: `Quiz failure after ${MAX_QUIZ_ATTEMPTS} attempts`,
      });
    }

    // Store comprehensive regeneration metadata including weakness analysis
    try {
      await userRef.set({
        roadmapRegenerated: true,
        lastRegenerationDate: new Date(),
        regenerationCount: (user.regenerationCount || 0) + 1,
        roadmapAgentic: {
          planQueries: plan.queries,
          planFocusAreas: plan.focusAreas,
          critiqueScore: critique?.score || null,
          critiquePass: critique?.pass || false,
          learningProfile: {
            summary: learningProfile.summary,
            strugglingAreas: learningProfile.strugglingAreas,
            masteredTopics: learningProfile.masteredTopics,
            avgScore: learningProfile.avgScore,
            weakConcepts: learningProfile.weakConcepts,
            wrongQuestionsCount: learningProfile.wrongQuestions.length,
            totalQuizAttempts: learningProfile.totalAttempts,
          },
          regeneratedAfterFailure: true,
          remainingDays,
          originalDays: originalTrainingDuration,
          daysSpent,
        },
        // Store weakness summary for chatbot welcome
        weaknessAnalysis: {
          concepts: weakConcepts,
          wrongQuestions: wrongQuestions.slice(0, 5), // Store top 5 for chatbot
          strugglingAreas: strugglingAreas,
          avgScore: learningProfile.avgScore,
          generatedAt: new Date(),
        },
      }, { merge: true });
    } catch (err) {
      console.warn("⚠️ Failed to store regeneration metadata:", err.message);
    }

    console.log("🎉 Roadmap regeneration complete!");
    console.log(`=== ROADMAP REGENERATION END ===\n`);

    return res.json({
      success: true,
      message: `Roadmap regenerated successfully with ${roadmapModules.length} new modules based on your performance.`,
      modules: roadmapModules,
      daysSpent,
      remainingDays,
      completedModules: completedModules.length,
      newModules: roadmapModules.length,
    });

  } catch (error) {
    console.error("🔥 Roadmap regeneration failed:");
    console.error(error);
    return res.status(500).json({
      error: error.message || "Roadmap regeneration failed",
    });
  }
};

