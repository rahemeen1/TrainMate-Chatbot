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
import { queueAgentRunIncrement } from "../services/agentHealthStorage.service.js";
import { calculateAttendanceStats } from "../utils/trainingAttendanceStats.js";

dotenv.config();

/* ================= LLM ================= */
let model = null;

function recordFunctionAgentRun({ agentKey, agentName, status, durationMs }) {
  try {
    queueAgentRunIncrement({
      agentKey,
      agentName,
      status,
      durationMs,
      segment: "Fresher",
      type: "function-agent",
    });
  } catch (error) {
    console.warn("[AGENT-HEALTH] Failed to queue function-agent metric:", error.message);
  }
}

function initializeChatModel() {
  if (!model) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return model;
}

/* ================= COHERE ================= */
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

function normalizeLicensePlan(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "license pro" || trimmed === "pro") return "License Pro";
  if (trimmed === "license basic" || trimmed === "basic") return "License Basic";
  return null;
}

async function resolveCompanyLicensePlan(companyId) {
  try {
    const companyRef = db.collection("companies").doc(companyId);

    const companySnap = await companyRef.get();
    const companyPlan = normalizeLicensePlan(companySnap.data()?.licensePlan || companySnap.data()?.plan);
    if (companyPlan) return companyPlan;

    const onboardingSnap = await companyRef.collection("onboardingAnswers").get();
    if (!onboardingSnap.empty) {
      const latestDoc = onboardingSnap.docs
        .slice()
        .sort((a, b) => {
          const aDate = a.data()?.createdAt?.toDate?.() || new Date(0);
          const bDate = b.data()?.createdAt?.toDate?.() || new Date(0);
          return bDate.getTime() - aDate.getTime();
        })[0];

      const answers = latestDoc?.data()?.answers || {};
      const onboardingPlan =
        normalizeLicensePlan(answers?.[2]) ||
        normalizeLicensePlan(answers?.["2"]) ||
        normalizeLicensePlan(answers?.[0]) ||
        normalizeLicensePlan(answers?.["0"]);

      if (onboardingPlan) return onboardingPlan;
    }
  } catch (err) {
    console.warn("[CHAT][LICENSE] Failed to resolve plan:", err?.message || err);
  }

  return "License Basic";
}

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
 * Parse training duration to days
 * @param {string|number} duration - e.g., "3 months", "6 weeks", "90 days", or numeric days
 * @returns {number|null} Duration in days
 */
function parseTrainingDurationDays(duration) {
  if (Number.isFinite(duration)) return Math.max(1, Math.round(duration));
  const raw = String(duration || "").trim().toLowerCase();
  if (!raw) return null;

  const numberMatch = raw.match(/\d+(?:\.\d+)?/);
  const value = numberMatch ? parseFloat(numberMatch[0]) : NaN;
  if (!Number.isFinite(value)) return null;

  if (raw.includes("week")) return Math.max(1, Math.round(value * 7));
  if (raw.includes("month")) return Math.max(1, Math.round(value * 30));
  if (raw.includes("day")) return Math.max(1, Math.round(value));

  return Math.max(1, Math.round(value));
}

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
  const totalDays = Math.max(1, Number(moduleData?.estimatedDays) || 1);

  const baseStart = moduleData?.startedAt || startDateOverride || moduleData?.createdAt;
  if (!baseStart) {
    return {
      completedDays: 1,
      remainingDays: totalDays,
    };
  }

  const startDate = baseStart.toDate ? baseStart.toDate() : new Date(baseStart);
  if (!Number.isFinite(startDate.getTime())) {
    return {
      completedDays: 1,
      remainingDays: totalDays,
    };
  }

  // Keep day progression in the same timezone used for chat-session day keys.
  const startKey = getDateKey(startDate);
  const todayKey = getDateKey(new Date());
  const startAnchor = new Date(`${startKey}T00:00:00Z`);
  const todayAnchor = new Date(`${todayKey}T00:00:00Z`);

  // If start date is in the future due to schedule/order drift, do not allow negative day values.
  if (startAnchor > todayAnchor) {
    return {
      completedDays: 1,
      remainingDays: totalDays,
    };
  }

  const diffDays = Math.floor((todayAnchor - startAnchor) / (1000 * 60 * 60 * 24)) + 1;

  const completedDays = Math.max(1, Math.min(diffDays, totalDays));
  const remainingDays = Math.max(totalDays - completedDays, 0);

  return {
    completedDays,
    remainingDays,
  };
}

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
const FEEDBACK_PROMPT_INTERVAL = 5;
const MAX_FEEDBACK_ENTRIES = 30;
const LOG_THROTTLE_MS = Math.max(1000, Number(process.env.LOG_THROTTLE_MS) || 10 * 60 * 1000);
const throttledLogTimestamps = new Map();

