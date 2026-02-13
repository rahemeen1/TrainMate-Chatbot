// controllers/accomplishment.controller.js
import { db } from "../config/firebase.js";
import { getModuleStatus } from "../utils/status.util.js";
import { generateAccomplishmentText } from "../services/gemini.service.js";

export const generateAccomplishment = async (req, res) => {
  try {
    console.log("📥 Request body:", req.body);
    const { companyId, deptId, userId, moduleId } = req.body;
    if (!companyId || !deptId || !userId || !moduleId) {
      console.log("❌ Missing fields");
      return res.status(400).json({ error: "Missing required fields" });
    }
    const roadmapRef = db 
      .collection("freshers").doc(companyId)
      .collection("departments").doc(deptId)
      .collection("users").doc(userId)
      .collection("roadmap").doc(moduleId);

    const roadmapSnap = await roadmapRef.get();
    if (!roadmapSnap.exists) {
      return res.status(404).json({ error: "Module not found" });
    }

    const moduleData = roadmapSnap.data();

    const summaryRef = roadmapRef
      .collection("agentMemory")
      .doc("summary");

    const summarySnap = await summaryRef.get();
    if (!summarySnap.exists) {
      return res.status(404).json({ error: "Agent summary missing" });
    }

    const summary = summarySnap.data();

    const accomplishment = await generateAccomplishmentText({
      moduleTitle: moduleData.moduleTitle,
      status: getModuleStatus(moduleData),
      summary: summary.summary,
      strongAreas: summary.strongAreas,
      masteredTopics: summary.masteredTopics,
      score: summary.quizAttempts?.[0]?.score || 0,
    });

    await summaryRef.update({
      generatedAccomplishment: accomplishment,
      updatedAt: new Date(),
    });

    res.json({ accomplishment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Generation failed" });
  }
};
