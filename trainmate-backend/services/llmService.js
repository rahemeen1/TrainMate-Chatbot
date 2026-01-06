import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const generateRoadmap = async ({
  cvText = "",
  trainingOn,
  expertise,
  level,
  trainingDuration,
}) => {
  console.log("🧠 Gemini LLM roadmap generation started (No Pinecone)");

  /* -------------------------
     SAFETY FALLBACKS
  ------------------------- */
  const safeTrainingOn = trainingOn || "General";
  const safeExpertise = expertise ?? 1;
  const safeLevel = level || "Beginner";
  const safeDuration = trainingDuration || "1 month";

  console.log("🧪 Gemini Inputs:", {
    safeTrainingOn,
    safeExpertise,
    safeLevel,
    safeDuration,
  });

  try {
    /* -------------------------
       Expertise Instructions
    ------------------------- */
    const expertiseInstruction =
      safeExpertise <= 2
        ? "User is a beginner. Start from fundamentals with simple examples."
        : safeExpertise === 3
        ? "User is intermediate. Brief fundamentals then move to applied concepts."
        : "User is experienced. Skip basics and focus on advanced, real-world practices.";

    /* -------------------------
       Gemini Model
    ------------------------- */
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
      systemInstruction:
        "You are an AI training architect. Respond ONLY with valid JSON. No explanations.",
    });

    const prompt = `
User Profile:
- Training Domain: ${safeTrainingOn}
- Expertise Level: ${safeExpertise} (${safeLevel})
- Training Duration: ${safeDuration}

Guidance:
${expertiseInstruction}

User CV:
${cvText}

TASK:
Create a personalized training roadmap focused ONLY on "${safeTrainingOn}".

JSON FORMAT:
[
  {
    "moduleTitle": "string",
    "description": "string",
    "estimatedDays": number
  }
]
`;

    console.log("📨 Sending prompt to Gemini");

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawResponse = await response.text();

    console.log("📩 Gemini raw response received");

    /* -------------------------
       Strict JSON Parsing
    ------------------------- */
    let roadmap;
    try {
      roadmap = JSON.parse(rawResponse);
    } catch (err) {
      console.error("❌ Invalid Gemini JSON:", rawResponse);
      throw new Error("Gemini returned invalid JSON");
    }

    if (!Array.isArray(roadmap)) {
      throw new Error("Gemini response is not an array");
    }

    /* -------------------------
       Validate each module
    ------------------------- */
    roadmap = roadmap.map((module, idx) => ({
      moduleTitle: module.moduleTitle ?? `Module ${idx + 1}`,
      description: module.description ?? "No description provided",
      estimatedDays: module.estimatedDays ?? 1,
    }));

    console.log("🧩 Roadmap modules generated:", roadmap.length);
    return roadmap;

  } catch (error) {
    console.error("🔥 Gemini roadmap generation failed:", error.message);
    throw error;
  }
};
