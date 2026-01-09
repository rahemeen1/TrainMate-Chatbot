// trainmate-backend/controllers/roadmap.controller.js
import axios from "axios";
import { db } from "../config/firebase.js";
import { extractFileText } from "../utils/TextExtractor.js";
import { retrieveDeptDocsFromPinecone } from "../services/pineconeService.js";
import { generateRoadmap } from "../services/llmService.js";
import { extractSkillsFromText } from "../services/skillExtractor.service.js";
//import { generateModuleInsights } from "../services/moduleInsightsService.js";

export const generateUserRoadmap = async (req, res) => {
  console.log("🚀 Roadmap generation request received");
  console.log("📦 Request body:", req.body);

  try {
    const {
      companyId,
      deptId,
      userId,
      trainingTime,
      trainingOn: trainingOnFromClient,
      expertiseScore,
      expertiseLevel,
    } = req.body;

    console.log("👤 Fetching user from Firestore...");

    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      console.error("❌ User not found");
      return res.status(404).json({ error: "User not found" });
    }

    const user = userSnap.data();
    console.log("✅ User fetched:", user.name);

    if (!user.onboarding?.onboardingCompleted || !user.cvUrl) {
      console.warn("⚠️ Onboarding incomplete or CV missing");
      return res.status(400).json({ error: "Onboarding incomplete" });
    }

  // 1️⃣ Fetch onboarding duration
const onboardingRef = db
  .collection("companies")
  .doc(companyId)
  .collection("onboardingAnswers");

const onboardingSnap = await onboardingRef
  .orderBy("createdAt", "desc") // 🔥 KEY FIX
  .limit(1)
  .get();

let trainingDurationFromOnboarding = null;

if (!onboardingSnap.empty) {
  const data = onboardingSnap.docs[0].data();
  trainingDurationFromOnboarding = data?.answers?.["1"] || null; 
}

console.log("🎯 Training duration from onboarding:", trainingDurationFromOnboarding);

    const trainingOn = trainingOnFromClient || user.trainingOn || "General";
    const expertise = expertiseScore ?? user.expertise ?? 1;
    const level = expertiseLevel || user.level || "Beginner";
    const finalTrainingDuration = trainingDurationFromOnboarding;

    console.log("🎯 FINAL VALUES USED:", {
      trainingOn,
      expertise,
      level,
      trainingDuration: finalTrainingDuration,
    });

    /* --------------------------------------------------
       3️⃣ Download & Extract CV
    -------------------------------------------------- */
    console.log("📄 Downloading CV:", user.cvUrl);

    const cvResponse = await axios.get(user.cvUrl, {
      responseType: "arraybuffer",
    });

    const fileType = user.cvUrl.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : "docx";

    const cvText = await extractFileText(cvResponse.data, fileType);

    if (!cvText || typeof cvText !== "string") {
      throw new Error("❌ CV text extraction failed");
    }

    console.log("✅ CV text extracted, length:", cvText.length);

    /* --------------------------------------------------
       4️⃣ Extract Skills from CV
    -------------------------------------------------- */
    console.log("🧠 Extracting skills from CV...");
    const cvSkills = extractSkillsFromText(cvText);
    console.log("📄 Skills extracted from CV:", cvSkills);

    /* --------------------------------------------------
       5️⃣ Fetch Department Docs from Pinecone
    -------------------------------------------------- */
    console.log("🔎 Fetching Pinecone documents...");

    const pineconeContext = await retrieveDeptDocsFromPinecone({
      queryText: cvText,        // ✅ always string
      companyId,
      deptName: deptId,         // ✅ FIXED (no undefined)
    });

    if (!Array.isArray(pineconeContext)) {
      console.warn("⚠️ Pinecone returned empty or invalid context");
    }

    const companyDocsText = Array.isArray(pineconeContext)
      ? pineconeContext.map((c) => c.text || "").join("\n")
      : "";

    /* --------------------------------------------------
       6️⃣ Extract Company Skills + Skill Gap
    -------------------------------------------------- */
    const companySkills = extractSkillsFromText(companyDocsText);
    console.log(`📚 Pinecone skills for ${deptId}:`, companySkills);

    const skillGap = companySkills.filter(
      (skill) => !cvSkills.includes(skill)
    );

    console.log("⚡ Skill gap identified:", skillGap);

    /* --------------------------------------------------
       7️⃣ Generate Roadmap via LLM
    -------------------------------------------------- */
    console.log("🤖 Generating roadmap via LLM...");

    const roadmapModules = await generateRoadmap({
      cvText,
      pineconeContext,
      expertise,
      trainingOn, 
      level,
      trainingDuration: finalTrainingDuration,
      skillGap,
    });

    if (!Array.isArray(roadmapModules)) {
      throw new Error("❌ LLM did not return roadmap modules");
    }

    console.log("✅ Roadmap generated, modules:", roadmapModules.length);

    /* --------------------------------------------------
       8️⃣ Save Roadmap to Firestore
    -------------------------------------------------- */
    console.log("💾 Saving roadmap to Firestore...");

    const roadmapCollection = userRef.collection("roadmap");

    for (let i = 0; i < roadmapModules.length; i++) {
      await roadmapCollection.add({
        ...roadmapModules[i],
        skillsCovered: roadmapModules[i].skillsCovered || [],
        order: i + 1,
        completed: false, 
        status: "pending",
        createdAt: new Date(),
      });
    }

    console.log("🎉 Roadmap saved successfully");
  
//   /* --------------------------------------------------
//    8️⃣ Save Roadmap + Module Insights to Firestore
// -------------------------------------------------- */

// console.log("💾 Saving roadmap with insights...");

// const roadmapCollection = userRef.collection("roadmap");

// for (let i = 0; i < roadmapModules.length; i++) {
//   const module = roadmapModules[i];
//   console.log(`🧩 Generating insights for module ${i + 1}:`, module.moduleTitle);
//   let insights = null;

// try {
//   insights = await generateModuleInsights({
//     moduleTitle: module.moduleTitle,
//     description: module.description,
//     level,
//   });
// } catch (err) {
//   console.error("❌ Insights generation failed:", err.message);
//   insights = {
//     whyThisMatters: "This module strengthens your professional foundation.",
//     keyTopics: [],
//     toolsYouWillUse: [],
//     outcomes: [],
//   };
// }
//   await roadmapCollection.add({
//     ...module,
//     insights,              // ✅ THIS is what frontend will show
//     order: i + 1,
//     completed: false,
//     status: "pending",
//     createdAt: new Date(),
//   });
// };

//console.log("🎉 Roadmap with insights saved successfully");

    return res.json({
      success: true,
      modules: roadmapModules,
    });

  } catch (error) {
    console.error("🔥 Roadmap generation failed:");
    console.error(error);
    return res.status(500).json({
      error: error.message || "Roadmap generation failed",
    });
  }
};
