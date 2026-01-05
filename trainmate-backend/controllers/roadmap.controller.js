import axios from "axios";
import { db } from "../config/firebase.js";

import { extractFileText } from "../utils/TextExtractor.js";
import { queryPinecone } from "../services/pineconeService.js";
import { generateRoadmap } from "../services/llmService.js";

export const generateUserRoadmap = async (req, res) => {
  console.log("🚀 Roadmap generation request received");

  try {
    const { companyId, deptId, userId } = req.body;
    console.log("📥 Input:", { companyId, deptId, userId });

    // ✅ ADMIN SDK FIRESTORE
    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userSnap.data();
    console.log("✅ User fetched:", user.name);

    if (!user.onboarding?.onboardingCompleted || !user.cvUrl) {
      return res.status(400).json({ error: "Onboarding incomplete" });
    }

    const { trainingOn, expertise, level, cvUrl } = user;

    // 🔽 CV DOWNLOAD
    const cvResponse = await axios.get(cvUrl, {
      responseType: "arraybuffer",
    });

    const fileType = cvUrl.endsWith(".pdf") ? "pdf" : "docx";
    const cvText = await extractFileText(cvResponse.data, fileType);

    // 🔍 PINECONE
    const pineconeContext = await queryPinecone({
      companyId,
      deptName: deptId,
    });

    // 🧠 LLM
    const roadmapModules = await generateRoadmap({
      cvText,
      pineconeContext,
      trainingOn,
      expertise,
      level,
    });

    // 💾 SAVE ROADMAP
    const roadmapCollection = userRef.collection("roadmap");

    for (let i = 0; i < roadmapModules.length; i++) {
      await roadmapCollection.add({
        ...roadmapModules[i],
        order: i + 1,
        status: "pending",
        createdAt: new Date(),
      });
    }

    return res.json({
      success: true,
      modules: roadmapModules,
    });

  } catch (error) {
    console.error("🔥 Roadmap generation failed:", error.stack);
    return res.status(500).json({
      error: error.message || "Roadmap generation failed",
    });
  }
};
