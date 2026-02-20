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
 * Calculate progress based on actual skills covered in conversations
 * @param {Object} skillData - Result from getActualSkillsCovered
 * @returns {Object} Progress metrics
 */
function calculateSkillProgressFromActual(skillData) {
  const { actualSkillsCovered, totalCovered, totalSkills, percentage } = skillData;
  
  if (totalSkills === 0) {
    return {
      totalSkills: 0,
      masteredSkills: 0,
      remainingSkills: 0,
      progressPercentage: 0,
      usingSkillTracking: false,
      actualSkillsCovered: []
    };
  }

  const remainingSkills = Math.max(0, totalSkills - totalCovered);

  return {
    totalSkills,
    masteredSkills: totalCovered,
    remainingSkills,
    progressPercentage: percentage,
    usingSkillTracking: true,
    actualSkillsCovered
  };
}

function calculateTrainingProgress(moduleData, startDateOverride) {
  const totalDays = moduleData.estimatedDays;

  const baseStart = startDateOverride || moduleData.createdAt;
  if (!baseStart) {
    return {
      completedDays: 0,
      remainingDays: totalDays,
    };
  }

  const startDate = baseStart.toDate ? baseStart.toDate() : new Date(baseStart);

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

function getRoadmapGeneratedAt(userData) {
  const generatedAt = userData?.roadmapAgentic?.generatedAt || userData?.roadmapGeneratedAt;
  if (!generatedAt) return null;
  return generatedAt.toDate ? generatedAt.toDate() : new Date(generatedAt);
}

function getModuleStartDateByOrder(sortedModules, moduleId, roadmapGeneratedAt) {
  if (!roadmapGeneratedAt || !sortedModules?.length) return null;
  const targetModule = sortedModules.find((m) => m.id === moduleId);
  if (!targetModule) return null;

  const targetOrder = targetModule.data.order || 0;
  const daysOffset = sortedModules
    .filter((m) => (m.data.order || 0) < targetOrder)
    .reduce((sum, m) => sum + (m.data.estimatedDays || 1), 0);

  return new Date(roadmapGeneratedAt.getTime() + daysOffset * 24 * 60 * 60 * 1000);
}

/* ================= MODULE EXPIRATION & AUTO-UNLOCK (ALL MODULES) ================= */
/**
 * Comprehensive check: Scan ALL modules in order
 * - Mark any expired modules as completed
 * - Unlock the next non-completed module
 * - Returns which modules were expired + which is now active
 */
async function checkAndUnlockModulesComprehensive(companyId, deptId, userId, roadmapRef, roadmapGeneratedAt) {
  try {
    const roadmapSnap = await roadmapRef.get();
    const allModules = roadmapSnap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .sort((a, b) => (a.data.order || 0) - (b.data.order || 0));

    console.log(`📋 Scanning ALL ${allModules.length} modules for expiration...`);

    const expiredModuleIds = [];
    let nextActiveModule = null;

    // Scan through all modules in order
    for (const module of allModules) {
      // Skip if already completed
      if (module.data.status === "completed") {
        console.log(`✅ Module ${module.data.order}: Already completed`);
        continue;
      }

      // Check if this module is expired
      const moduleStartDate = getModuleStartDateByOrder(allModules, module.id, roadmapGeneratedAt);
      const progress = calculateTrainingProgress(module.data, moduleStartDate);
      const isExpired = progress.remainingDays <= 0;

      if (isExpired && !module.data.completed) {
        console.log(`⏰ Module ${module.data.order} EXPIRED - Marking as completed`);
        expiredModuleIds.push(module.id);

        // Mark as completed
        await roadmapRef.doc(module.id).update({
          completed: true,
          status: "completed",
          completedAt: new Date()
        });
      } else if (!isExpired && !nextActiveModule) {
        // Found first non-expired, non-completed module
        nextActiveModule = module;
        console.log(`🎯 Next active module: ${module.data.order} (${module.data.moduleTitle})`);
      }
    }

    // If we found expired modules, update the next one to in-progress
    if (expiredModuleIds.length > 0 && nextActiveModule) {
      await roadmapRef.doc(nextActiveModule.id).update({
        status: "in-progress",
        startedAt: new Date()
      });
      console.log(`🎉 Unlocked module: ${nextActiveModule.data.order}`);
    }

    return {
      expiredCount: expiredModuleIds.length,
      expiredModuleIds,
      nextActiveModule,
      nextActiveModuleData: nextActiveModule ? nextActiveModule.data : null,
      allModules
    };
  } catch (err) {
    console.error("❌ Error in comprehensive module check:", err);
    return {
      expiredCount: 0,
      expiredModuleIds: [],
      nextActiveModule: null,
      nextActiveModuleData: null,
      allModules: []
    };
  }
}
function extractCoveredSkills(conversationText, skillsCovered = []) {
  if (!conversationText || skillsCovered.length === 0) return [];

  const textLower = conversationText.toLowerCase();
  const coveredSkills = new Set();

  skillsCovered.forEach(skill => {
    const skillLower = skill.toLowerCase();
    // Check if skill is mentioned in the conversation
    if (textLower.includes(skillLower)) {
      coveredSkills.add(skill);
    }
  });

  return Array.from(coveredSkills);
}

/**
 * Get actual skills covered by analyzing chat history
 * @param {string} companyId
 * @param {string} deptId
 * @param {string} userId
 * @param {string} moduleId
 * @param {Array} skillsCovered - Module's skill list
 * @returns {Promise<Object>} { actualSkillsCovered, totalCovered, percentage }
 */
async function getActualSkillsCovered(companyId, deptId, userId, moduleId, skillsCovered = []) {
  try {
    const chatSessionsRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap")
      .doc(moduleId)
      .collection("chatSessions");

    const chatSnap = await chatSessionsRef.get();
    const allSkillsCovered = new Set();

    // Combine all messages from all chat sessions
    chatSnap.forEach(sessionDoc => {
      const sessionData = sessionDoc.data();
      const messages = sessionData.messages || [];
      
      const conversationText = messages
        .map(m => m.text || "")
        .join(" ");

      // Extract skills from this session
      const sessionSkills = extractCoveredSkills(conversationText, skillsCovered);
      sessionSkills.forEach(skill => allSkillsCovered.add(skill));
    });

    const actualSkillsCovered = Array.from(allSkillsCovered);
    const totalCovered = actualSkillsCovered.length;
    const totalSkills = skillsCovered.length;
    const percentage = totalSkills > 0 ? Math.round((totalCovered / totalSkills) * 100) : 0;

    return {
      actualSkillsCovered,
      totalCovered,
      totalSkills,
      percentage
    };
  } catch (err) {
    console.error("❌ Error getting actual skills covered:", err);
    return {
      actualSkillsCovered: [],
      totalCovered: 0,
      totalSkills: skillsCovered.length,
      percentage: 0
    };
  }
}

/* ================= MISSED DATES ================= */
/**
 * Get missed dates and active days stats for a user in the active module
 * @param {string} companyId 
 * @param {string} deptId 
 * @param {string} userId 
 * @param {string} activeModuleId 
 * @param {Object} moduleData - Module data with createdAt
 * @returns {Promise<Object>} { hasMissedDates, missedDates, firstMissedDate, missedCount, activeDays, totalExpectedDays, streak }
 */
async function getMissedDates(companyId, deptId, userId, activeModuleId, moduleData, startDateOverride) {
  try {
    const chatSessionsRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap")
      .doc(activeModuleId)
      .collection("chatSessions");

    const chatSnap = await chatSessionsRef.get();
    const activeDates = new Set(chatSnap.docs.map(doc => doc.id));
    const activeDays = activeDates.size;

    // Calculate expected dates (from module start to today)
    if (!startDateOverride && !moduleData.createdAt) {
      return {
        hasMissedDates: false,
        missedDates: [],
        firstMissedDate: null,
        missedCount: 0,
        activeDays: 0,
        totalExpectedDays: 0,
        streak: 0
      };
    }

    const startBase = startDateOverride || moduleData.createdAt;
    const startDate = startBase.toDate ? startBase.toDate() : new Date(startBase);

    const today = new Date();
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    if (activeDays === 0 && startDate.getTime() === today.getTime()) {
      return {
        hasMissedDates: false,
        missedDates: [],
        firstMissedDate: null,
        missedCount: 0,
        activeDays: 0,
        totalExpectedDays: 1,
        streak: 0
      };
    }

    const missedDates = [];
    const currentDate = new Date(startDate);

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split("T")[0];
      if (!activeDates.has(dateStr)) {
        missedDates.push(dateStr);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate total expected days
    const totalExpectedDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;

    // Calculate current streak (consecutive days from today backwards)
    let streak = 0;
    const streakDate = new Date(today);
    while (true) {
      const dateStr = streakDate.toISOString().split("T")[0];
      if (activeDates.has(dateStr)) {
        streak++;
        streakDate.setDate(streakDate.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      hasMissedDates: missedDates.length > 0,
      missedDates,
      firstMissedDate: missedDates.length > 0 ? missedDates[0] : null,
      missedCount: missedDates.length,
      activeDays,
      totalExpectedDays,
      streak
    };
  } catch (err) {
    console.error("❌ Error calculating missed dates:", err);
    return {
      hasMissedDates: false,
      missedDates: [],
      firstMissedDate: null,
      missedCount: 0,
      activeDays: 0,
      totalExpectedDays: 0,
      streak: 0
    };
  }
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

    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const roadmapGeneratedAt = getRoadmapGeneratedAt(userData);

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

    // Sort by order field and find first in-progress module
    const sortedDocs = roadmapSnap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .sort((a, b) => (a.data.order || 0) - (b.data.order || 0));

    // 🔄 COMPREHENSIVE CHECK: Scan ALL modules, mark expired ones as completed, unlock next
    const comprehensiveCheck = await checkAndUnlockModulesComprehensive(
      companyId,
      deptId,
      userId,
      roadmapRef,
      roadmapGeneratedAt
    );

    if (!comprehensiveCheck.nextActiveModule) {
      return res.json({
        reply: "🎉 Congratulations! You've completed all training modules. Contact your company admin for next steps. 📚",
      });
    }

    // Use the module determined by comprehensive check
    const finalActiveModule = comprehensiveCheck.nextActiveModule;
    const finalModuleData = comprehensiveCheck.nextActiveModuleData;
    const moduleStartDate = getModuleStartDateByOrder(
      comprehensiveCheck.allModules,
      finalActiveModule.id,
      roadmapGeneratedAt
    );

    // Build greeting message based on expired modules
    let expiredModuleInfo = "";
    if (comprehensiveCheck.expiredCount > 0) {
      const expiredTitles = comprehensiveCheck.allModules
        .filter((m) => comprehensiveCheck.expiredModuleIds.includes(m.id))
        .map((m) => m.data.moduleTitle)
        .filter(Boolean);

      const expiredList = expiredTitles.length > 0
        ? `Expired modules: ${expiredTitles.join(", ")}.`
        : "Expired modules were marked as completed.";

      expiredModuleInfo = `\n📋 ${comprehensiveCheck.expiredCount} training module${comprehensiveCheck.expiredCount !== 1 ? "s" : ""} expired and marked as completed. ${expiredList} Now active: "${finalModuleData.moduleTitle}".\n`;
    }

    // Check for missed dates
    const missedDateInfo = await getMissedDates(
      companyId,
      deptId,
      userId,
      finalActiveModule.id,
      finalModuleData,
      moduleStartDate
    );

    // Chat session today
    const today = new Date().toISOString().split("T")[0];
    const chatSessionRef = roadmapRef
      .doc(finalActiveModule.id)
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
    await chatSessionRef.update({ 
      companyDescription, 
      missedCount: missedDateInfo.missedCount,
      activeDays: missedDateInfo.activeDays,
      totalExpectedDays: missedDateInfo.totalExpectedDays,
      streak: missedDateInfo.streak
    });

    // Update user document with live stats
    await userRef.update({
      trainingStats: {
        activeDays: missedDateInfo.activeDays,
        missedDays: missedDateInfo.missedCount,
        totalExpectedDays: missedDateInfo.totalExpectedDays,
        currentStreak: missedDateInfo.streak,
        lastUpdated: new Date()
      }
    });

    // First time today reply (without company info)
    if (firstTimeToday) {
      let missedDatesNotification = "";
      if (missedDateInfo.hasMissedDates) {
        const firstMissedDateFormatted = new Date(missedDateInfo.firstMissedDate).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        });
        missedDatesNotification = `⚠️ You missed ${missedDateInfo.missedCount} day${missedDateInfo.missedCount !== 1 ? "s" : ""} of training starting from ${firstMissedDateFormatted}. Make sure to catch up!\n\n`;
      }

      const reply = `${missedDatesNotification}${expiredModuleInfo}Hi! Your active module is "${finalModuleData.moduleTitle}".
In this module, you will learn: ${finalModuleData.description || "details coming soon"}.

Let's get started and have fun learning! 🚀
      `;
      return res.json({ reply });
    }

    // Returning user reply (without company info)
    let missedDatesNotification = "";
    if (missedDateInfo.hasMissedDates) {
      const firstMissedDateFormatted = new Date(missedDateInfo.firstMissedDate).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      missedDatesNotification = `⚠️ You missed ${missedDateInfo.missedCount} day${missedDateInfo.missedCount !== 1 ? "s" : ""} of training starting from ${firstMissedDateFormatted}. Make sure to catch up!\n\n`;
    }
    return res.json({
      reply: `${missedDatesNotification}${expiredModuleInfo}Welcome back! Your active module is "${finalModuleData.moduleTitle}". Ask me anything related to this module.`,
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
    const roadmapGeneratedAt = getRoadmapGeneratedAt(userData);
    const roadmapRef = userRef.collection("roadmap");
    const roadmapSnap = await roadmapRef.get();

    if (roadmapSnap.empty) {
      return res.json({ reply: "Your roadmap does not exist." });
    }

    // 🔄 COMPREHENSIVE CHECK: Scan ALL modules, mark expired ones as completed, unlock next
    const comprehensiveCheck = await checkAndUnlockModulesComprehensive(
      companyId,
      deptId,
      userId,
      roadmapRef,
      roadmapGeneratedAt
    );

    let finalActiveModule = comprehensiveCheck.nextActiveModule;
    if (!finalActiveModule) {
      return res.json({ reply: "🎉 You've completed all training modules. Contact your company admin for next steps." });
    }

    const finalModuleData = comprehensiveCheck.nextActiveModuleData;
    const moduleStartDate = getModuleStartDateByOrder(
      comprehensiveCheck.allModules,
      finalActiveModule.id,
      roadmapGeneratedAt
    );

    /* ---------- CHAT SESSION ---------- */
    const today = new Date().toISOString().split("T")[0];
    const chatSessionRef = roadmapRef
      .doc(finalActiveModule.id)
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
      moduleId: finalActiveModule.id
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

    /* ---------- CHECK FOR UNLOCK-RELATED QUESTIONS ---------- */
    const unlockKeywords = ["unlock", "next module", "how to get", "when can i", "access", "locked", "expired", "complete this module"];
    const messageLower = newMessage.toLowerCase();
    const isUnlockQuestion = unlockKeywords.some(keyword => messageLower.includes(keyword));

    if (isUnlockQuestion) {
      const unlockResponse = `I understand you're asking about module progression and unlocking. 

Here's how it works:
- Modules are automatically unlocked once their estimated time expires
- Your progress is tracked automatically as you complete each module
- Expired modules are marked as complete, and the next module becomes available

For questions about your specific module timeline or if you believe something is incorrect, please contact your company admin for further details. They can review your progress and provide personalized guidance.

In the meantime, let me know if you have questions about the current module content, and I'm happy to help! 📚`;

      // Save this message to chat history
      await chatSessionRef.update({
        messages: admin.firestore.FieldValue.arrayUnion(
          { from: "user", text: newMessage, timestamp: new Date() },
          { from: "bot", text: unlockResponse, timestamp: new Date() }
        ),
      });

      return res.json({ reply: unlockResponse });
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

    /* ---------- SKILL-BASED PROGRESS (FROM ACTUAL CONVERSATIONS) ---------- */
    const actualSkillsData = await getActualSkillsCovered(
      companyId,
      deptId,
      userId,
      finalActiveModule.id,
      finalModuleData.skillsCovered || []
    );
    
    const skillProgress = calculateSkillProgressFromActual(actualSkillsData);
    console.log(`📊 Actual Skills Covered: ${skillProgress.masteredSkills}/${skillProgress.totalSkills} skills (${skillProgress.progressPercentage}%)`);
    console.log(`📝 Skills covered in conversations: ${skillProgress.actualSkillsCovered.join(", ") || "None yet"}`);
    
    // Update module progress in Firestore with actual skills
    if (skillProgress.usingSkillTracking) {
      try {
        await roadmapRef.doc(finalActiveModule.id).update({
          skillProgress: skillProgress.progressPercentage,
          actualSkillsCovered: skillProgress.actualSkillsCovered,
          skillsCovered: finalModuleData.skillsCovered || [],
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
Training Level: ${userData.trainingLevel || "Not specified"}
${companyInfo || "\nCOMPANY INFORMATION: Not available in system\n"}

ACTIVE MODULE:
Title: ${finalModuleData.moduleTitle}
Description: ${finalModuleData.description || "No description available"}
Skills to Learn: ${finalModuleData.skillsCovered ? finalModuleData.skillsCovered.join(", ") : "Not specified"}
Estimated Duration: ${finalModuleData.estimatedDays || "N/A"} days
Days Completed: ${calculateTrainingProgress(finalModuleData, moduleStartDate).completedDays} days
Days Remaining: ${calculateTrainingProgress(finalModuleData, moduleStartDate).remainingDays} days

PROGRESS TRACKING:
${skillProgress.usingSkillTracking 
  ? `Skill-Based Progress: ${skillProgress.masteredSkills}/${skillProgress.totalSkills} skills actually covered in conversations (${skillProgress.progressPercentage}%)
Skills Covered So Far: ${skillProgress.actualSkillsCovered.length > 0 ? skillProgress.actualSkillsCovered.join(", ") : "No skills covered yet"}
Skills Still to Cover: ${finalModuleData.skillsCovered ? finalModuleData.skillsCovered.filter(s => !skillProgress.actualSkillsCovered.includes(s)).join(", ") : "N/A"}` 
  : `Time-Based Progress: ${calculateTrainingProgress(finalModuleData, moduleStartDate).remainingDays} days remaining to complete this module`}

AGENTIC GUIDELINES:
- You have access to company training materials AND external sources (MDN, StackOverflow, Dev.to)
- Prioritize company training materials for module-specific content
- Use external sources for general programming concepts, best practices, or when depth is needed
- Adjust explanation depth based on Training Level: "easy" = simple terms, "medium" = moderate depth, "hard" = advanced/in-depth
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
      moduleId: finalActiveModule.id,
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

/* ================= GET MISSED DATES ================= */
export const getMissedDatesController = async (req, res) => {
  try {
    const { userId, companyId, deptId } = req.body;

    if (!userId || !companyId || !deptId) {
      return res.status(400).json({ 
        success: false,
        error: "Missing required fields" 
      });
    }

    // Get the active module
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
      return res.json({
        success: true,
        hasMissedDates: false,
        missedDates: [],
        firstMissedDate: null,
        missedCount: 0,
        activeDays: 0,
        missedDays: 0,
        totalExpectedDays: 0,
        currentStreak: 0
      });
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
    const roadmapGeneratedAt = getRoadmapGeneratedAt(userData);

    // 🔄 COMPREHENSIVE CHECK: Scan ALL modules, mark expired ones as completed, unlock next
    const comprehensiveCheck = await checkAndUnlockModulesComprehensive(
      companyId,
      deptId,
      userId,
      roadmapRef,
      roadmapGeneratedAt
    );

    // Use the active module from comprehensive check (or return empty if none available)
    let activeModule = comprehensiveCheck.nextActiveModule;
    if (!activeModule) {
      return res.json({
        success: true,
        hasMissedDates: false,
        missedDates: [],
        firstMissedDate: null,
        missedCount: 0,
        activeDays: 0,
        missedDays: 0,
        totalExpectedDays: 0,
        currentStreak: 0
      });
    }

    const moduleData = activeModule.data;
    const moduleStartDate = getModuleStartDateByOrder(
      comprehensiveCheck.allModules,
      activeModule.id,
      roadmapGeneratedAt
    );
    
    // Check if module was actually started (has chat sessions)
    const moduleChatSessionsRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap")
      .doc(activeModule.id)
      .collection("chatSessions");
    
    const priorChatSnap = await moduleChatSessionsRef.limit(1).get();
    const hasModuleStarted = !priorChatSnap.empty;

    // Only get missed dates if module was actually started
    let missedDateInfo = {
      hasMissedDates: false,
      missedDates: [],
      firstMissedDate: null,
      missedCount: 0,
      activeDays: 0,
      totalExpectedDays: 0,
      streak: 0
    };

    if (hasModuleStarted) {
      missedDateInfo = await getMissedDates(
        companyId,
        deptId,
        userId,
        activeModule.id,
        moduleData,
        moduleStartDate
      );
    }

    await userRef.update({
      trainingStats: {
        activeDays: missedDateInfo.activeDays,
        missedDays: missedDateInfo.missedCount,
        totalExpectedDays: missedDateInfo.totalExpectedDays,
        currentStreak: missedDateInfo.streak,
        lastUpdated: new Date()
      }
    }).catch(err => {
      console.warn("⚠️ Failed to update user stats:", err.message);
    });

    return res.json({
      success: true,
      hasMissedDates: missedDateInfo.hasMissedDates,
      missedDates: missedDateInfo.missedDates,
      firstMissedDate: missedDateInfo.firstMissedDate,
      missedCount: missedDateInfo.missedCount,
      activeDays: missedDateInfo.activeDays,
      missedDays: missedDateInfo.missedCount,
      totalExpectedDays: missedDateInfo.totalExpectedDays,
      currentStreak: missedDateInfo.streak
    });

  } catch (err) {
    console.error("❌ getMissedDatesController error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to get missed dates"
    });
  }
};


