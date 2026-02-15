//trainmate-backend/controllers/chatController.js
import { db } from "../config/firebase.js"; // Admin SDK
import admin from "firebase-admin";
import { getPineconeIndex } from "../config/pinecone.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CohereClient } from "cohere-ai";
import dotenv from "dotenv";
import { isDocAllowed } from "../utils/relevanceGuard.js";
import { updateMemoryAfterChat, getAgentMemory } from "../services/memoryService.js";
import { searchMDN } from "../knowledge/mdn.js";
import { searchStackOverflow } from "../knowledge/stackoverflow.js";
import { searchDevTo } from "../knowledge/devto.js";
import { aggregateKnowledge } from "../knowledge/knowledgeAggregator.js";

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

/**
 * Calculate progress based on skills covered vs mastered
 * @param {Object} moduleData - Module data with skillsCovered
 * @param {Array} masteredTopics - Topics/skills user has mastered
 * @returns {Object} Progress metrics
 */
function calculateSkillBasedProgress(moduleData, masteredTopics = []) {
  const moduleSkills = moduleData.skillsCovered || [];
  
  if (moduleSkills.length === 0) {
    return {
      totalSkills: 0,
      masteredSkills: 0,
      remainingSkills: 0,
      progressPercentage: 0,
      usingSkillTracking: false
    };
  }

  // Normalize for case-insensitive matching
  const normalizedModuleSkills = moduleSkills.map(s => s.toLowerCase().trim());
  const normalizedMastered = masteredTopics.map(t => t.toLowerCase().trim());
  
  // Count how many module skills are in mastered topics
  const masteredCount = normalizedModuleSkills.filter(skill => 
    normalizedMastered.some(mastered => 
      mastered.includes(skill) || skill.includes(mastered)
    )
  ).length;

  const totalSkills = moduleSkills.length;
  const remainingSkills = Math.max(0, totalSkills - masteredCount);
  const progressPercentage = Math.round((masteredCount / totalSkills) * 100);

  return {
    totalSkills,
    masteredSkills: masteredCount,
    remainingSkills,
    progressPercentage,
    usingSkillTracking: true
  };
}

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

