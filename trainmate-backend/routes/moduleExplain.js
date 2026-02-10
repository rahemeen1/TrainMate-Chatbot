import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post("/explain", async (req, res) => {
  try {
    const { moduleTitle, description, skillsCovered, estimatedDays } = req.body;

    const prompt = `
You are an expert corporate trainer.

Explain the following training module in a clear, professional, and friendly way.

Module Title: ${moduleTitle}
Description: ${description}
Duration: ${estimatedDays} days
Skills: ${skillsCovered?.join(", ") || "Relevant professional skills"}

IMPORTANT:
Return ONLY valid JSON. Do not include greetings, markdown, backticks, or any extra text.
Your output MUST start with '{' and end with '}'.
Do NOT add explanations, headings, markdown, or extra text.

JSON format (exact keys only):
{
  "overview": "string",
  "whatYouWillLearn": ["string"],
  "skillsBreakdown": ["string"],
  "learningOutcome": "string",
  "realWorldApplication": "string"
}
`;

    console.log("📝 Gemini prompt:", prompt);

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let jsonOutput;
    try {
      jsonOutput = JSON.parse(text);
    } catch (err) {
      console.error("❌ Gemini returned invalid JSON:", text);
      return res.status(500).json({ error: "AI returned invalid JSON" });
    }

    // ✅ Optional: validate keys
    const requiredKeys = ["overview", "whatYouWillLearn", "skillsBreakdown", "learningOutcome", "realWorldApplication"];
    const missingKeys = requiredKeys.filter(k => !(k in jsonOutput));
    if (missingKeys.length > 0) {
      console.warn("⚠️ Missing keys from Gemini output:", missingKeys);
    }

    res.json({ content: jsonOutput });
  } catch (err) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
