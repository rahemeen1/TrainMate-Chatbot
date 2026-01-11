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
      (d) => d.data().status === "in-progress"
    );
    if (!activeModuleDoc) {
      return res.json({
        reply: "You don’t have any active training module right now.",
      });
    }

    const moduleData = activeModuleDoc.data();

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
      (d) => d.data().status === "in-progress"
    );
    if (!activeModuleDoc) {
      return res.json({ reply: "You don’t have any active training module right now." });
    }

    const moduleData = activeModuleDoc.data();

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
    if (pineconeResults.length > 0) contextParts.push(pineconeResults.join("\n"));
    if (companyDescription) contextParts.push(`Company Info:\n${companyDescription} *${companyDocName}*`);
    const context = contextParts.length > 0 ? contextParts.join("\n\n") : "No additional context available.";

    // Construct prompt
    const prompt = `
You are TrainMate, a friendly onboarding assistant.

ACTIVE MODULE:
${moduleData.moduleTitle}

RULES:
- Answer ONLY related to the active module.
- If question is outside the module but about the company, use company info.
- Always add small italics at the end if using company doc for reference (*docName*).
- Never use bold text.
- If question is outside module and unrelated to company, politely refuse.
- Do not add ** on any text.

CONTEXT:
${context}

QUESTION:
${newMessage}
    `;

    // Generate response
    let botReply = "";
try {
  const completion = await model.generateContent(prompt);
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
