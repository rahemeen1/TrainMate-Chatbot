import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generates a personalized roadmap using CV + company knowledge via Gemini
 */
export const generateRoadmap = async ({
  cvText,
  pineconeContext,
  trainingOn,
  expertise,
  level,
  trainingDuration
}) => {
  console.log("🧠 Gemini LLM roadmap generation started");

  try {
    // 1️⃣ Prepare company context
    const companyDocsText = pineconeContext
      .map((c, i) => `(${i + 1}) ${c.text}`)
      .join("\n");

    // 2️⃣ Expertise guidance
    const expertiseInstruction =
      expertise <= 2
        ? "User is beginner. Start from fundamentals."
        : expertise === 3
        ? "User is intermediate. Brief fundamentals then advance."
        : "User is experienced. Skip basics, focus on practical & advanced topics.";

    // 3️⃣ Initialize Model with System Instruction
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash", // Use "gemini-1.5-pro" for complex reasoning
      generationConfig: {
        responseMimeType: "application/json", // Forces JSON output
      },
      systemInstruction: "You are an AI training architect. You must return ONLY valid JSON in the requested format.",
    });

    const prompt = `
User Profile:
- Training Domain: ${trainingOn}
- Expertise Level: ${expertise} (${level})
- Training Duration: ${trainingDuration || "not specified"}

Guidance:
${expertiseInstruction}

User CV:
${cvText}

Company Knowledge Base:
${companyDocsText}

TASK:
Create a personalized learning roadmap focusing ONLY on "${trainingOn}".
Consider company practices from the provided documents.

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

    // 4️⃣ Call Gemini API
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawResponse = response.text();

    console.log("📩 Gemini response received");

    // 5️⃣ Parse response safely
    let roadmap;
    try {
      roadmap = JSON.parse(rawResponse);
    } catch (err) {
      console.error("❌ Failed to parse Gemini JSON", rawResponse);
      throw new Error("Invalid Gemini JSON output");
    }

    console.log("🧩 Parsed roadmap modules:", roadmap.length);
    return roadmap;

  } catch (error) {
    console.error("🔥 Gemini roadmap generation failed:", error.message);
    throw error;
  }
};