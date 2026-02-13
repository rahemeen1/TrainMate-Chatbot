import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const generateRoadmap = async ({
  cvText = "",
  pineconeContext = [],
  companyContext = "",
  skillGap = [],
  learningProfile = null,
  planFocusAreas = [],
  trainingOn,
  expertise,
  level,
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
  console.log("   level            →", level);
  console.log("   trainingDuration →", trainingDuration);
  console.log("   cvText length    →", cvText?.length);
  console.log("   companyContext length →", companyContext?.length);
  console.log("   skillGap size    →", Array.isArray(skillGap) ? skillGap.length : 0);
  console.log("   planFocusAreas   →", Array.isArray(planFocusAreas) ? planFocusAreas.length : 0);

  if (!cvText || cvText.trim().length < 50) {
    console.warn("⚠️ CV text is very small or empty");
  }

  /* ---------------------------------
     2️⃣ SAFETY FALLBACKS
  ---------------------------------- */
  const safeTrainingOn = trainingOn || "General";
  const safeExpertise = expertise ?? 1;
  const safeLevel = level || "Beginner";
  const safeDuration = trainingDuration;
  const safeCompanyContext = companyContext || "";
  const safeSkillGap = Array.isArray(skillGap) ? skillGap : [];
  const safeFocusAreas = Array.isArray(planFocusAreas) ? planFocusAreas : [];
  const safeLearningProfile = learningProfile || null;
  const structuredCv = safeLearningProfile?.structuredCv || null;
  const pineconeExcerpt = Array.isArray(pineconeContext)
    ? pineconeContext.map((c) => c.text || "").join("\n").slice(0, 1200)
    : "";
  const effectiveCompanyContext = safeCompanyContext || pineconeExcerpt || "No company documents provided.";

  console.log("🧪 Normalized inputs:");
  console.log("   safeTrainingOn →", safeTrainingOn);
  console.log("   safeExpertise  →", safeExpertise);
  console.log("   safeLevel      →", safeLevel);
  console.log("   safeDuration   →", safeDuration);

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
    const prompt = `
User Profile:
- <b>Target Domain:</b> ${safeTrainingOn}
- <b>Current Expertise:</b> ${safeExpertise} (${safeLevel})
- <b>Time Constraint:</b> ${safeDuration}
- <b>User Background (CV):</b> ${cvText}
- <b>Specific Pedagogical Instructions:</b> ${expertiseInstruction}

Company Context:
${effectiveCompanyContext}

Skill Gap:
${safeSkillGap.length ? safeSkillGap.join(", ") : "No explicit gaps detected."}

Learning Profile:
<b>Summary:</b> ${safeLearningProfile?.summary || "No prior learning history."}
<b>Struggling Areas:</b> ${(safeLearningProfile?.strugglingAreas || []).join(", ")}
<b>Mastered Topics:</b> ${(safeLearningProfile?.masteredTopics || []).join(", ")}
<b>Average Quiz Score:</b> ${Number.isFinite(safeLearningProfile?.avgScore) ? safeLearningProfile.avgScore : "N/A"}

Structured CV (redacted):
${structuredCv ? JSON.stringify(structuredCv) : "Not available"}

Plan Focus Areas:
${safeFocusAreas.length ? safeFocusAreas.join(", ") : "No focus areas provided."}

CRITICAL CONSTRAINTS:
1. <b>Gap Analysis:</b> Analyze the User CV against the Target Domain. DO NOT include foundational concepts the user already demonstrates mastery of in their CV.
1.1 <b>Skill Gaps:</b> Prioritize modules that address the identified skill gaps and struggling areas from the learning profile.
1.2 <b>Mastery Avoidance:</b> De-emphasize topics already mastered in the learning profile.
2. <b>Scoping:</b> The sum of "estimatedDays" must logically fit within the total duration of ${safeDuration}.
3. <b>Progression:</b> Modules must follow a Bloom's Taxonomy progression (from understanding to application/synthesis).
4. <b>Specificity:</b> "description" must include 2-3 specific sub-topics or tools to be mastered.
5. <b>Coverage:</b> Ensure at least one module explicitly covers each Plan Focus Area.

Guidance:
${expertiseInstruction}

User CV:
${cvText}

TASK:
Generate the roadmap for "${safeTrainingOn}" now.

JSON FORMAT:
[
  {
    "moduleTitle": "string",
    "description": "string",
    "estimatedDays": number
  }
]
`;

    console.log("📨 Prompt built");
    console.log("🧪 Prompt size (chars):", prompt.length);

    /* ---------------------------------
       6️⃣ GEMINI CALL
    ---------------------------------- */
    console.log("🚀 Sending prompt to Gemini...");
    const result = await model.generateContent(prompt);

    const response = await result.response;
    const rawResponse = await response.text();

    console.log("📩 Gemini raw response received");
    console.log("🧾 Raw response (first 500 chars):");
    console.log(rawResponse.slice(0, 500));

    /* ---------------------------------
       7️⃣ STRICT JSON PARSE
    ---------------------------------- */
    let roadmap;
    try {
      roadmap = JSON.parse(rawResponse);
    } catch (err) {
      console.error("❌ Gemini returned INVALID JSON");
      console.error(rawResponse);
      throw new Error("Gemini returned invalid JSON");
    }

    if (!Array.isArray(roadmap)) {
      throw new Error("❌ Gemini response is not an array");
    }

    /* ---------------------------------
       8️⃣ SANITIZE MODULES
    ---------------------------------- */
    roadmap = roadmap.map((module, idx) => ({
      moduleTitle: module.moduleTitle ?? `Module ${idx + 1}`,
      description: module.description ?? "No description provided",
      estimatedDays: module.estimatedDays ?? 1,
    }));

    console.log("🧩 Roadmap modules generated:", roadmap.length);

    console.log("================ GEMINI ROADMAP END ==================\n");

    return roadmap;

  } catch (error) {
    console.error("🔥 Gemini roadmap generation failed:", error.message);
    throw error;
  }
};
