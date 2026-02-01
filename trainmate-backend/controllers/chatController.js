//trainmate-backend/controllers/chatController.js
import { db } from "../config/firebase.js"; // Admin SDK
import admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";
import { CohereClient } from "cohere-ai";
import dotenv from "dotenv";

dotenv.config();

/* ================= LLM ================= */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/* ================= COHERE ================= */
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
async function embedText(text) {
  const res = await cohere.embed({
    model: "embed-english-v3.0",
    texts: [text],
    inputType: "search_query",
  });
  return res.embeddings[0];
}

// ================= TRAINING PROGRESS =================
function calculateTrainingProgress(moduleData) {
  if (!moduleData.createdAt || !moduleData.estimatedDays) {
    return { completedDays: 0, remainingDays: moduleData.estimatedDays || 0 };
  }

  const createdAt = moduleData.createdAt.toDate();
  const today = new Date();

  const diffTime = today.getTime() - createdAt.getTime();
  const completedDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const totalDays = moduleData.estimatedDays;
  const safeCompleted = Math.min(completedDays, totalDays);
  const remainingDays = Math.max(totalDays - safeCompleted, 0);

  return { completedDays: safeCompleted, remainingDays };
}


/* ================= PINECONE ================= */
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
async function queryPinecone({ embedding, companyId, deptId, topK = 5 }) {
  const index = pinecone.Index(process.env.PINECONE_INDEX).namespace(
    `company-${companyId}`
  );
  const res = await index.query({
    vector: embedding,
    topK,
    includeMetadata: true,
    filter: { deptName: { $eq: deptId.toUpperCase() } },
  });
  return (res.matches || []).map((m) => m.metadata?.text || "");
}

/* ================= INIT CHAT ================= */
export const initChat = async (req, res) => {
  try {
    console.log("🟡 initChat body:", req.body);
    const { userId, companyId, deptId } = req.body;

    if (!userId || !companyId || !deptId) {
      return res.json({ reply: "Invalid request." });
    }

    const roadmapRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap");

    const roadmapSnap = await roadmapRef.get();
    console.log("🟢 roadmapSnap size:", roadmapSnap.size);

    if (roadmapSnap.empty) {
      return res.json({
        reply:
          "✨ Welcome to TrainMate!\n\n" +
          "Your learning roadmap hasn’t been generated yet.\n" +
          "Please generate your roadmap first to start learning 🚀",
      });
    }

    const activeModuleDoc = roadmapSnap.docs.find(
       (d) => d.data().status === "pending" || d.data().status === "in-progress"
    );
    if (!activeModuleDoc) {
      return res.json({
        reply: "You don’t have any active training module right now.",
      });
    }

    const moduleData = activeModuleDoc.data();
    const { completedDays, remainingDays } =
    calculateTrainingProgress(moduleData);


    // Chat session today
    const today = new Date().toISOString().split("T")[0];
    const chatSessionRef = roadmapRef
      .doc(activeModuleDoc.id)
      .collection("chatSessions")
      .doc(today);

    const chatSnap = await chatSessionRef.get();
    let firstTimeToday = false;
    if (!chatSnap.exists) {
      firstTimeToday = true;
      await chatSessionRef.set({ startedAt: new Date(), messages: [] });
    }

    // ✅ Company onboarding info (keep it for later, but don’t send now)
    const onboardingRef = db
      .collection("companies")
      .doc(companyId)
      .collection("onboardingAnswers");

    const onboardingSnap = await onboardingRef.get();
    let companyDescription = "";
    onboardingSnap.forEach((d) => {
      const answers = d.data().answers;
      if (answers && answers["3"]) companyDescription = answers["3"];
    });

    // Store companyDescription in chat metadata or session for LLM use
    await chatSessionRef.update({ companyDescription });

    // First time today reply (without company info)
    if (firstTimeToday) {
      const reply = `
🎯 Welcome to TrainMate!

Hi! Your active module is "${moduleData.moduleTitle}".
In this module, you will learn: ${moduleData.description || "details coming soon"}.

Let's get started and have fun learning! 🚀
      `;
      return res.json({ reply });
    }

    // Returning user reply (without company info)
    return res.json({
      reply: `Welcome back! Your active module is "${moduleData.moduleTitle}". Ask me anything related to this module.`,
    });
  } catch (err) {
    console.error("❌ initChat error FULL:", err);
    return res.json({ reply: "Failed to start training session." });
  }
};