/* ================= AGENTIC KNOWLEDGE FETCHER ================= */
async function fetchAgenticKnowledge(query, companyDocs) {
  try {
    console.log("🤖 Agentic knowledge fetch initiated for:", query.substring(0, 50));
    
    // Parallel fetch from all sources
    const [mdnResults, soResults, devtoResults] = await Promise.all([
      searchMDN(query).catch(err => {
        console.warn("⚠️ MDN fetch failed:", err.message);
        return [];
      }),
      searchStackOverflow(query).catch(err => {
        console.warn("⚠️ StackOverflow fetch failed:", err.message);
        return [];
      }),
      searchDevTo(query).catch(err => {
        console.warn("⚠️ Dev.to fetch failed:", err.message);
        return [];
      })
    ]);

    console.log(`📚 External sources: MDN=${mdnResults.length}, SO=${soResults.length}, DevTo=${devtoResults.length}`);

    // Aggregate all sources with confidence scoring
    const aggregated = aggregateKnowledge({
      companyDocs,
      mdn: mdnResults,
      stackOverflow: soResults,
      devto: devtoResults
    });

    return {
      allResults: aggregated.allResults,
      topResult: aggregated.topResult,
      summary: aggregated.allResults.slice(0, 3) // Top 3 for LLM context
    };
  } catch (err) {
    console.error("❌ Agentic knowledge fetch failed:", err.message);
    return {
      allResults: companyDocs,
      topResult: companyDocs[0] || null,
      summary: companyDocs.slice(0, 3)
    };
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

    // Sort by order field and find first pending/in-progress module
    const sortedDocs = roadmapSnap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .sort((a, b) => (a.data.order || 0) - (b.data.order || 0));

    const activeModule = sortedDocs.find(
      (m) => m.data.status === "pending" || m.data.status === "in-progress"
    );

    if (!activeModule) {
      return res.json({
        reply: "You don't have any active training module right now.",
      });
    }

    const activeModuleDoc = roadmapSnap.docs.find((d) => d.id === activeModule.id);
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

    /* ---------- COMPANY INFORMATION ---------- */
    let companyInfo = "";
    try {
      const companyRef = db.collection("companies").doc(companyId).collection("onboardingAnswers");
      const companySnap = await companyRef.get();
      
      if (!companySnap.empty) {
        const companyDoc = companySnap.docs[0].data();
        const answers = companyDoc.answers || {};
        
        const duration = answers['1'] || answers[1] || "Not specified";
        const teamSize = answers['2'] || answers[2] || "Not specified";
        const description = answers['3'] || answers[3] || "No description available";
        
        companyInfo = `
COMPANY INFORMATION:
Duration: ${duration}
Team Size: ${teamSize}
About: ${description}
`;
        
        console.log("✅ Company info loaded:", description.substring(0, 50));
      } else {
        console.warn("⚠️ No company onboarding answers found");
      }
    } catch (err) {
      console.warn("⚠️ Could not fetch company info:", err.message);
    }

    /* ---------- ACTIVE MODULE ---------- */
    const roadmapRef = userRef.collection("roadmap");
    const roadmapSnap = await roadmapRef.get();

    if (roadmapSnap.empty) {
      return res.json({ reply: "Your roadmap does not exist." });
    }

    // Sort by order field and find first pending/in-progress module
    const sortedDocs = roadmapSnap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .sort((a, b) => (a.data.order || 0) - (b.data.order || 0));

    const activeModule = sortedDocs.find(m =>
      ["pending", "in-progress"].includes(m.data.status)
    );

    if (!activeModule) {
      return res.json({ reply: "No active training module." });
    }

    const activeModuleDoc = roadmapSnap.docs.find((d) => d.id === activeModule.id);
    const moduleData = activeModuleDoc.data();

    /* ---------- CHAT SESSION ---------- */
    const today = new Date().toISOString().split("T")[0];
    const chatSessionRef = roadmapRef
      .doc(activeModuleDoc.id)
      .collection("chatSessions")
      .doc(today);

    const chatSessionSnap = await chatSessionRef.get();
    const isFirstMessageToday = !chatSessionSnap.exists;
    
    if (isFirstMessageToday) {
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

    /* ---------- WEAKNESS ANALYSIS FOR WELCOME MESSAGE ---------- */
    let weaknessWelcome = "";
    
    // Check if roadmap was recently regenerated and this is first chat after regeneration
    if (isFirstMessageToday && userData.roadmapRegenerated && userData.weaknessAnalysis) {
      const weakness = userData.weaknessAnalysis;
      const generatedAt = weakness.generatedAt?.toDate ? weakness.generatedAt.toDate() : new Date(weakness.generatedAt);
      const hoursSinceRegeneration = (new Date() - generatedAt) / (1000 * 60 * 60);
      
      // If regenerated within last 48 hours, show welcome message
      if (hoursSinceRegeneration < 48) {
        const topWeakConcepts = (weakness.concepts || []).slice(0, 5).map(w => w.concept).join(", ");
        const wrongQuestionsPreview = (weakness.wrongQuestions || []).slice(0, 3)
          .map(q => `- ${q.question.substring(0, 60)}...`)
          .join("\n");
        
        weaknessWelcome = `
🔄 ROADMAP REGENERATION CONTEXT:
Your learning roadmap has been regenerated based on your quiz performance.

AREAS YOU STRUGGLED WITH:
${topWeakConcepts || "General concepts"}

AVERAGE QUIZ SCORE: ${weakness.avgScore}%

SAMPLE QUESTIONS YOU GOT WRONG:
${wrongQuestionsPreview || "No specific questions available"}

I will focus our conversation on strengthening these areas. Let's start from the fundamentals and build your understanding step by step.
`;
        
        console.log(`👋 First chat after regeneration - will show weakness welcome`);
        
        // Clear the flag after showing welcome once
        try {
          await userRef.update({
            'weaknessAnalysis.welcomed': true,
            'weaknessAnalysis.welcomedAt': new Date(),
          });
        } catch (err) {
          console.warn("Failed to update weakness welcome flag:", err.message);
        }
      }
    }

    /* ---------- SKILL-BASED PROGRESS ---------- */
    const skillProgress = calculateSkillBasedProgress(moduleData, masteredTopics);
    console.log(`📊 Skill Progress: ${skillProgress.masteredSkills}/${skillProgress.totalSkills} skills (${skillProgress.progressPercentage}%)`);
    
    // Update module progress in Firestore
    if (skillProgress.usingSkillTracking) {
      try {
        await roadmapRef.doc(activeModuleDoc.id).update({
          skillProgress: skillProgress.progressPercentage,
          lastProgressUpdate: new Date()
        });
      } catch (err) {
        console.warn("⚠️ Failed to update skill progress:", err.message);
      }
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

    /* ---------- AGENTIC KNOWLEDGE FETCH ---------- */
    console.log("🤖 Fetching agentic knowledge from external sources...");
    const agenticKnowledge = await fetchAgenticKnowledge(newMessage, relevantDocs);
    
    const topExternalSource = agenticKnowledge.topResult;
    const externalSources = agenticKnowledge.summary || [];
    
    if (topExternalSource) {
      console.log(`✅ Top external source: ${topExternalSource.source}`);
    }

    /* ---------- CONTEXT ---------- */
    const contextParts = [];

    if (relevantDocs.length > 0) {
      contextParts.push(
        `COMPANY TRAINING MATERIAL:\n${relevantDocs.map(d => d.text).join("\n")}`
      );
    }

    // Add external knowledge sources
    if (externalSources.length > 0) {
      const externalContext = externalSources.map(doc => {
        if (doc.source === 'mdn') {
          return `📖 MDN: ${doc.title}\nURL: ${doc.mdn_url}\nSummary: ${doc.summary}`;
        } else if (doc.source === 'stackOverflow') {
          return `🔗 StackOverflow: ${doc.title}\nURL: ${doc.link}`;
        } else if (doc.source === 'devto') {
          return `📝 Dev.to: ${doc.title}\nURL: ${doc.link}`;
        }
        return `${doc.source}: ${doc.title || doc.text}`;
      }).join("\n\n");
      
      contextParts.push(
        `EXTERNAL KNOWLEDGE SOURCES (MDN, StackOverflow, Dev.to):\n${externalContext}`
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

${weaknessWelcome ? `${weaknessWelcome}\n` : ''}
LEARNING MEMORY (Topics & Patterns):
${agentMemory}
${strugglingAreas.length > 0 ? `\nUser needs help with: ${strugglingAreas.slice(0, 3).join(", ")}` : ''}
${masteredTopics.length > 0 ? `\nUser has learned: ${masteredTopics.slice(0, 3).join(", ")}` : ''}

USER PROFILE:
Name: ${userData.name || "User"}
Department: ${userData.deptName || deptId}
${companyInfo || "\nCOMPANY INFORMATION: Not available in system\n"}

ACTIVE MODULE:
Title: ${moduleData.moduleTitle}
Description: ${moduleData.description || "No description available"}
Skills to Learn: ${moduleData.skillsCovered ? moduleData.skillsCovered.join(", ") : "Not specified"}
Estimated Duration: ${moduleData.estimatedDays || "N/A"} days
Days Completed: ${calculateTrainingProgress(moduleData).completedDays} days
Days Remaining: ${calculateTrainingProgress(moduleData).remainingDays} days

PROGRESS TRACKING:
${skillProgress.usingSkillTracking 
  ? `Skill-Based Progress: ${skillProgress.masteredSkills}/${skillProgress.totalSkills} skills mastered (${skillProgress.progressPercentage}%)
Skills Remaining to Learn: ${moduleData.skillsCovered ? moduleData.skillsCovered.filter((_, i) => i >= skillProgress.masteredSkills).join(", ") : "N/A"}` 
  : `Time-Based Progress: ${calculateTrainingProgress(moduleData).remainingDays} days remaining to complete this module`}

AGENTIC GUIDELINES:
- You have access to company training materials AND external sources (MDN, StackOverflow, Dev.to)
- Prioritize company training materials for module-specific content
- Use external sources for general programming concepts, best practices, or when depth is needed
- When external source is highly relevant, cite it: "<b>Source: MDN / StackOverflow / Dev.to</b>"
- Combine company knowledge with external expertise for richer answers
${weaknessWelcome ? '\n- Start this conversation by welcoming the user and acknowledging their quiz struggles\n- Explain you will help them master the weak concepts identified\n- Be encouraging and supportive about starting fresh with regenerated roadmap\n' : ''}

STRICT RULES:
- Answer questions related to the active module, department, OR company information
- When asked about the company, ALWAYS check the COMPANY INFORMATION section above first
- If COMPANY INFORMATION shows "Not available", then say you don't have company details
- If COMPANY INFORMATION has an "About" field, use that to answer questions about the company
- When asked about "how many days left", "time remaining", or "deadline", use the "Days Remaining" value from ACTIVE MODULE section
- When asked about "what will I learn", "module content", or "skills to cover", reference the "Skills to Learn" and "Description" from ACTIVE MODULE section
- When asked to create a learning plan or divide remaining time, use the "Days Remaining" and "Skills to Learn" to create a structured day-by-day plan
- For learning plan requests: Break down skills across available days, prioritize fundamentals first, include practice time
- Give practical examples when helpful
- Use <b>, <i>, <ul>, <li>, <p> HTML tags for formatting
- Do NOT use markdown formatting (no **, ##, __, etc.)
${weaknessWelcome ? '' : '- NEVER repeat greetings or introductions\n'}- NEVER repeat step numbers or progress status (e.g., "You've completed 2 of 6 steps")
- NEVER say "ready to dive", "let's move on", or similar transition phrases
- Get straight to answering the question with teaching content
- If completely off-topic (not module, company, or department related), say: "I'm here to help with your training module and answer questions about the company."
- Focus on teaching concepts, not announcing progress


CONTEXT:
${context}

USER MESSAGE:
${newMessage}

RESPOND WITH: Direct educational content addressing the question, using both company materials and external sources intelligently. No progress updates or step announcements.
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