function shouldEmitThrottledLog(key, ttlMs = LOG_THROTTLE_MS) {
  const now = Date.now();
  const lastLoggedAt = throttledLogTimestamps.get(key) || 0;

  if (now - lastLoggedAt < ttlMs) {
    return false;
  }

  throttledLogTimestamps.set(key, now);

  // Keep memory bounded for long-running instances.
  if (throttledLogTimestamps.size > 1000) {
    for (const [entryKey, ts] of throttledLogTimestamps.entries()) {
      if (now - ts > ttlMs * 2) {
        throttledLogTimestamps.delete(entryKey);
      }
    }
  }

  return true;
}

function logThrottled(key, ...args) {
  if (shouldEmitThrottledLog(key)) {
    console.log(...args);
  }
}

function warnThrottled(key, ...args) {
  if (shouldEmitThrottledLog(key)) {
    console.warn(...args);
  }
}

function getDateKey(date, timeZone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getRoadmapGeneratedAt(userData) {
  const generatedAt = userData?.roadmapAgentic?.generatedAt || userData?.roadmapGeneratedAt;
  if (!generatedAt) return null;
  return generatedAt.toDate ? generatedAt.toDate() : new Date(generatedAt);
}

/**
 * Generate daily learning agenda using AI
 * @param {number} dayNumber - Current day in the module (1, 2, 3, etc.)
 * @param {number} totalDays - Total estimated days for the module
 * @param {string} moduleTitle - Title of the module
 * @param {string} moduleDescription - Description of what's covered in the module
 * @param {Array} skillsCovered - Array of skills covered in the module
 * @returns {Promise<string>} - AI-generated daily agenda
 */
async function generateDailyAgenda(dayNumber, totalDays, moduleTitle, moduleDescription, skillsCovered = []) {
  const startedAt = Date.now();
  try {
    const model = initializeChatModel();
    const skillsList = skillsCovered.length > 0 ? skillsCovered.join(", ") : "various topics";
    
    const prompt = `You are a friendly AI learning assistant for a corporate training platform called TrainMate.

A learner is on Day ${dayNumber} of ${totalDays} in their learning module titled "${moduleTitle}".

Module Description: ${moduleDescription || "Technical training module"}

Skills Covered: ${skillsList}

Generate a brief, encouraging daily agenda for today. The agenda should:
1. Be concise (2-3 sentences max)
2. Match the learning pace (early days = fundamentals, later days = advanced topics)
3. Be motivating and clear about what to focus on today
4. Use a friendly, conversational tone
5. Include specific topics or concepts they should focus on today
6. DO NOT use any emojis - only plain text
7. Be professional and clear

Format the response as a natural paragraph without bullet points, numbered lists, or emojis.

Example format:
"Today we'll focus on understanding the core fundamentals of [topic]. You'll explore [specific concept] and learn how it connects to [practical application]. Let's build a strong foundation together!"

Generate the daily agenda (no emojis):`;

    const result = await model.generateContent(prompt);
    const agenda = result.response.text().trim();
    recordFunctionAgentRun({
      agentKey: "daily-agenda-agent",
      agentName: "Daily Agenda Agent",
      status: "success",
      durationMs: Date.now() - startedAt,
    });
    return agenda;
  } catch (error) {
    console.error("❌ Error generating daily agenda:", error.message);
    recordFunctionAgentRun({
      agentKey: "daily-agenda-agent",
      agentName: "Daily Agenda Agent",
      status: "degraded",
      durationMs: Date.now() - startedAt,
    });
    // Fallback message if AI fails
    return `Today is Day ${dayNumber} of ${totalDays}. Let's continue learning about ${moduleTitle}. Ask me any questions you have!`;
  }
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
 * - Mark any expired modules as expired
 * - Unlock the next non-completed module
 * - Returns which modules were expired + which is now active
 */
async function checkAndUnlockModulesComprehensive(companyId, deptId, userId, roadmapRef, roadmapGeneratedAt) {
  try {
    const licensePlan = await resolveCompanyLicensePlan(companyId);
    const isBasicPlan = licensePlan === "License Basic";

    const roadmapSnap = await roadmapRef.get();
    const allModules = roadmapSnap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .sort((a, b) => (a.data.order || 0) - (b.data.order || 0));

    logThrottled(
      `scan-all-modules:${companyId}:${deptId}:${userId}:${allModules.length}`,
      `📋 Scanning ALL ${allModules.length} modules for expiration...`
    );

    const expiredModuleIds = [];
    let nextActiveModule = null;
    let hasInProgressModule = false;

    // Scan through all modules in order
    for (const module of allModules) {
      // Check if this module is expired
      const moduleStartDate = getModuleStartDateByOrder(allModules, module.id, roadmapGeneratedAt);
      const progress = calculateTrainingProgress(module.data, moduleStartDate);
      const isExpired = progress.remainingDays <= 0;
      const appearsCompleted = module.data.completed === true;
      const hasQuizCompletionEvidence = !!(
        module.data.quizPassed ||
        module.data.lastQuizSubmitted ||
        module.data.completedAt
      );

      if (isBasicPlan && isExpired && !appearsCompleted) {
        await roadmapRef.doc(module.id).update({
          status: "completed",
          completed: true,
          completedAt: new Date(),
          moduleLocked: false,
          quizLocked: false,
          requiresAdminContact: false,
        });
        console.log(`✅ [BASIC] Auto-completed module ${module.data.order} after timeline elapsed`);
        continue;
      }

      // Backfill/repair path: if legacy data marked module as completed without quiz/chat evidence,
      // treat it as expired once its deadline has passed.
      let hasChatSession = false;
      if (isExpired && appearsCompleted && !hasQuizCompletionEvidence) {
        const chatSnap = await roadmapRef.doc(module.id).collection("chatSessions").limit(1).get();
        hasChatSession = !chatSnap.empty;
      }

      if (!isExpired && appearsCompleted) {
        console.log(`✅ Module ${module.data.order}: Already completed`);
        continue;
      }

      const shouldForceExpire = isExpired && !hasQuizCompletionEvidence && !hasChatSession;

      if (shouldForceExpire && (module.data.status !== "expired" || module.data.completed)) {
        console.log(`⏰ Module ${module.data.order} EXPIRED - Marking as expired`);
        expiredModuleIds.push(module.id);

        // Mark as expired without auto-completing the module
        await roadmapRef.doc(module.id).update({
          status: "expired",
          completed: false,
          moduleLocked: true,
          expiredAt: new Date()
        });
      } else if (!isExpired && module.data.status === "in-progress" && !hasInProgressModule && !appearsCompleted) {
        hasInProgressModule = true;
        nextActiveModule = module;
        logThrottled(
          `active-module-remains:${companyId}:${deptId}:${userId}:${module.id}`,
          `🎯 Active module remains: ${module.data.order} (${module.data.moduleTitle})`
        );
      } else if (!isExpired && !nextActiveModule && !appearsCompleted) {
        // Found first non-expired, non-completed module
        nextActiveModule = module;
        console.log(`🎯 Next active module: ${module.data.order} (${module.data.moduleTitle})`);
      }
    }

    // Ensure there is one active module after expiration updates
    if (nextActiveModule && nextActiveModule.data.status !== "in-progress" && (expiredModuleIds.length > 0 || !hasInProgressModule)) {
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
 * Collect date-keyed attendance events from roadmap chat sessions.
 * These date keys act as the daily training attendance calendar.
 * @param {string} companyId
 * @param {string} deptId
 * @param {string} userId
 * @param {string[]} moduleIds
 * @returns {Promise<Set<string>>}
 */
async function collectAttendanceDateKeys(companyId, deptId, userId, moduleIds = []) {
  const attendanceDates = new Set();
  const uniqueModuleIds = Array.from(new Set(moduleIds.filter(Boolean)));

  if (uniqueModuleIds.length === 0) {
    return attendanceDates;
  }

  const chatSessionSnaps = await Promise.all(
    uniqueModuleIds.map((moduleId) =>
      db
        .collection("freshers")
        .doc(companyId)
        .collection("departments")
        .doc(deptId)
        .collection("users")
        .doc(userId)
        .collection("roadmap")
        .doc(moduleId)
        .collection("chatSessions")
        .get()
    )
  );

  chatSessionSnaps.forEach((chatSnap) => {
    chatSnap.docs.forEach((doc) => attendanceDates.add(doc.id));
  });

  return attendanceDates;
}

/**
 * Get missed dates and streak stats using daily attendance calendar keys.
 * @param {string} companyId 
 * @param {string} deptId 
 * @param {string} userId 
 * @param {string[]} moduleIds
 * @param {Date|Object|string|null} startDate
 * @returns {Promise<Object>} { hasMissedDates, missedDates, firstMissedDate, missedCount, activeDays, totalExpectedDays, streak }
 */
async function getMissedDates(companyId, deptId, userId, moduleIds, startDate) {
  try {
    const attendanceDates = await collectAttendanceDateKeys(
      companyId,
      deptId,
      userId,
      moduleIds
    );

    const stats = calculateAttendanceStats({
      attendanceDateKeys: attendanceDates,
      startDate,
      strictTodayStreak: true,
    });

    return {
      hasMissedDates: stats.hasMissedDates,
      missedDates: stats.missedDates,
      firstMissedDate: stats.firstMissedDate,
      missedCount: stats.missedCount,
      activeDays: stats.activeDays,
      totalExpectedDays: stats.totalExpectedDays,
      streak: stats.currentStreak
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
  const startedAt = Date.now();
  let runStatus = "success";
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
    runStatus = "degraded";
    return {
      allResults: companyDocs,
      topResult: companyDocs[0] || null,
      summary: companyDocs.slice(0, 3)
    };
  } finally {
    recordFunctionAgentRun({
      agentKey: "knowledge-fetch-agent",
      agentName: "Knowledge Fetch Agent",
      status: runStatus,
      durationMs: Date.now() - startedAt,
    });
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

    // 🔄 COMPREHENSIVE CHECK: Scan ALL modules, mark expired ones as expired, unlock next
    const comprehensiveCheck = await checkAndUnlockModulesComprehensive(
      companyId,
      deptId,
      userId,
      roadmapRef,
      roadmapGeneratedAt
    );

    if (!comprehensiveCheck.nextActiveModule) {
      return res.json({
        reply: `<div style="line-height: 1.8;">
<div style="color: #00FF00; font-size: 20px; font-weight: 600; margin-bottom: 16px; text-align: center;">
Congratulations!
</div>
<div style="color: #E0EAF5; font-size: 16px; margin-bottom: 12px;">
You've completed all training modules.
</div>
</div>`,
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
        : "Expired modules were marked as expired.";

      expiredModuleInfo = `<div style="background-color: #FF550020; border-left: 4px solid #FF5555; padding: 12px; margin-bottom: 16px; border-radius: 4px;">
<div style="color: #FF5555; font-weight: 600; margin-bottom: 6px;">Module Expiration Notice</div>
<div style="color: #E0EAF5; font-size: 14px;">${comprehensiveCheck.expiredCount} training module${comprehensiveCheck.expiredCount !== 1 ? "s" : ""} expired. ${expiredList} Now active: "${finalModuleData.moduleTitle}".</div>
</div>`;
    }

    // Check attendance-based missed dates and strict streak across training days.
    const trainingModuleIds = comprehensiveCheck.allModules.map((module) => module.id);
    const missedDateInfo = await getMissedDates(
      companyId,
      deptId,
      userId,
      trainingModuleIds,
      roadmapGeneratedAt || moduleStartDate || finalModuleData.createdAt || null
    );

    const lastMissedAlertShownForCount = Number(
      userData?.trainingStats?.missedAlertShownForCount || 0
    );
    const shouldShowMissedDatesNotification =
      missedDateInfo.hasMissedDates &&
      missedDateInfo.missedCount > lastMissedAlertShownForCount;

    // Chat session today
    const today = getDateKey(new Date());
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
      if (answers && answers["4"]) companyDescription = answers["4"]; // Company description is in answers["4"]
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
        missedAlertShownForCount: shouldShowMissedDatesNotification
          ? missedDateInfo.missedCount
          : lastMissedAlertShownForCount,
        lastUpdated: new Date()
      }
    });

    // First time today reply (without company info)
    if (firstTimeToday) {
      // Calculate what day number the user is on
      const progress = calculateTrainingProgress(finalModuleData, moduleStartDate);
      const dayNumber = progress.completedDays;
      const totalDays = finalModuleData.estimatedDays || 1;
      
      // Generate daily agenda using AI
      const dailyAgenda = await generateDailyAgenda(
        dayNumber,
        totalDays,
        finalModuleData.moduleTitle,
        finalModuleData.description,
        finalModuleData.skillsCovered
      );
      
      let missedDatesNotification = "";
      if (shouldShowMissedDatesNotification) {
        const firstMissedDateFormatted = new Date(missedDateInfo.firstMissedDate).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        });
        missedDatesNotification = `<div style="background-color: #FFA50020; border-left: 4px solid #FFA500; padding: 12px; margin-bottom: 16px; border-radius: 4px;">
<div style="color: #FFA500; font-weight: 600; margin-bottom: 6px;">Missed Training Days</div>
<div style="color: #E0EAF5; font-size: 14px;">You missed ${missedDateInfo.missedCount} day${missedDateInfo.missedCount !== 1 ? "s" : ""} of training starting from ${firstMissedDateFormatted}. Make sure to catch up!</div>
</div>`;
      }

      const reply = `${missedDatesNotification}${expiredModuleInfo}<div style="line-height: 1.8;">
<div style="color: #00FFFF; font-size: 18px; font-weight: 600; margin-bottom: 12px; border-bottom: 2px solid #00FFFF; padding-bottom: 8px;">
Welcome to Day ${dayNumber} of ${totalDays}
</div>

<div style="color: #FFFFFF; font-size: 16px; font-weight: 500; margin-bottom: 16px;">
${finalModuleData.moduleTitle}
</div>

<div style="color: #00FFFF; font-size: 15px; font-weight: 600; margin-bottom: 8px;">
Today's Agenda:
</div>

<div style="color: #E0EAF5; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
${dailyAgenda}
</div>

<div style="color: #AFCBE3; font-size: 14px; font-style: italic;">
Let's get started! Ask me anything about today's topics.
</div>
</div>`;
      return res.json({ reply });
    }

    // Returning user reply (without company info)
    let missedDatesNotification = "";
    if (shouldShowMissedDatesNotification) {
      const firstMissedDateFormatted = new Date(missedDateInfo.firstMissedDate).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      missedDatesNotification = `<div style="background-color: #FFA50020; border-left: 4px solid #FFA500; padding: 12px; margin-bottom: 16px; border-radius: 4px;">
<div style="color: #FFA500; font-weight: 600; margin-bottom: 6px;">Missed Training Days</div>
<div style="color: #E0EAF5; font-size: 14px;">You missed ${missedDateInfo.missedCount} day${missedDateInfo.missedCount !== 1 ? "s" : ""} of training starting from ${firstMissedDateFormatted}. Make sure to catch up!</div>
</div>`;
    }
    return res.json({
      reply: `${missedDatesNotification}${expiredModuleInfo}<div style="line-height: 1.8;">
<div style="color: #00FFFF; font-size: 16px; font-weight: 600; margin-bottom: 12px;">
Welcome back!
</div>
<div style="color: #E0EAF5; font-size: 14px;">
Your active module is <span style="color: #FFFFFF; font-weight: 500;">${finalModuleData.moduleTitle}</span>. Ask me anything related to this module.
</div>
</div>`,
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
    const feedbackEntries = Array.isArray(userData?.chatbotFeedback?.entries)
      ? userData.chatbotFeedback.entries
      : [];
    const recentFeedback = feedbackEntries
      .slice(-3)
      .map((entry) => {
        const rating = Number(entry?.rating) || 0;
        const comment = String(entry?.comment || "").trim();
        if (rating && comment) return `- ${rating}/5: ${comment}`;
        if (rating) return `- ${rating}/5`;
        if (comment) return `- ${comment}`;
        return "";
      })
      .filter(Boolean)
      .join("\n");

    /* ---------- COMPANY INFORMATION ---------- */
    let companyInfo = "";
    try {
      const companyRef = db.collection("companies").doc(companyId).collection("onboardingAnswers");
      const companySnap = await companyRef.get();
      
      if (!companySnap.empty) {
        const companyDoc = companySnap.docs[0].data();
        const answers = companyDoc.answers || {};
        
        const duration = answers['2'] || answers[2] || "Not specified"; // Training duration
        const teamSize = answers['3'] || answers[3] || "Not specified"; // Team size
        const description = answers['4'] || answers[4] || "No description available"; // Company description
        
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

    // 🔄 COMPREHENSIVE CHECK: Scan ALL modules, mark expired ones as expired, unlock next
    const comprehensiveCheck = await checkAndUnlockModulesComprehensive(
      companyId,
      deptId,
      userId,
      roadmapRef,
      roadmapGeneratedAt
    );

    let finalActiveModule = comprehensiveCheck.nextActiveModule;
    if (!finalActiveModule) {
      return res.json({ reply: "🎉 You've completed all training modules." });
    }

    const finalModuleData = comprehensiveCheck.nextActiveModuleData;
    const moduleStartDate = getModuleStartDateByOrder(
      comprehensiveCheck.allModules,
      finalActiveModule.id,
      roadmapGeneratedAt
    );

    /* ---------- CHAT SESSION ---------- */
    const today = getDateKey(new Date());
    const chatSessionRef = roadmapRef
      .doc(finalActiveModule.id)
      .collection("chatSessions")
      .doc(today);

    const chatSessionSnap = await chatSessionRef.get();
    const existingMessages = chatSessionSnap.exists
      ? chatSessionSnap.data()?.messages || []
      : [];
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
    const messageLower = String(newMessage || "").toLowerCase();
    const explainIntent = /\b(explain|easy words|simple words|summarize|what does this mean|meaning)\b/i.test(messageLower);
    const simplifyIntent = /\b(in simple words|simple words|easy words|plain english|for beginner|as a beginner|eli5|like i(?: am|'m)? five|simplify|in easy language)\b/i.test(messageLower);
    const detailedIntent = /\b(detailed|in detail|deep dive|comprehensive|thorough|elaborate|step by step|full explanation|long explanation|explain deeply)\b/i.test(messageLower);
    const concisePointMode = !detailedIntent;
    const stepByStepIntent = /\b(step by step|how to|what should i do|next step|plan|roadmap|practice plan|action plan)\b/i.test(messageLower);
    const agenticResponseMode = stepByStepIntent ? "guided_steps" : "guided_explanation";
    const unlockIntentPatterns = [
      /\bunlock\b/i,
      /\bnext\s+module\b/i,
      /\bwhen\s+can\s+i\s+(unlock|get|access)\b/i,
      /\bhow\s+to\s+(unlock|get\s+access)\b/i,
      /\bmodule\s+(is\s+)?(locked|expired)\b/i,
      /\bcomplete\s+this\s+module\b/i,
      /\bquiz\s+unlock\b/i,
    ];
    const moduleContextKeywords = ["module", "roadmap", "quiz", "training", "unlock", "locked", "expired"];

    const hasUnlockIntent = unlockIntentPatterns.some((pattern) => pattern.test(messageLower));
    const hasModuleContext = moduleContextKeywords.some((keyword) => messageLower.includes(keyword));
    const isUnlockQuestion = !explainIntent && hasUnlockIntent && hasModuleContext;

    if (isUnlockQuestion) {
      const unlockResponse = `I understand you're asking about module progression and unlocking. 

Here's how it works:
- Modules are automatically unlocked once their estimated time expires
- Your progress is tracked automatically as you complete each module
- Expired modules are marked as expired, and the next module becomes available

For questions about your specific module timeline or if you believe something is incorrect, please contact your company admin for further details. They can review your progress and provide personalized guidance.

In the meantime, let me know if you have questions about the current module content, and I'm happy to help! 📚`;

      // Save this message to chat history
      await chatSessionRef.update({
        messages: admin.firestore.FieldValue.arrayUnion(
          { from: "user", text: newMessage, timestamp: new Date() },
          { from: "bot", text: unlockResponse, timestamp: new Date() }
        ),
      });

      const botRepliesToday =
        existingMessages.filter((message) => message?.from === "bot").length + 1;
      const askForFeedback = botRepliesToday % FEEDBACK_PROMPT_INTERVAL === 0;

      return res.json({
        reply: unlockResponse,
        askForFeedback,
        botRepliesToday,
      });
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
${recentFeedback ? `\nRECENT USER FEEDBACK:\n${recentFeedback}` : "\nRECENT USER FEEDBACK:\nNo recent feedback yet."}

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
- Adapt style based on recent user feedback (pace, clarity, and depth)
- Prioritize company training materials for module-specific content
- Use external sources for general programming concepts, best practices, or when depth is needed
- Adjust explanation depth based on Training Level: "easy" = simple terms, "medium" = moderate depth, "hard" = advanced/in-depth
- When external source is highly relevant, cite it: "<b>Source: MDN / StackOverflow / Dev.to</b>"
- Combine company knowledge with external expertise for richer answers
- In every response, end with one short context-aware question to keep the learner engaged and continue the conversation.
${weaknessWelcome ? '\n- Start this conversation by welcoming the user and acknowledging their quiz struggles\n- Explain you will help them master the weak concepts identified\n- Be encouraging and supportive about starting fresh with regenerated roadmap\n' : ''}

RESPONSE STYLE MODE:
- Current mode: ${concisePointMode ? "concise_points" : "detailed"}
- Agentic mode: ${agenticResponseMode}
- Always use fresher-friendly language with simple words and short sentences.
- Avoid heavy jargon. If jargon is necessary, explain it in plain words in the same line.
- Keep answers practical and easy to follow.
- If mode is concise_points:
  - Give a short answer in clear bullet points using <ul><li>.
  - Prefer 4 to 7 points.
  - Keep each point short and direct.
  - Do not write long paragraphs.
- If mode is detailed:
  - Give a detailed explanation only because the user asked for it.
  - Use readable structure with <h3>, <p>, and <ul><li> where helpful.
  - Explain step by step with examples.

AGENTIC RESPONSE POLICY:
- Always behave like a proactive learning coach, not just a Q&A bot.
- First infer user intent from the latest message and respond with clear guidance.
- Give at least one concrete next action the learner can do now.
- If the user asks how to do something, provide an ordered mini plan.
- If user asks concept-only questions, explain briefly first, then add "what to do next".
- User explicitly requested simplification: ${simplifyIntent ? "yes" : "no"}
- Prefer this structure for concise mode:
  - Only when user explicitly requested simplification: <p><b>In simple words:</b> ...</p>
  - Otherwise, do NOT use the exact phrase "In simple words:".
  - <ul><li>Actionable points...</li></ul>
  - <p><b>Next step:</b> one practical step</p>
- Prefer this structure for detailed mode:
  - <h3>Simple idea</h3>
  - <p>clear explanation</p>
  - <h3>Step-by-step</h3>
  - <ol><li>...</li></ol>
  - <h3>Example</h3>
  - <p>small practical example</p>
- Keep tone supportive and confidence-building for freshers.

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
    let botReply =
      completion?.response?.text() ||
      "I’m here to help with your training module.";

    // Safety net in case model misses the prompt rule.
    // Only append when there is no question at all, to avoid duplicate end questions.
    const plainReply = botReply.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!/[?؟]/.test(plainReply)) {
      const moduleTitle = (finalModuleData?.moduleTitle || "this module").trim();
      botReply = `${botReply.trim()}\n\nWhat would you like to learn next about ${moduleTitle}: concept, example, or a quick practice task?`;
    }

    // Remove the heading unless the user explicitly asked for a simplified explanation.
    if (!simplifyIntent) {
      botReply = botReply
        .replace(/^\s*<p>\s*<b>\s*In simple words:\s*<\/b>\s*/i, "<p>")
        .replace(/^\s*In simple words:\s*/i, "");
    }

    /* ---------- SAVE CHAT ---------- */
    await chatSessionRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(
        { from: "user", text: newMessage, timestamp: new Date() },
        { from: "bot", text: botReply, timestamp: new Date() }
      ),
    });

    const botRepliesToday =
      existingMessages.filter((message) => message?.from === "bot").length + 1;
    const askForFeedback = botRepliesToday % FEEDBACK_PROMPT_INTERVAL === 0;

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
      askForFeedback,
      botRepliesToday,
    });

  } catch (err) {
    console.error("❌ chatController FULL ERROR:", err);
    return res.json({ reply: "⚠️ Something went wrong." });
  }
};

export const submitChatFeedback = async (req, res) => {
  try {
    const { userId, companyId, deptId, moduleId, rating, feedbackText } = req.body;

    if (!userId || !companyId || !deptId) {
      return res.status(400).json({ success: false, error: "Missing required identifiers" });
    }

    const normalizedRating = Math.max(1, Math.min(5, Number(rating) || 0));
    const comment = String(feedbackText || "").trim().slice(0, 500);

    if (!normalizedRating && !comment) {
      return res.status(400).json({ success: false, error: "Feedback cannot be empty" });
    }

    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const todayKey = getDateKey(new Date());
    const feedbackPayload = {
      date: todayKey,
      rating: normalizedRating || null,
      comment,
      createdAt: new Date(),
      moduleId: moduleId || null,
    };

    if (moduleId) {
      const chatSessionRef = userRef
        .collection("roadmap")
        .doc(moduleId)
        .collection("chatSessions")
        .doc(todayKey);

      const chatSessionSnap = await chatSessionRef.get();
      if (!chatSessionSnap.exists) {
        await chatSessionRef.set({ startedAt: new Date(), messages: [] });
      }

      await chatSessionRef.set(
        {
          feedbackLog: admin.firestore.FieldValue.arrayUnion(feedbackPayload),
          lastFeedbackAt: new Date(),
        },
        { merge: true }
      );
    }

    const userSnap = await userRef.get();
    const existingEntries = Array.isArray(userSnap.data()?.chatbotFeedback?.entries)
      ? userSnap.data().chatbotFeedback.entries
      : [];
    const updatedEntries = [...existingEntries, feedbackPayload].slice(-MAX_FEEDBACK_ENTRIES);

    await userRef.set(
      {
        chatbotFeedback: {
          entries: updatedEntries,
          lastUpdatedAt: new Date(),
        },
      },
      { merge: true }
    );

    return res.json({
      success: true,
      acknowledgement:
        "Thanks for the feedback. I will adapt my responses to better match your preferred learning style.",
    });
  } catch (err) {
    console.error("❌ submitChatFeedback error:", err);
    return res.status(500).json({ success: false, error: "Failed to save feedback" });
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
        currentStreak: 0,
        activeModuleName: "No roadmap"
      });
    }

    // Get all modules
    const allModules = roadmapSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

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

    // Get training duration from user/onboarding
    let trainingDuration = userData?.trainingDurationFromOnboarding || 
                          userData?.trainingTime || 
                          userData?.roadmapAgentic?.trainingDuration;

    // If not found, try onboarding
    if (!trainingDuration) {
      const onboardingRef = db
        .collection("companies")
        .doc(companyId)
        .collection("onboardingAnswers");

      const onboardingSnap = await onboardingRef
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      if (!onboardingSnap.empty) {
        const data = onboardingSnap.docs[0].data();
        trainingDuration = data?.answers?.["2"] || null; // answers["2"] contains training duration
      }
    }

    // Parse training duration to days
    const totalExpectedDays = parseTrainingDurationDays(trainingDuration) || 
                             allModules.reduce((sum, module) => sum + (module.estimatedDays || 0), 0) ||
                             90; // fallback to 90 days (3 months)

    logThrottled(
      `training-duration:${companyId}:${deptId}:${userId}:${String(trainingDuration || "not-set")}:${totalExpectedDays}`,
      "📊 Training duration:",
      trainingDuration || "not set",
      "→",
      totalExpectedDays,
      "days"
    );

    const allModuleIds = allModules.map((module) => module.id);
    const attendanceStats = await getMissedDates(
      companyId,
      deptId,
      userId,
      allModuleIds,
      roadmapGeneratedAt || null
    );

    const totalActiveDays = attendanceStats.activeDays;
    const missedDates = attendanceStats.missedDates;
    const missedDaysCount = attendanceStats.missedCount;

    // 🔄 COMPREHENSIVE CHECK: Scan ALL modules, mark expired ones as expired, unlock next
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
        hasMissedDates: missedDaysCount > 0,
        missedDates,
        firstMissedDate: missedDates.length > 0 ? missedDates[0] : null,
        missedCount: missedDaysCount,
        activeDays: totalActiveDays,
        missedDays: missedDaysCount,
        totalExpectedDays,
        currentStreak: attendanceStats.streak,
        activeModuleName: "No active module"
      });
    }

    const moduleData = activeModule.data;
    const moduleStartDate = getModuleStartDateByOrder(
      comprehensiveCheck.allModules,
      activeModule.id,
      roadmapGeneratedAt
    );
    const startDateOverride = moduleStartDate || roadmapGeneratedAt || null;

    if (!startDateOverride) {
      warnThrottled(
        `missed-dates-start-missing:${companyId}:${deptId}:${userId}`,
        "⚠️ Missed-dates start date not found; falling back to module createdAt"
      );
    } else {
      logThrottled(
        `missed-dates-start:${companyId}:${deptId}:${userId}:${startDateOverride.toISOString()}`,
        "🗓️ Missed-dates start date:",
        startDateOverride.toISOString()
      );
    }
    
    const streak = attendanceStats.streak;

    await userRef.update({
      trainingStats: {
        activeDays: totalActiveDays,
        missedDays: missedDaysCount,
        totalExpectedDays,
        currentStreak: streak,
        lastUpdated: new Date()
      }
    }).catch(err => {
      console.warn("⚠️ Failed to update user stats:", err.message);
    });

    return res.json({
      success: true,
      hasMissedDates: missedDaysCount > 0,
      missedDates,
      firstMissedDate: missedDates.length > 0 ? missedDates[0] : null,
      missedCount: missedDaysCount,
      activeDays: totalActiveDays,
      missedDays: missedDaysCount,
      totalExpectedDays,
      currentStreak: streak,
      activeModuleName: moduleData.moduleTitle || "No active module"
    });

  } catch (err) {
    console.error("❌ getMissedDatesController error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to get missed dates"
    });
  }
};