/* ================= CHAT CONTROLLER ================= */
/* ================= CHAT CONTROLLER ================= */
export const chatController = async (req, res) => {
  try {
    console.log("🟡 chatController body:", req.body);
    const { userId, companyId, deptId, newMessage } = req.body;

    if (!userId || !companyId || !deptId || !newMessage) {
      return res.json({ reply: "Missing parameters" });
    }
    const userRef = db
  .collection("freshers")
  .doc(companyId)
  .collection("departments")
  .doc(deptId)
  .collection("users")
  .doc(userId);

const userSnap = await userRef.get();
const userData = userSnap.exists ? userSnap.data() : {};

    const roadmapRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap");

    const roadmapSnap = await roadmapRef.get();
    if (roadmapSnap.empty) {
      return res.json({ reply: "Your roadmap does not exist. Please generate it first." });
    }

    const activeModuleDoc = roadmapSnap.docs.find(
       (d) => d.data().status === "pending" || d.data().status === "in-progress"
    );
    if (!activeModuleDoc) {
      return res.json({ reply: "You don’t have any active training module right now." });
    }

    const moduleData = activeModuleDoc.data();
    const { completedDays, remainingDays } =
  calculateTrainingProgress(moduleData);


    const today = new Date().toISOString().split("T")[0];
    const chatSessionRef = roadmapRef
      .doc(activeModuleDoc.id)
      .collection("chatSessions")
      .doc(today);

    const chatSnap = await chatSessionRef.get();
    if (!chatSnap.exists) {
      await chatSessionRef.set({ startedAt: new Date(), messages: [] });
    }

    // Embed the user question
    const embedding = await embedText(newMessage);

    // Query Pinecone for module context
    let pineconeResults = [];
    try {
      pineconeResults = await queryPinecone({ embedding, companyId, deptId });
    } catch (err) {
      console.error("⚠️ Pinecone query failed:", err);
    }

    // Get company description from Firestore
    const onboardingRef = db
      .collection("companies")
      .doc(companyId)
      .collection("onboardingAnswers");
    const onboardingSnap = await onboardingRef.get();

    let companyDescription = "";
    let companyDocName = "";
    onboardingSnap.forEach((d) => {
      const answers = d.data().answers;
      if (answers && answers["3"]) {
        companyDescription = answers["3"];
        companyDocName = d.id;
      }
    });

    // Prepare context: include module-specific context if any
    const contextParts = [];
    // if (pineconeResults.length > 0) contextParts.push(pineconeResults.join("\n"));
    if (pineconeResults.length > 0)
  contextParts.push(`REFERENCE MATERIAL (use only to explain concepts):\n${pineconeResults.join("\n")}`);

    if (companyDescription) contextParts.push(`Company Info:\n${companyDescription} *${companyDocName}*`);
    const context = contextParts.length > 0 ? contextParts.join("\n\n") : "No additional context available.";

    // Construct prompt
    const prompt = `
SYSTEM DATA (authoritative, must be used when relevant):
- User profile, training progress, and module status come directly from the database.
- This data is always accurate and should be reflected in responses naturally.


You are TrainMate, a friendly onboarding assistant.

USER PROFILE:
- Name: ${userData.name || "Trainee"}
- Department: ${userData.deptName || deptId}
- Company: ${userData.companyName || "Company"}
- Training Status: ${userData.trainingStatus || "ongoing"}

ACTIVE MODULE:
${moduleData.moduleTitle}

TRAINING STATUS:
- Total training days: ${moduleData.estimatedDays}
- Completed days: ${completedDays}
- Remaining days: ${remainingDays}

RULES:
- Answer primarily related to the active module.
- You are allowed to use system-provided data such as user profile, training progress, and module metadata for personalization.
- If the question is outside the module but about the company, use company onboarding info.- Only when you explicitly mention company policies, culture, or onboarding details, add a small italic reference at the end (*docName*).
- When company onboarding info is used, add small italics at the end as a reference (*docName*).
- If a question can be answered using module data or user training data, do NOT use company onboarding documents.
- If the question is outside the module and unrelated to both the module and company, politely refuse.
- Do not use bold text or ** anywhere in the response.
- Keep the tone friendly and encouraging.


CONTEXT:
${context}

QUESTION:
${newMessage}
    `;

  const progressMessage =
  remainingDays === 0
    ? `Great job ${userData.name}! You have completed the "${moduleData.moduleTitle}" module.`
    : `Hi ${userData.name}, you have completed ${completedDays} out of ${moduleData.estimatedDays} training days for "${moduleData.moduleTitle}". ${remainingDays} days are remaining.`;

const finalPrompt = progressMessage + "\n\n" + prompt;

    // Generate response
    let botReply = "";
try {
  const completion = await model.generateContent(finalPrompt);

  //const completion = await model.generateContent(prompt);
  botReply = completion?.response?.text() || "I’m trained only to assist you with your active module.";
} catch (err) {
  if (err.status === 429) {
    botReply = "🚨 LLM quota exceeded for today. Please try again later.";
  } else {
    console.error("❌ LLM generateContent failed:", err);
    botReply = "I’m trained only to assist you with your active module.";
  }
}
    // Store messages
    await chatSessionRef.update({
      messages: admin.firestore.FieldValue.arrayUnion({ from: "user", text: newMessage, timestamp: new Date() }),
    });
    await chatSessionRef.update({
      messages: admin.firestore.FieldValue.arrayUnion({ from: "bot", text: botReply, timestamp: new Date() }),
    });

    return res.json({ reply: botReply });
  } catch (err) {
    console.error("❌ chatController error FULL:", err);
    return res.json({ reply: "⚠️ Something went wrong. Try again later." });
  }
};
