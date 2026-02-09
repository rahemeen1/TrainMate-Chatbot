//trainmate-backend/controllers/chatController.js
import { db } from "../config/firebase.js"; // Admin SDK
import admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";
import { CohereClient } from "cohere-ai";
import { isSemanticallyRelevant } from "../utils/relevanceGuard.js";
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
  const totalDays = moduleData.estimatedDays;

  if (!moduleData.createdAt) {
    return {
      completedDays: 0,
      remainingDays: totalDays,
    };
  }

  const startDate = moduleData.createdAt.toDate
    ? moduleData.createdAt.toDate()
    : new Date(moduleData.createdAt);

  const today = new Date();

  // normalize both to midnight (CRITICAL)
  startDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays =
    Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;

  const completedDays = Math.min(diffDays, totalDays);
  const remainingDays = Math.max(totalDays - completedDays, 0);

  return {
    completedDays,
    remainingDays,
  };
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
 Welcome to TrainMate!

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


export const chatController = async (req, res) => {
  try {
    console.log("🟡 chatController body:", req.body);
    const { userId, companyId, deptId, newMessage } = req.body;

    if (!userId || !companyId || !deptId || !newMessage) {
      return res.json({ reply: "Missing parameters" });
    }

    // 1️⃣ Get user data
    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    // 2️⃣ Get roadmap & active module
    const roadmapRef = userRef.collection("roadmap");
    const roadmapSnap = await roadmapRef.get();
    if (roadmapSnap.empty) return res.json({ reply: "Your roadmap does not exist. Please generate it first." });

    const activeModuleDoc = roadmapSnap.docs.find(d => ["pending", "in-progress"].includes(d.data().status));
    if (!activeModuleDoc) return res.json({ reply: "You don’t have any active training module right now." });

    const moduleData = activeModuleDoc.data();
    const { completedDays, remainingDays } = calculateTrainingProgress(moduleData);

    // 3️⃣ Chat session for today
    const today = new Date().toISOString().split("T")[0];
    const chatSessionRef = roadmapRef.doc(activeModuleDoc.id).collection("chatSessions").doc(today);
    const chatSnap = await chatSessionRef.get();
    if (!chatSnap.exists) await chatSessionRef.set({ startedAt: new Date(), messages: [] });

    // 4️⃣ Embed user message & query Pinecone
    const embedding = await embedText(newMessage);
    let pineconeResults = [];
    try {
      pineconeResults = await queryPinecone({ embedding, companyId, deptId });
    } catch (err) {
      console.error("⚠️ Pinecone query failed:", err);
    }
    

    // 5️⃣ Load agent memory
    const memoryRef = roadmapRef.doc(activeModuleDoc.id).collection("agentMemory").doc("summary");
    const memorySnap = await memoryRef.get();
    const agentMemory = memorySnap.exists ? memorySnap.data().summary : "No prior memory available.";

    // 6️⃣ Load previous chat sessions for context
    const allChatsSnap = await roadmapRef.doc(activeModuleDoc.id).collection("chatSessions").orderBy("startedAt", "asc").get();
    let chatHistory = [];
    allChatsSnap.forEach(doc => {
      const data = doc.data();
      if (data.messages && Array.isArray(data.messages)) chatHistory.push(...data.messages);
    });
    const formattedChatHistory = chatHistory.slice(-50).map(m => `${m.from === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join("\n");

    // 7️⃣ Get company onboarding info
    const onboardingRef = db.collection("companies").doc(companyId).collection("onboardingAnswers");
    const onboardingSnap = await onboardingRef.get();
    let companyDescription = "";
    let companyDocName = "";
    onboardingSnap.forEach(d => {
      const answers = d.data().answers;
      if (answers && answers["3"]) {
        companyDescription = answers["3"];
        companyDocName = d.id;
      }
    });

    
    // 8️⃣ Build reference context
    const contextParts = [];
// Only keep Pinecone results relevant to the user's department
const relevantPineconeResults = pineconeResults.filter(
  r => r.deptName === (userData.deptName || deptId) && r.score >= 0.35
);

const hasRelevantSource = relevantPineconeResults.length > 0;

if (hasRelevantSource) {
  contextParts.push(
    `REFERENCE MATERIAL (for explanation only):\n${relevantPineconeResults.map(r => r.text || r).join("\n")}`
  );
}

    if (companyDescription) contextParts.push(`Company Info:\n${companyDescription} *${companyDocName}*`);
    if (formattedChatHistory) contextParts.push(`PREVIOUS CONVERSATION CONTEXT:\n${formattedChatHistory}`);
    const context = contextParts.length > 0 ? contextParts.join("\n\n") : "No additional context available.";

    // 9️⃣ Progress message
    const progressMessage = remainingDays === 0
      ? `The user has completed the module "${moduleData.moduleTitle}".`
      : `The user is on day ${completedDays} of ${moduleData.estimatedDays} for "${moduleData.moduleTitle}".`;

    // 10️⃣ Build final prompt for LLM
    const finalPrompt = `
SYSTEM ROLE:
You are TrainMate, a goal-driven onboarding agent.

AGENT MEMORY:
${agentMemory}

USER PROFILE:
Name: ${userData.name}
Department: ${userData.deptName || deptId}

ACTIVE MODULE:
${moduleData.moduleTitle}

TRAINING STATUS:
${progressMessage}

RULES:
- Use agent memory and previous chat history to maintain continuity.
- Do NOT repeat explanations unless explicitly asked.
- Only answer questions relevant to the active module and department.
- Use HTML tags only (<strong>, <em>, <ul>, <ol>, <li>).
- Do not answer questions unrelated to the active module or department.
- If unsure, say "I cannot determine it."
- Keep responses concise and helpful.

OPTIONAL CONTEXT:
${context}

USER MESSAGE:
${newMessage}
`;

    // 11️⃣ Relevance check before generating
    const memoryIntents = ["summarize", "previous", "last", "step", "earlier"];
    const isMemoryQuestion = memoryIntents.some(k => newMessage.toLowerCase().includes(k));

    if (!hasRelevantSource && !isMemoryQuestion) {
      return res.json({
        reply: "I can only help with topics related to your current training module and department."
      });
    }

    // 12️⃣ Generate bot reply
    let botReply = "";
    try {
      const completion = await model.generateContent(finalPrompt);
      botReply = completion?.response?.text() || "I’m trained only to assist you with your active module.";

      // ✅ Update agent memory AFTER botReply
      const memoryUpdatePrompt = `
Summarize this conversation update into 2–3 sentences.
Focus on:
- What the user learned
- Current step or topic
- Any confusion or pending task

User message:
${newMessage}

Assistant reply:
${botReply}
`;

      const memoryCompletion = await model.generateContent(memoryUpdatePrompt);
      const updatedMemory = memoryCompletion?.response?.text();
      if (updatedMemory) {
        await memoryRef.set({
          summary: updatedMemory,
          lastUpdated: new Date(),
        });
      }

    } catch (err) {
      if (err.status === 429) botReply = "🚨 LLM quota exceeded for today. Please try again later.";
      else {
        console.error("❌ LLM generateContent failed:", err);
        botReply = "I’m trained only to assist you with your active module.";
      }
    }

    // 13️⃣ Store messages
    await chatSessionRef.update({
      messages: admin.firestore.FieldValue.arrayUnion({ from: "user", text: newMessage, timestamp: new Date() }),
    });
    await chatSessionRef.update({
      messages: admin.firestore.FieldValue.arrayUnion({ from: "bot", text: botReply, timestamp: new Date() }),
    });

    // 14️⃣ Return bot reply
    return res.json({ reply: botReply, sourceUsed: hasRelevantSource });
  } catch (err) {
    console.error("❌ chatController error FULL:", err);
    return res.json({ reply: "⚠️ Something went wrong. Try again later." });
  }
};

