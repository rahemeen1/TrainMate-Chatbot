import axios from "axios";
import { db } from "../config/firebase.js";

import { extractFileText } from "../utils/TextExtractor.js";
import { queryPinecone } from "../services/pineconeService.js";
import { generateRoadmap } from "../services/llmService.js";

export const generateUserRoadmap = async (req, res) => {
  console.log("🚀 Roadmap generation request received");

  try {
    const {
      companyId,
      deptId,
      userId,
      trainingTime,
      expertiseScore,
      expertiseLevel,
      trainingOn: trainingOnFromClient,
    } = req.body;

    console.log("📥 Input:", req.body);

    /* -------------------------
       1️⃣ Fetch User
    ------------------------- */
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
      return res.status(400).json({
        error: "Onboarding incomplete or CV missing",
      });
    }

    /* -------------------------
       2️⃣ Prevent Duplicate Roadmap
    ------------------------- */
    const roadmapSnap = await userRef
      .collection("roadmap")
      .limit(1)
      .get();

    if (!roadmapSnap.empty) {
      console.warn("⚠ Roadmap already exists. Skipping generation.");

      return res.json({
        success: true,
        skipped: true,
        message: "Roadmap already exists",
      });
    }

    /* -------------------------
       3️⃣ Normalize Inputs (FINAL)
    ------------------------- */
    const trainingOn =
      trainingOnFromClient ||
      user.trainingOn ||
      "General";

    const expertise =
      expertiseScore ??
      user.onboarding?.expertise ??
      1;

    const level =
      expertiseLevel ||
      user.onboarding?.level ||
      "Beginner";

    const finalTrainingDuration =
      trainingTime || "1 month";

    console.log("🎯 FINAL VALUES USED:", {
      trainingOn,
      expertise,
      level,
      finalTrainingDuration,
    });

    /* -------------------------
       4️⃣ Download & Extract CV
    ------------------------- */
    const cvResponse = await axios.get(user.cvUrl, {
      responseType: "arraybuffer",
    });

    const fileType = user.cvUrl.endsWith(".pdf")
      ? "pdf"
      : "docx";

    const cvText = await extractFileText(
      cvResponse.data,
      fileType
    );

    /* -------------------------
       5️⃣ Pinecone Context
    ------------------------- */
    const pineconeContext = await queryPinecone({
      companyId,
      deptName: deptId,
    });

    /* -------------------------
       6️⃣ Generate Roadmap (LLM)
    ------------------------- */
    const roadmapModules = await generateRoadmap({
      cvText,
      pineconeContext,
      trainingOn,
      expertise,
      level,
      trainingDuration: finalTrainingDuration,
    });

    if (!Array.isArray(roadmapModules) || !roadmapModules.length) {
      throw new Error("LLM returned empty roadmap");
    }

    /* -------------------------
       7️⃣ Save Roadmap (ORDERED)
    ------------------------- */
    const roadmapCollection = userRef.collection("roadmap");

    const batch = db.batch();

    roadmapModules.forEach((module, index) => {
      const docRef = roadmapCollection.doc();
      batch.set(docRef, {
        ...module,
        order: index + 1,
        status: "pending",
        createdAt: new Date(),
      });
    });

    await batch.commit();

    console.log("✅ Roadmap saved successfully");

    return res.json({
      success: true,
      modules: roadmapModules,
    });

  } catch (error) {
    console.error("🔥 Roadmap generation failed:", error);

    return res.status(500).json({
      error: error.message || "Roadmap generation failed",
    });
  }
};
