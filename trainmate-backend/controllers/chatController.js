//trainmate-backend/controllers/chatController.js
import { db } from "../config/firebase.js"; // Admin SDK
import admin from "firebase-admin";
import { getPineconeIndex } from "../config/pinecone.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CohereClient } from "cohere-ai";
import dotenv from "dotenv";
import { isDocAllowed } from "../utils/relevanceGuard.js";
import { updateMemoryAfterChat, getAgentMemory } from "../services/memoryService.js";



dotenv.config();

/* ================= LLM ================= */
let model = null;

function initializeChatModel() {
  if (!model) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return model;
}

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
async function queryPinecone({ embedding, companyId, deptId, topK = 5 }) {
  try {
    console.log("🔍 Pinecone query started");
    console.log("   Company:", companyId);
    console.log("   Department:", deptId);
    console.log("   TopK:", topK);

    const index = getPineconeIndex();

    const res = await index
      .namespace(`company-${companyId}`)
      .query({
        vector: embedding,
        topK,
        includeMetadata: true,
        filter: {
          deptName: { $eq: deptId.toUpperCase() },
        },
      });

    const matchCount = res?.matches?.length || 0;

    console.log(`📚 Pinecone results: ${matchCount}`);

    if (matchCount > 0) {
      console.log(
        "🧾 Pinecone sources:",
        res.matches.map((m) => ({
          score: m.score,
          dept: m.metadata?.deptName,
        }))
      );
    } else {
      console.log("⚠️ Pinecone returned no matches");
    }

    return (res.matches || []).map((m) => ({
      text: m.metadata?.text || "",
      score: m.score || 0,
      source: "pinecone",
    }));
  } catch (err) {
    console.error("❌ Pinecone query failed:", err.message);
    return [];
  }
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
    const { userId, companyId, deptId, newMessage } = req.body;
    if (!userId || !companyId || !deptId || !newMessage) {
      return res.json({ reply: "Missing parameters" });
    }

    /* ---------- USER ---------- */
    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    /* ---------- ACTIVE MODULE ---------- */
    const roadmapRef = userRef.collection("roadmap");
    const roadmapSnap = await roadmapRef.get();

    if (roadmapSnap.empty) {
      return res.json({ reply: "Your roadmap does not exist." });
    }

    const activeModuleDoc = roadmapSnap.docs.find(d =>
      ["pending", "in-progress"].includes(d.data().status)
    );

    if (!activeModuleDoc) {
      return res.json({ reply: "No active training module." });
    }

    const moduleData = activeModuleDoc.data();

    /* ---------- CHAT SESSION ---------- */
    const today = new Date().toISOString().split("T")[0];
    const chatSessionRef = roadmapRef
      .doc(activeModuleDoc.id)
      .collection("chatSessions")
      .doc(today);

    if (!(await chatSessionRef.get()).exists) {
      await chatSessionRef.set({ startedAt: new Date(), messages: [] });
    }

    /* ---------- MEMORY (DYNAMIC) ---------- */
    const memoryData = await getAgentMemory({
      userId,
      companyId,
      deptId,
      moduleId: activeModuleDoc.id
    });
    
    const agentMemory = memoryData.summary || "No prior memory.";
    const strugglingAreas = memoryData.strugglingAreas || [];
    const masteredTopics = memoryData.masteredTopics || [];
    
    console.log(`📝 Agent Memory: ${agentMemory.substring(0, 100)}...`);
    if (strugglingAreas.length > 0) {
      console.log(`⚠️  Struggling with: ${strugglingAreas.slice(0, 3).join(", ")}`);
    }
    if (masteredTopics.length > 0) {
      console.log(`✅ Mastered: ${masteredTopics.slice(0, 3).join(", ")}`);
    }

    /* ---------- PINECONE (SAFE) ---------- */
    let relevantDocs = [];

    try {
      const embedding = await embedText(newMessage);
      const pineconeResults = await queryPinecone({
        embedding,
        companyId,
        deptId,
      });

      relevantDocs = pineconeResults.filter(doc =>
        isDocAllowed({
          similarityScore: doc.score,
          docDepartment: doc.dept,
          userDepartment: deptId.toUpperCase(),
        })
      );

    } catch (err) {
      console.warn("⚠️ Pinecone skipped:", err.message);
    }

    /* ---------- CONTEXT ---------- */
    const contextParts = [];

    if (relevantDocs.length > 0) {
      contextParts.push(
        `REFERENCE MATERIAL:\n${relevantDocs.map(d => d.text).join("\n")}`
      );
    }

    const context =
      contextParts.length > 0
        ? contextParts.join("\n\n")
        : "No additional context.";

    /* ---------- PROMPT ---------- */
    const finalPrompt = `
SYSTEM ROLE:
You are TrainMate, a goal-driven onboarding agent focused on teaching concepts.

LEARNING MEMORY (Topics & Patterns):
${agentMemory}
${strugglingAreas.length > 0 ? `\nUser needs help with: ${strugglingAreas.slice(0, 3).join(", ")}` : ''}
${masteredTopics.length > 0 ? `\nUser has learned: ${masteredTopics.slice(0, 3).join(", ")}` : ''}

USER PROFILE:
Name: ${userData.name || "User"}
Department: ${userData.deptName || deptId}

ACTIVE MODULE:
${moduleData.moduleTitle}

Remaining Days: ${calculateTrainingProgress(moduleData).remainingDays}

STRICT RULES:
- Answer questions related to the active module or department ONLY
- Give practical examples when helpful
- Use HTML tags only (<strong>, <em>, <ul>, <li>)
- NEVER repeat greetings or introductions
- NEVER repeat step numbers or progress status (e.g., "You've completed 2 of 6 steps")
- NEVER say "ready to dive", "let's move on", or similar transition phrases
- Get straight to answering the question with teaching content
- If off-topic, say: "I'm here to help with your training module."
- Focus on teaching concepts, not announcing progress


CONTEXT:
${context}

USER MESSAGE:
${newMessage}

RESPOND WITH: Direct educational content addressing the question. No progress updates or step announcements.
`;

    /* ---------- LLM ---------- */
    const completion = await initializeChatModel().generateContent(finalPrompt);
    const botReply =
      completion?.response?.text() ||
      "I’m here to help with your training module.";

    /* ---------- SAVE CHAT ---------- */
    await chatSessionRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(
        { from: "user", text: newMessage, timestamp: new Date() },
        { from: "bot", text: botReply, timestamp: new Date() }
      ),
    });

    /* ---------- UPDATE MEMORY (ASYNC) ---------- */
    // Update memory in background without blocking response
    updateMemoryAfterChat({
      userId,
      companyId,
      deptId,
      moduleId: activeModuleDoc.id,
      userMessage: newMessage,
      botReply: botReply
    }).catch(err => console.warn("⚠️ Memory update skipped:", err.message));

    return res.json({
      reply: botReply,
      sourceUsed: relevantDocs.length > 0,
    });

  } catch (err) {
    console.error("❌ chatController FULL ERROR:", err);
    return res.json({ reply: "⚠️ Something went wrong." });
  }
};


