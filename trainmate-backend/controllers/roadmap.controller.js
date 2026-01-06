import axios from "axios";
import { db } from "../config/firebase.js";
import { extractFileText } from "../utils/TextExtractor.js";
import { queryPinecone } from "../services/pineconeService.js";
import { generateRoadmap } from "../services/llmService.js";
import { extractSkillsFromText } from "../services/skillExtractor.service.js"; // new utility

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

    console.log("📦 Request body:", req.body);

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
    if (!userSnap.exists) return res.status(404).json({ error: "User not found" });
    const user = userSnap.data();
    console.log("✅ User fetched:", user.name);

    if (!user.onboarding?.onboardingCompleted || !user.cvUrl) {
      return res.status(400).json({ error: "Onboarding incomplete" });
    }

    /* -------------------------
       2️⃣ Normalize Inputs
    ------------------------- */
    const trainingOn = trainingOnFromClient || user.trainingOn || "General";
    const expertise = expertiseScore ?? user.expertise ?? 1;
    const level = expertiseLevel || user.level || "Beginner";
    const finalTrainingDuration = trainingTime || "1 month";

    console.log("🎯 FINAL VALUES USED:", { trainingOn, expertise, level, finalTrainingDuration });

    /* -------------------------
       3️⃣ Download & Extract CV
    ------------------------- */
    console.log("[FILE-PARSE] Downloading CV:", user.cvUrl);
    const cvResponse = await axios.get(user.cvUrl, { responseType: "arraybuffer" });
    const fileType = user.cvUrl.endsWith(".pdf") ? "pdf" : "docx";
    const cvText = await extractFileText(cvResponse.data, fileType);
    console.log("[FILE-PARSE] CV text extracted, length:", cvText.length);

    /* -------------------------
       4️⃣ Extract skills from CV
    ------------------------- */
    const cvSkills = extractSkillsFromText(cvText);
    console.log("📄 Skills extracted from CV:", cvSkills);

    /* -------------------------
       5️⃣ Fetch company docs from Pinecone
    ------------------------- */
    const pineconeContext = await queryPinecone({ companyId, deptName: deptId });
    const companyDocsText = pineconeContext.map((c, i) => c.text).join("\n");
    const companySkills = extractSkillsFromText(companyDocsText);
    console.log(`📚 Pinecone skills for ${deptId}:`, companySkills);

    /* -------------------------
       6️⃣ Identify skill gap
    ------------------------- */
    const skillGap = companySkills.filter(s => !cvSkills.includes(s));
    console.log("⚡ Skill gap identified:", skillGap);

    /* -------------------------
       7️⃣ Generate roadmap via LLM
    ------------------------- */
    const roadmapModules = await generateRoadmap({
      cvText,
      pineconeContext, // optional
      trainingOn,
      expertise,
      level,
      trainingDuration: finalTrainingDuration,
      skillGap, // pass skill gaps to LLM
    });

    /* -------------------------
       8️⃣ Save roadmap to Firestore
    ------------------------- */
    const roadmapCollection = userRef.collection("roadmap");
    for (let i = 0; i < roadmapModules.length; i++) {
      await roadmapCollection.add({
        ...roadmapModules[i],
        skillsCovered: roadmapModules[i].skillsCovered || [],
        order: i + 1,
        status: "pending",
        createdAt: new Date(),
      });
    }

    console.log("✅ Roadmap saved to Firestore, modules:", roadmapModules.length);
    return res.json({ success: true, modules: roadmapModules });

  } catch (error) {
    console.error("🔥 Roadmap generation failed:", error.stack);
    return res.status(500).json({ error: error.message || "Roadmap generation failed" });
  }
};
