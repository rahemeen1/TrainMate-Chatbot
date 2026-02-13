import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";

const router = express.Router();
const db = admin.firestore();

let moduleModel = null;

function initializeModuleModel() {
  if (!moduleModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    moduleModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return moduleModel;
}

router.post("/explain", async (req, res) => {
  try {
    const {
      fresherId,
      department,
      userId,
      moduleId,
      moduleTitle,
      description,
      skillsCovered,
      estimatedDays
    } = req.body;

    // ✅ Validate required fields
    if (!fresherId || !department || !userId || !moduleId) {
      return res.status(400).json({ error: "Missing required IDs" });
    }

    // 🔹 Module reference
    const moduleRef = db
      .collection("freshers")
      .doc(fresherId)
      .collection("departments")
      .doc(department)
      .collection("users")
      .doc(userId)
      .collection("roadmap")
      .doc(moduleId);

    // 🔹 AI Data reference
    const aiRef = moduleRef.collection("moduleDetails").doc("aiData");

    // 1️⃣ Check if AI data already exists
    const aiSnap = await aiRef.get();

    if (aiSnap.exists) {
      console.log("✅ Returning cached AI data");
      return res.json({ content: aiSnap.data(), source: "database" });
    }

    // 2️⃣ Generate using Gemini
    console.log("⚡ Generating from Gemini...");

    const prompt = `
You are an expert corporate trainer.

Explain the following training module clearly and professionally.

Module Title: ${moduleTitle}
Description: ${description}
Duration: ${estimatedDays} days
Skills: ${skillsCovered?.join(", ") || "Professional skills"}

IMPORTANT:
Return ONLY valid JSON.
Do NOT wrap in markdown or code blocks.

{
  "overview": "string",
  "whatYouWillLearn": ["string"],
  "skillsBreakdown": ["string"],
  "learningOutcome": "string",
  "realWorldApplication": "string"
}
`;

    const model = initializeModuleModel();
    const result = await model.generateContent(prompt);

    let text = result.response.text().trim();

    // ✅ Remove markdown/code blocks if present
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    // ✅ Extract JSON safely
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      console.error("❌ No valid JSON found:", text);
      return res.status(500).json({ error: "AI returned invalid JSON format" });
    }

    const cleanJson = text.substring(jsonStart, jsonEnd + 1);

    let jsonOutput;

    try {
      jsonOutput = JSON.parse(cleanJson);
    } catch (err) {
      console.error("❌ JSON Parse Error:", cleanJson);
      return res.status(500).json({ error: "AI returned invalid JSON" });
    }

    // 3️⃣ Save to Firestore
    await aiRef.set({
      ...jsonOutput,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("💾 Saved AI data to Firestore");

    res.json({ content: jsonOutput, source: "ai" });

  } catch (err) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
