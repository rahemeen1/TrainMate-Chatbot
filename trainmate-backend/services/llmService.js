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
    
    const regenerationGuidance = isRegeneration ? `
🔄 <b>REGENERATION MODE - BALANCED APPROACH:</b>
This roadmap is being regenerated after quiz failures. You MUST create a BALANCED mix of modules:

<b>⚖️ BALANCE REQUIREMENT (50/50 Split):</b>
1. <b>~50% Weak Areas Focus:</b> Create modules addressing concepts from quiz failures:
   ${weakConcepts.length ? weakConcepts.slice(0, 8).join(", ") : "None identified"}
   Related company skills: ${weaknessRelatedSkills.length ? weaknessRelatedSkills.slice(0, 5).join(", ") : "Use general content"}

2. <b>~50% Company Requirements:</b> Create modules covering essential skills from company docs that user still needs:
   ${otherCompanySkills.length ? otherCompanySkills.slice(0, 10).join(", ") : "Cover general company requirements"}

<b>📋 MODULE DISTRIBUTION STRATEGY:</b>
- If time allows 6 modules: 3 for weak areas, 3 for company requirements
- If time allows 4 modules: 2 for weak areas, 2 for company requirements
- Alternate between weakness and requirement modules for balanced progression

<b>🎯 MODULE DESIGN RULES:</b>
1. <b>Weakness Modules:</b> 
   - Title format: "Mastering [Weak Concept] in [Company Context]"
   - Start with fundamentals of weak concept
   - Use company-specific examples and implementations
   - Include practical exercises related to company work

2. <b>Company Requirement Modules:</b>
   - Title format: "[Company Skill/Tool] Essentials" or "Advanced [Company Practice]"
   - Cover skills from company documentation not related to weaknesses
   - Focus on company standards, procedures, and best practices
   - Ensure comprehensive coverage of company tech stack

<b>❌ AVOID:</b>
- Making ALL modules about weaknesses (this creates gaps in company knowledge)
- Making ALL modules about company requirements (this doesn't address learning gaps)
- Overlapping content between weakness and requirement modules

<b>Context from Failed Attempts:</b>
${safeLearningProfile.regenerationContext || ""}
` : '';
    
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
${weakConcepts.length ? `<b>Weak Concepts (Quiz Failures):</b> ${weakConcepts.join(", ")}` : ''}

Structured CV (redacted):
${structuredCv ? JSON.stringify(structuredCv) : "Not available"}

Plan Focus Areas:
${safeFocusAreas.length ? safeFocusAreas.join(", ") : "No focus areas provided."}

${regenerationGuidance}

CRITICAL CONSTRAINTS:
1. <b>Gap Analysis:</b> Analyze the User CV against the Target Domain. DO NOT include foundational concepts the user already demonstrates mastery of in their CV.
1.1 <b>Skill Gaps:</b> ${isRegeneration && balancedApproach ? 'BALANCED PRIORITY: Address 50% weak concepts from quiz failures + 50% remaining company requirements.' : isRegeneration ? 'Address weak concepts from quiz failures using company-specific knowledge.' : 'Prioritize modules that address the identified skill gaps and struggling areas from the learning profile.'}
1.2 <b>Mastery Avoidance:</b> De-emphasize topics already mastered in the learning profile.
${isRegeneration && balancedApproach ? '1.3 <b>Balance Requirement:</b> Create equal number of modules for weaknesses and company requirements. If 6 modules, split 3-3. If 5 modules, split 3-2 or 2-3.' : isRegeneration ? '1.3 <b>Company Integration:</b> Every module MUST reference and use concepts from the Company Context section above.' : ''}
2. <b>Scoping:</b> The sum of "estimatedDays" must logically fit within the total duration of ${safeDuration}.
3. <b>Progression:</b> ${isRegeneration && balancedApproach ? 'Alternate between weakness remediation and company requirement modules for balanced skill development.' : isRegeneration ? 'Start with weak concepts fundamentals, then progress to company-specific applications.' : 'Modules must follow a Bloom\'s Taxonomy progression (from understanding to application/synthesis).'}
4. <b>Specificity:</b> "description" must include 2-3 specific sub-topics or tools to be mastered ${isRegeneration ? '(preferably from company documentation)' : ''}.
5. <b>Coverage:</b> ${isRegeneration && balancedApproach ? 'Ensure coverage of ALL weak concepts AND critical company requirements.' : 'Ensure at least one module explicitly covers each Plan Focus Area'} ${isRegeneration && !balancedApproach ? 'and each weak concept' : ''}.

Guidance:
${expertiseInstruction}
${isRegeneration && balancedApproach ? '\n⚖️ REMEMBER: Create a 50/50 BALANCED roadmap - half for remediating weaknesses, half for covering company requirements. Don\'t make everything about quiz failures.' : isRegeneration ? '\n🎯 REMEMBER: This is a remedial roadmap. Focus intensely on teaching the weak concepts using the company\'s actual tools, frameworks, and examples from the documentation.' : ''}

User CV:
${cvText}

TASK:
Generate the roadmap for "${safeTrainingOn}" now.

JSON FORMAT:
[
  {
    "moduleTitle": "string",
    "description": "string",
    "estimatedDays": number,
    "skillsCovered": ["skill1", "skill2", "skill3"]
  }
]

IMPORTANT: 
- Include 3-5 specific skills in the "skillsCovered" array for each module. These should be measurable skills or concepts the user will master.
${isRegeneration ? '- Module titles should reflect both the weak concept AND company context (e.g., "Mastering Async/Await in [Company Stack]")' : ''}
${isRegeneration ? '- Prioritize skills from the "Company-specific skills to teach" list above' : ''}
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
      skillsCovered: Array.isArray(module.skillsCovered) ? module.skillsCovered : []
    }));

    console.log("🧩 Roadmap modules generated:", roadmap.length);

    console.log("================ GEMINI ROADMAP END ==================\n");

    return roadmap;

  } catch (error) {
    console.error("🔥 Gemini roadmap generation failed:", error.message);
    throw error;
  }
};
