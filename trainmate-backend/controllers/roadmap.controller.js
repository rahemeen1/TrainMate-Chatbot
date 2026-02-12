// trainmate-backend/controllers/roadmap.controller.js
import { db } from "../config/firebase.js";
import { parseCvFromUrl } from "../services/cvParser.service.js";
import { retrieveDeptDocsFromPinecone } from "../services/pineconeService.js";
import { generateRoadmap } from "../services/llmService.js";
import { extractSkillsFromText } from "../services/skillExtractor.service.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
//import { generateModuleInsights } from "../services/moduleInsightsService.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const roadmapModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
  return modules.every((m) => m.moduleTitle && m.description && Number.isFinite(m.estimatedDays));
}

function normalizeRoadmapModules(modules) {
  if (!Array.isArray(modules)) return [];
  return modules.map((module, idx) => ({
    moduleTitle: module.moduleTitle ?? `Module ${idx + 1}`,
    description: module.description ?? "No description provided",
    estimatedDays: Number.isFinite(module.estimatedDays) ? module.estimatedDays : 1,
  }));
}

async function generateRoadmapModel(prompt) {
  const attempts = 3;
  let lastErr;

  for (let i = 0; i < attempts; i += 1) {
    try {
      return await roadmapModel.generateContent(prompt);
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
  const prompt = `
You are a planning agent for personalized training roadmaps.

TARGET DOMAIN: "${trainingOn || "General"}"

CV SUMMARY (partial):
${truncateText(cvText, 1200)}

SKILL GAP: ${Array.isArray(skillGap) ? skillGap.slice(0, 12).join(", ") : "None"}

LEARNING PROFILE:
${learningProfile?.summary || "No prior learning history."}

Create a compact retrieval plan with targeted search queries and focus areas.

Return JSON only:
{
  "queries": ["string"],
  "focusAreas": ["string"],
  "priority": "high|medium|low"
}

Constraints:
- 2 to ${PLAN_MAX_QUERIES} queries
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

async function buildLearningProfile({ userRef }) {
  try {
    const roadmapSnap = await userRef.collection("roadmap").orderBy("createdAt", "desc").limit(5).get();
    if (roadmapSnap.empty) {
      return { summary: "No prior learning history.", strugglingAreas: [], masteredTopics: [], avgScore: null };
    }

    const memorySnaps = await Promise.all(
      roadmapSnap.docs.map((doc) => doc.ref.collection("agentMemory").doc("summary").get())
    );

    const summaries = [];
    const strugglingAreas = [];
    const masteredTopics = [];
    const scores = [];

    for (const snap of memorySnaps) {
      if (!snap.exists) continue;
      const data = snap.data() || {};
      if (data.summary) summaries.push(data.summary);
      if (Array.isArray(data.strugglingAreas)) strugglingAreas.push(...data.strugglingAreas);
      if (Array.isArray(data.masteredTopics)) masteredTopics.push(...data.masteredTopics);
      if (Number.isFinite(data.lastQuizScore)) scores.push(data.lastQuizScore);
    }

    const uniqueStruggling = Array.from(new Set(strugglingAreas)).slice(0, 12);
    const uniqueMastered = Array.from(new Set(masteredTopics)).slice(0, 12);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    return {
      summary: summaries.join(" | ").substring(0, 800) || "No prior learning history.",
      strugglingAreas: uniqueStruggling,
      masteredTopics: uniqueMastered,
      avgScore,
    };
  } catch (err) {
    console.warn("Failed to build learning profile:", err.message);
    return { summary: "No prior learning history.", strugglingAreas: [], masteredTopics: [], avgScore: null };
  }
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
    "estimatedDays": number
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
      level,
      trainingDuration,
      skillGap,
      learningProfile,
      planFocusAreas,
    });

    const normalized = normalizeRoadmapModules(modules);
    lastModules = normalized;
    if (!isRoadmapComplete(normalized)) {
      critique = { pass: false, issues: ["Incomplete roadmap structure"], score: 40 };
      continue;
    }

    critique = await critiqueRoadmap({ trainingOn, modules: normalized, trainingDuration });
    if (critique?.pass) {
      return { modules: normalized, critique };
    }

    const refined = await refineRoadmap({
      trainingOn,
      modules: normalized,
      issues: critique?.issues,
      trainingDuration,
    });

    lastModules = refined;
    const refinedCritique = await critiqueRoadmap({ trainingOn, modules: refined, trainingDuration });
    if (refinedCritique?.pass) {
      return { modules: refined, critique: refinedCritique };
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
    const level = expertiseLevel || user.level || "Beginner";
    const finalTrainingDuration = trainingDurationFromOnboarding;

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
      });
    }

    // Initialize progress on user document to 0
    try {
      await userRef.update({ progress: 0 });
    } catch (err) {
      console.warn("⚠️ Failed to set initial progress on user doc:", err.message || err);
    }
    console.log("🎉 Roadmap saved successfully");

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
