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
Return ONLY valid JSON.
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
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    res.json({ content: text });
  } catch (err) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
