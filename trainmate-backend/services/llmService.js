import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function normalizeSkillToken(skill) {
  return String(skill || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePrioritySkillsList(skills = []) {
  return Array.from(
    new Set(
      (Array.isArray(skills) ? skills : [])
        .map((skill) => String(skill || "").trim())
        .filter(Boolean)
    )
  );
}

function getModulePriorityRank(module = {}, prioritizedSkills = {}) {
  const mustHave = new Set(normalizePrioritySkillsList(prioritizedSkills.mustHave).map(normalizeSkillToken));
  const goodToHave = new Set(normalizePrioritySkillsList(prioritizedSkills.goodToHave).map(normalizeSkillToken));
  const skills = Array.isArray(module?.skillsCovered) ? module.skillsCovered : [];

  if (skills.length === 0) return 3;

  return skills.reduce((bestRank, skill) => {
    const normalized = normalizeSkillToken(skill);
    const rank = mustHave.has(normalized) ? 0 : goodToHave.has(normalized) ? 1 : 2;
    return Math.min(bestRank, rank);
  }, 3);
}

function sortModulesByPriority(modules = [], prioritizedSkills = {}) {
  return [...modules].sort((a, b) => {
    const aRank = getModulePriorityRank(a, prioritizedSkills);
    const bRank = getModulePriorityRank(b, prioritizedSkills);
    if (aRank !== bRank) return aRank - bRank;

    const aDays = Number(a?.estimatedDays || 1);
    const bDays = Number(b?.estimatedDays || 1);
    if (aDays !== bDays) return aDays - bDays;

    return String(a?.moduleTitle || "").localeCompare(String(b?.moduleTitle || ""));
  });
}

export const generateRoadmap = async ({
  cvText = "",
  pineconeContext = [],
  companyContext = "",
  skillGap = [],
  learningProfile = null,
  planFocusAreas = [],
  prioritizedSkills = { mustHave: [], goodToHave: [] },
  trainingOn,
  expertise,
  trainingLevel,
  trainingDuration,
}) => {
  console.log("\n================ GEMINI ROADMAP START ================");

  console.log("🧠 Gemini roadmap generation started");

  /* ---------------------------------
     1️⃣ RAW INPUT DEBUG
  ---------------------------------- */
  console.log("🧪 Raw inputs received:");
  console.log("   trainingOn       →", trainingOn);
  console.log("   expertise        →", expertise);
  console.log("   trainingLevel   →", trainingLevel);
  console.log("   trainingDuration →", trainingDuration);
  console.log("   cvText length    →", cvText?.length);
  console.log("   companyContext length →", companyContext?.length);
  console.log("   skillGap size    →", Array.isArray(skillGap) ? skillGap.length : 0);
  console.log("   planFocusAreas   →", Array.isArray(planFocusAreas) ? planFocusAreas.length : 0);
  console.log("   prioritizedSkills →", {
    mustHave: Array.isArray(prioritizedSkills?.mustHave) ? prioritizedSkills.mustHave.length : 0,
    goodToHave: Array.isArray(prioritizedSkills?.goodToHave) ? prioritizedSkills.goodToHave.length : 0,
  });

  if (!cvText || cvText.trim().length < 50) {
    console.warn("⚠️ CV text is very small or empty");
  }

  /* ---------------------------------
     2️⃣ SAFETY FALLBACKS
  ---------------------------------- */
  const safeTrainingOn = trainingOn || "General";
  const safeExpertise = expertise ?? 1;
  const safeLevel = trainingLevel || "Beginner";
  const safeDuration = trainingDuration;
  const safeCompanyContext = companyContext || "";
  const safeSkillGap = Array.isArray(skillGap) ? skillGap : [];
  const safeFocusAreas = Array.isArray(planFocusAreas) ? planFocusAreas : [];
  const safeLearningProfile = learningProfile || null;
  const safePrioritizedSkills = {
    mustHave: normalizePrioritySkillsList(prioritizedSkills?.mustHave),
    goodToHave: normalizePrioritySkillsList(prioritizedSkills?.goodToHave),
  };
  const structuredCv = safeLearningProfile?.structuredCv || null;
  const pineconeExcerpt = Array.isArray(pineconeContext)
    ? pineconeContext.map((c) => c.text || "").join("\n").slice(0, 1200)
    : "";
  const effectiveCompanyContext = safeCompanyContext || pineconeExcerpt || "No company documents provided.";

  console.log("🧪 Normalized inputs:");

  try {
    /* ---------------------------------
       3️⃣ EXPERTISE INSTRUCTION
    ---------------------------------- */
    const expertiseInstruction =
      safeExpertise <= 2
        ? "User is a beginner. Start from fundamentals with simple examples."
        : safeExpertise === 3
        ? "User is intermediate. Brief fundamentals then move to applied concepts."
        : "User is experienced. Skip basics and focus on advanced, real-world practices.";

    console.log("🧭 Expertise instruction selected");

    /* ---------------------------------
       4️⃣ GEMINI MODEL INIT
    ---------------------------------- */
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
      systemInstruction: `You are a Senior AI Training Architect specializing in curriculum design. 
Your goal is to generate high-precision, personalized learning roadmaps.

STRICT RULES:
1. OUTPUT: Respond ONLY with a valid JSON array. 
2. NO PROSE: Do not include introductory text, markdown formatting (like \`\`\`json), or concluding remarks.
3. LOGIC: Ensure 'estimatedDays' is an integer and titles are professional.
4. QUALITY: Descriptions must be actionable and specific to the user's expertise level.
5. SCHEMA: Adhere strictly to the requested JSON structure provided in the prompt.`,

    });

    console.log("✅ Gemini model initialized");

    /* ---------------------------------
       5️⃣ PROMPT BUILD
    ---------------------------------- */
    const isRegeneration = safeLearningProfile?.regenerationContext;
    const weakConcepts = safeLearningProfile?.weakConcepts || [];
    const weaknessRelatedSkills = safeLearningProfile?.weaknessRelatedSkills || [];
    const otherCompanySkills = safeLearningProfile?.otherCompanySkills || [];
    const balancedApproach = safeLearningProfile?.balancedApproach || false;
    
    /* ---------------------------------
       5️⃣ SIMPLIFIED PROMPT
    ---------------------------------- */
    const prompt = `Generate a personalized learning roadmap as a JSON array.

TARGET: ${safeTrainingOn}
EXPERTISE: ${safeExpertise}/5 (${safeLevel})
DURATION: ${safeDuration}
SKILL GAPS: ${safeSkillGap.slice(0, 10).join(", ") || "General"}

PRIORITY RULES:
- Must-have skills must appear first in the roadmap
- Good-to-have skills should come after must-have skills
- Optional skills should come last

MUST-HAVE SKILLS: ${safePrioritizedSkills.mustHave.join(", ") || "None"}
GOOD-TO-HAVE SKILLS: ${safePrioritizedSkills.goodToHave.join(", ") || "None"}

Return ONLY valid JSON array:
[
  {
    "moduleTitle": "Module Name",
    "description": "Key topics to learn",
    "estimatedDays": 7,
    "skillsCovered": ["skill1", "skill2"]
  }
]

Rules:
1. Generate 4-6 modules total
2. Each module (estimatedDays) must sum to fit in ${safeDuration} duration
3. Progress from fundamentals to advanced
4. Only return valid JSON, no extra text`;

    console.log("📨 Simplified prompt ready");
    
    /* ---------------------------------
       6️⃣ RETRY LOGIC FOR TRUNCATION
    ---------------------------------- */
    let rawResponse = "";
    let retries = 0;
    const maxRetries = 2;

    while (retries < maxRetries && (!rawResponse || rawResponse.length < 100)) {
      try {
        retries++;
        console.log(`🚀 Sending to Gemini (attempt ${retries})...`);
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        rawResponse = await response.text();

        console.log("📩 Gemini response received");
        console.log("🧾 Response length:", rawResponse.length, "chars");
        
        if (rawResponse.length < 100) {
          console.warn("⚠️  Response too short, might be truncated");
          if (retries < maxRetries) {
            await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
            continue;
          }
        }
        break;
      } catch (geminiError) {
        console.warn(`⚠️  Gemini attempt ${retries} failed:`, geminiError.message);
        if (retries < maxRetries) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }

    /* ---------------------------------
       7️⃣ SAFE JSON PARSE
    ---------------------------------- */
    let roadmap;
    const parseRawResponse = (text) => {
      // Try to extract JSON array from response
      const arrayMatch = text.match(/\[\s*\{[^]*\]\s*$/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }
      // Try direct parse
      return JSON.parse(text);
    };

    try {
      roadmap = parseRawResponse(rawResponse);
    } catch (parseErr) {
      console.warn("⚠️  JSON parse failed, attempting extraction...", parseErr.message);
      
      // Try to extract JSON array pattern
      const jsonArrayMatch = rawResponse.match(/\[[\s\S]*\]/);
      if (jsonArrayMatch) {
        try {
          roadmap = JSON.parse(jsonArrayMatch[0]);
        } catch (e) {
          console.error("❌ Could not parse extracted JSON");
          throw new Error("Could not parse Gemini response as valid JSON");
        }
      } else {
        throw new Error("No JSON array found in Gemini response");
      }
    }

    if (!Array.isArray(roadmap) || roadmap.length === 0) {
      console.warn("⚠️  Invalid response format, generating fallback roadmap");
      roadmap = [
        {
          moduleTitle: `Introduction to ${safeTrainingOn}`,
          description: "Core concepts and fundamentals",
          estimatedDays: Math.ceil((parseInt(safeDuration) || 30) / 3),
          skillsCovered: ["Fundamentals", "Core Concepts"]
        },
        {
          moduleTitle: `Intermediate ${safeTrainingOn}`,
          description: "Practical applications and techniques",
          estimatedDays: Math.ceil((parseInt(safeDuration) || 30) / 3),
          skillsCovered: ["Application", "Best Practices"]
        },
        {
          moduleTitle: `Advanced ${safeTrainingOn}`,
          description: "Advanced patterns and optimization",
          estimatedDays: Math.ceil((parseInt(safeDuration) || 30) / 3),
          skillsCovered: ["Advanced Patterns", "Optimization"]
        }
      ];
    }

    /* ---------------------------------
       8️⃣ SANITIZE MODULES
    ---------------------------------- */
    roadmap = roadmap.map((module, idx) => ({
      moduleTitle: module.moduleTitle ?? `Module ${idx + 1}`,
      description: module.description ?? "No description provided",
      estimatedDays: module.estimatedDays ?? 1,
      skillsCovered: Array.isArray(module.skillsCovered) ? module.skillsCovered : []
    }));

    roadmap = sortModulesByPriority(roadmap, safePrioritizedSkills);

    console.log("🧩 Roadmap modules generated:", roadmap.length);

    console.log("================ GEMINI ROADMAP END ==================\n");

    return roadmap;

  } catch (error) {
    console.error("🔥 Gemini roadmap generation failed:", error.message);
    throw error;
  }
};
