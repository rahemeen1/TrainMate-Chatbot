import admin from "firebase-admin";
import { db } from "../../config/firebase.js";
import { isDocAllowed } from "../../utils/relevanceGuard.js";
import { updateMemoryAfterChat, getAgentMemory } from "../memoryService.js";
import { searchMDN } from "../../knowledge/mdn.js";
import { searchStackOverflow } from "../../knowledge/stackoverflow.js";
import { searchDevTo } from "../../knowledge/devto.js";
import { aggregateKnowledge } from "../../knowledge/knowledgeAggregator.js";
import { orchestrator } from "../agentOrchestrator.service.js";
import { getPineconeIndex } from "../../config/pinecone.js";
import { CohereClient } from "cohere-ai";
import { getCompanyInfo as getCompanyInfoFromContextBuilder, buildChatPrompt as buildChatPromptFromContextBuilder } from "./contextBuilder.service.js";
import { getRoadmapGeneratedAt as getRoadmapGeneratedAtFromModuleService, getModuleStartDateByOrder as getModuleStartDateByOrderFromModuleService, selectActiveModule as selectActiveModuleFromModuleService, summarizeModule as summarizeModuleFromModuleService } from "./moduleService.js";
import { calculateSkillProgressFromActual as calculateSkillProgressFromActualFromProgressService, getActualSkillsCovered as getActualSkillsCoveredFromProgressService, getMissedDates as getMissedDatesFromProgressService } from "./progressService.js";
import { cacheKeyFor as cacheKeyForFromRetrievalService, embedText as embedTextFromRetrievalService, fetchAgenticKnowledge as fetchAgenticKnowledgeFromRetrievalService, queryPinecone as queryPineconeFromRetrievalService, rankContextCandidates as rankContextCandidatesFromRetrievalService } from "./retrievalService.js";

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
const FEEDBACK_PROMPT_INTERVAL = 10;
const requestCache = new Map();
const cacheTtlMs = 5 * 60 * 1000;

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

function getDateKey(date, timeZone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function setCache(key, value) {
  requestCache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
}

function getCache(key) {
  const entry = requestCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    requestCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheKeyFor(query, companyId, deptId) {
  return `${companyId}:${deptId}:${String(query || "").trim().toLowerCase()}`;
}

async function embedText(text) {
  const res = await cohere.embed({
    model: "embed-english-v3.0",
    texts: [text],
    inputType: "search_query",
  });
  return res.embeddings[0];
}

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

function calculateTrainingProgress(moduleData, startDateOverride) {
  const totalDays = moduleData.estimatedDays;
  const baseStart = startDateOverride || moduleData.createdAt;

  if (!baseStart) {
    return { completedDays: 0, remainingDays: totalDays };
  }

  const startDate = baseStart.toDate ? baseStart.toDate() : new Date(baseStart);
  const today = new Date();
  startDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const completedDays = Math.min(diffDays, totalDays);
  const remainingDays = Math.max(totalDays - completedDays, 0);

  return { completedDays, remainingDays };
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

async function selectActiveModule(sortedModules, roadmapGeneratedAt, roadmapRef) {
  const candidates = [...sortedModules];
  let activeModule = candidates.find((doc) => doc.data.status === "in-progress") || null;

  if (!activeModule) {
    activeModule = candidates.find((doc) => doc.data.status === "active") || null;
  }

  if (!activeModule) {
    activeModule = candidates.find((doc) => !doc.data.completed && doc.data.status !== "completed") || null;
  }

  if (!activeModule) {
    return null;
  }

  const moduleStartDate = getModuleStartDateByOrder(candidates, activeModule.id, roadmapGeneratedAt);
  const progress = calculateTrainingProgress(activeModule.data, moduleStartDate);
  const isExpired = progress.remainingDays <= 0;

  if (isExpired && activeModule.data.status !== "expired") {
    await roadmapRef.doc(activeModule.id).update({
      status: "expired",
      completed: false,
      moduleLocked: true,
      expiredAt: new Date(),
    }).catch(() => null);

    const nextModule = candidates.find((doc) => doc.id !== activeModule.id && !doc.data.completed && doc.data.status !== "completed" && doc.data.status !== "expired") || null;
    if (nextModule) {
      await roadmapRef.doc(nextModule.id).update({
        status: "in-progress",
        startedAt: new Date(),
      }).catch(() => null);
      return nextModule;
    }
  }

  return activeModule;
}

async function getCompanyInfo(companyId) {
  try {
    const companyRef = db.collection("companies").doc(companyId).collection("onboardingAnswers");
    const companySnap = await companyRef.get();

    if (companySnap.empty) {
      return { companyInfo: "", companyDescription: "" };
    }

    const companyDoc = companySnap.docs[0].data();
    const answers = companyDoc.answers || {};
    const duration = answers["2"] || answers[2] || "Not specified";
    const teamSize = answers["3"] || answers[3] || "Not specified";
    const description = answers["4"] || answers[4] || "No description available";

    return {
      companyInfo: `\nCOMPANY INFORMATION:\nDuration: ${duration}\nTeam Size: ${teamSize}\nAbout: ${description}\n`,
      companyDescription: description,
      trainingDuration: duration,
    };
  } catch (error) {
    console.warn("⚠️ Could not fetch company info:", error.message);
    return { companyInfo: "", companyDescription: "" };
  }
}

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

    chatSnap.forEach((sessionDoc) => {
      const sessionData = sessionDoc.data();
      const messages = sessionData.messages || [];
      const conversationText = messages.map((m) => m.text || "").join(" ").toLowerCase();

      skillsCovered.forEach((skill) => {
        if (conversationText.includes(String(skill).toLowerCase())) {
          allSkillsCovered.add(skill);
        }
      });
    });

    const actualSkillsCovered = Array.from(allSkillsCovered);
    const totalCovered = actualSkillsCovered.length;
    const totalSkills = skillsCovered.length;
    const percentage = totalSkills > 0 ? Math.round((totalCovered / totalSkills) * 100) : 0;

    return {
      actualSkillsCovered,
      totalCovered,
      totalSkills,
      percentage,
    };
  } catch (error) {
    console.error("❌ Error getting actual skills covered:", error.message);
    return {
      actualSkillsCovered: [],
      totalCovered: 0,
      totalSkills: skillsCovered.length,
      percentage: 0,
    };
  }
}

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
    const activeDates = new Set(chatSnap.docs.map((doc) => doc.id));

    if (!startDateOverride && !moduleData.createdAt) {
      return {
        hasMissedDates: false,
        missedDates: [],
        firstMissedDate: null,
        missedCount: 0,
        activeDays: 0,
        totalExpectedDays: 0,
        streak: 0,
      };
    }

    const startBase = startDateOverride || moduleData.createdAt;
    const startDate = startBase.toDate ? startBase.toDate() : new Date(startBase);
    const now = new Date();
    const today = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 1);

    if (endDate < startDate) {
      return {
        hasMissedDates: false,
        missedDates: [],
        firstMissedDate: null,
        missedCount: 0,
        activeDays: activeDates.size,
        totalExpectedDays: 0,
        streak: activeDates.has(getDateKey(today)) ? 1 : 0,
      };
    }

    const missedDates = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = getDateKey(currentDate);
      if (!activeDates.has(dateStr)) {
        missedDates.push(dateStr);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const totalExpectedDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    let streak = 0;
    const streakDate = new Date(activeDates.has(getDateKey(today)) ? today : endDate);
    while (true) {
      const dateStr = getDateKey(streakDate);
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
      activeDays: activeDates.size,
      totalExpectedDays,
      streak,
    };
  } catch (error) {
    console.error("❌ Error calculating missed dates:", error.message);
    return {
      hasMissedDates: false,
      missedDates: [],
      firstMissedDate: null,
      missedCount: 0,
      activeDays: 0,
      totalExpectedDays: 0,
      streak: 0,
    };
  }
}

function rankContextCandidates(userMessage, contextCandidates = []) {
  const terms = new Set(String(userMessage || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const sourcePriority = {
    companyDoc: 1.0,
    mdn: 0.9,
    stackOverflow: 0.7,
    devto: 0.6,
    external: 0.5,
  };

  return contextCandidates
    .map((candidate) => {
      const text = String(candidate?.text || "");
      const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const overlap = words.filter((word) => terms.has(word)).length;
      const semanticScore = overlap / Math.max(1, terms.size);
      const priority = sourcePriority[String(candidate?.source || "external")] || 0.5;
      const recency = candidate?.updatedAt ? 0.1 : 0;
      const userRelevance = candidate?.score ? Math.min(1, Number(candidate.score)) : 0;
      const rankScore = (semanticScore * 0.5) + (priority * 0.3) + recency + (userRelevance * 0.1);
      return {
        ...candidate,
        text,
        rankScore,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 4);
}

async function fetchAgenticKnowledge(query, companyDocs, cacheKey) {
  const cached = cacheKey ? getCache(`${cacheKey}:external`) : null;
  if (cached) {
    return cached;
  }

  try {
    const [mdnResults, soResults, devtoResults] = await Promise.all([
      searchMDN(query).catch((error) => {
        console.warn("⚠️ MDN fetch failed:", error.message);
        return [];
      }),
      searchStackOverflow(query).catch((error) => {
        console.warn("⚠️ StackOverflow fetch failed:", error.message);
        return [];
      }),
      searchDevTo(query).catch((error) => {
        console.warn("⚠️ Dev.to fetch failed:", error.message);
        return [];
      }),
    ]);

    const aggregated = aggregateKnowledge({
      companyDocs,
      mdn: mdnResults,
      stackOverflow: soResults,
      devto: devtoResults,
    });

    const payload = {
      allResults: aggregated.allResults,
      topResult: aggregated.topResult,
      summary: aggregated.allResults.slice(0, 3),
    };

    if (cacheKey) {
      setCache(`${cacheKey}:external`, payload);
    }

    return payload;
  } catch (error) {
    console.error("❌ Agentic knowledge fetch failed:", error.message);
    return {
      allResults: companyDocs,
      topResult: companyDocs[0] || null,
      summary: companyDocs.slice(0, 3),
    };
  }
}

async function queryPinecone({ embedding, companyId, deptId, topK = 5 }) {
  try {
    const index = getPineconeIndex();
    const res = await index
      .namespace(`company-${companyId}`)
      .query({
        vector: embedding,
        topK,
        includeMetadata: true,
        filter: { deptName: { $eq: deptId.toUpperCase() } },
      });

    return (res.matches || []).map((match) => ({
      text: match.metadata?.text || "",
      score: match.score || 0,
      source: "pinecone",
      dept: match.metadata?.deptName || deptId,
    }));
  } catch (error) {
    console.error("❌ Pinecone query failed:", error.message);
    return [];
  }
}

async function buildFinalPrompt({
  userData,
  companyInfo,
  finalModuleData,
  moduleStartDate,
  recentFeedback,
  agentMemory,
  strugglingAreas,
  masteredTopics,
  skillProgress,
  context,
  weaknessWelcome,
  missedDateInfo,
  message,
}) {
  return `
SYSTEM ROLE:
You are TrainMate, a goal-driven onboarding agent focused on teaching concepts.

${weaknessWelcome ? `${weaknessWelcome}\n` : ""}
LEARNING MEMORY (Topics & Patterns):
${agentMemory}
${strugglingAreas.length > 0 ? `\nUser needs help with: ${strugglingAreas.slice(0, 3).join(", ")}` : ""}
${masteredTopics.length > 0 ? `\nUser has learned: ${masteredTopics.slice(0, 3).join(", ")}` : ""}
${recentFeedback ? `\nRECENT USER FEEDBACK:\n${recentFeedback}` : "\nRECENT USER FEEDBACK:\nNo recent feedback yet."}

USER PROFILE:
Name: ${userData.name || "User"}
Department: ${userData.deptName || "Unknown"}
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
    ? `Skill-Based Progress: ${skillProgress.masteredSkills}/${skillProgress.totalSkills} skills actually covered in conversations (${skillProgress.progressPercentage}%)\nSkills Covered So Far: ${skillProgress.actualSkillsCovered.length > 0 ? skillProgress.actualSkillsCovered.join(", ") : "No skills covered yet"}\nSkills Still to Cover: ${finalModuleData.skillsCovered ? finalModuleData.skillsCovered.filter((skill) => !skillProgress.actualSkillsCovered.includes(skill)).join(", ") : "N/A"}`
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
${weaknessWelcome ? "\n- Start this conversation by welcoming the user and acknowledging their quiz struggles\n- Explain you will help them master the weak concepts identified\n- Be encouraging and supportive about starting fresh with regenerated roadmap\n" : ""}

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
${weaknessWelcome ? "" : "- NEVER repeat greetings or introductions\n"}- NEVER repeat step numbers or progress status (e.g., "You've completed 2 of 6 steps")
- NEVER say "ready to dive", "let's move on", or similar transition phrases
- Get straight to answering the question with teaching content
- If completely off-topic (not module, company, or department related), say: "I'm here to help with your training module and answer questions about the company."
- Focus on teaching concepts, not announcing progress

CONTEXT:
${context}

USER MESSAGE:
${message}

RESPOND WITH: Direct educational content addressing the question, using both company materials and external sources intelligently. No progress updates or step announcements.
`;
}

export async function handleChatRequest({ userId, companyId, deptId, newMessage }) {
  if (!userId || !companyId || !deptId || !newMessage) {
    return { reply: "Missing parameters" };
  }

  const cacheKey = cacheKeyForFromRetrievalService(newMessage, companyId, deptId);
  const cached = getCache(cacheKey);
  if (cached) {
    return cached;
  }

  const userRef = db
    .collection("freshers")
    .doc(companyId)
    .collection("departments")
    .doc(deptId)
    .collection("users")
    .doc(userId);

  const roadmapRef = userRef.collection("roadmap");

  const [userSnap, roadmapSnap, companyMeta] = await Promise.all([
    userRef.get(),
    roadmapRef.get(),
    getCompanyInfoFromContextBuilder(companyId, db),
  ]);

  const userData = userSnap.exists ? userSnap.data() : {};
  const roadmapGeneratedAt = getRoadmapGeneratedAtFromModuleService(userData);

  if (roadmapSnap.empty) {
    return { reply: "Your roadmap does not exist." };
  }

  const sortedModules = roadmapSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .sort((a, b) => (a.data.order || 0) - (b.data.order || 0));

  const activeModuleBundle = await selectActiveModuleFromModuleService(sortedModules, roadmapGeneratedAt, roadmapRef);
  const activeModule = activeModuleBundle?.activeModule || null;
  if (!activeModule) {
    return { reply: "🎉 You've completed all training modules. Contact your company admin for next steps." };
  }

  const finalModuleData = summarizeModuleFromModuleService(activeModule.data);
  const moduleStartDate = activeModuleBundle?.moduleStartDate || getModuleStartDateByOrderFromModuleService(
    sortedModules,
    activeModule.id,
    roadmapGeneratedAt
  );

  const today = getDateKey(new Date());
  const chatSessionRef = roadmapRef.doc(activeModule.id).collection("chatSessions").doc(today);
  const [chatSnap, memoryData, actualSkillsData, missedDateInfo] = await Promise.all([
    chatSessionRef.get(),
    getAgentMemory({ userId, companyId, deptId, moduleId: activeModule.id }),
    getActualSkillsCoveredFromProgressService(companyId, deptId, userId, activeModule.id, finalModuleData.skillsCovered || []),
    getMissedDatesFromProgressService(companyId, deptId, userId, activeModule.id, finalModuleData, moduleStartDate),
  ]);

  const existingMessages = chatSnap.exists ? chatSnap.data()?.messages || [] : [];
  if (!chatSnap.exists) {
    await chatSessionRef.set({ startedAt: new Date(), messages: [] });
  }

  const agentMemory = memoryData.summary || "No prior memory.";
  const strugglingAreas = memoryData.strugglingAreas || [];
  const masteredTopics = memoryData.masteredTopics || [];
  const skillProgress = calculateSkillProgressFromActualFromProgressService(actualSkillsData);

  const messageLower = newMessage.toLowerCase();
  const isUnlockQuestion = ["unlock", "next module", "how to get", "when can i", "access", "locked", "expired", "complete this module"].some((keyword) => messageLower.includes(keyword));

  if (isUnlockQuestion) {
    const unlockResponse = `I understand you're asking about module progression and unlocking. \n\nHere's how it works:\n- Modules are automatically unlocked once their estimated time expires\n- Your progress is tracked automatically as you complete each module\n- Expired modules are marked as expired, and the next module becomes available\n\nFor questions about your specific module timeline or if you believe something is incorrect, please contact your company admin for further details. They can review your progress and provide personalized guidance.\n\nIn the meantime, let me know if you have questions about the current module content, and I'm happy to help! 📚`;

    await chatSessionRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(
        { from: "user", text: newMessage, timestamp: new Date() },
        { from: "bot", text: unlockResponse, timestamp: new Date() }
      ),
    });

    const botRepliesToday = existingMessages.filter((message) => message?.from === "bot").length + 1;
    const askForFeedback = botRepliesToday % FEEDBACK_PROMPT_INTERVAL === 0;

    const response = { reply: unlockResponse, askForFeedback, botRepliesToday };
    setCache(cacheKey, response);
    return response;
  }

  let weaknessWelcome = "";
  if (chatSnap.exists && userData.roadmapRegenerated && userData.weaknessAnalysis) {
    const weakness = userData.weaknessAnalysis;
    const generatedAt = weakness.generatedAt?.toDate ? weakness.generatedAt.toDate() : new Date(weakness.generatedAt);
    const hoursSinceRegeneration = (new Date() - generatedAt) / (1000 * 60 * 60);
    if (hoursSinceRegeneration < 48) {
      const topWeakConcepts = (weakness.concepts || []).slice(0, 5).map((item) => item.concept).join(", ");
      const wrongQuestionsPreview = (weakness.wrongQuestions || []).slice(0, 3)
        .map((item) => `- ${item.question.substring(0, 60)}...`)
        .join("\n");
      weaknessWelcome = `\n🔄 ROADMAP REGENERATION CONTEXT:\nYour learning roadmap has been regenerated based on your quiz performance.\n\nAREAS YOU STRUGGLED WITH:\n${topWeakConcepts || "General concepts"}\n\nAVERAGE QUIZ SCORE: ${weakness.avgScore}%\n\nSAMPLE QUESTIONS YOU GOT WRONG:\n${wrongQuestionsPreview || "No specific questions available"}\n\nI will focus our conversation on strengthening these areas. Let's start from the fundamentals and build your understanding step by step.\n`;
      await userRef.update({
        "weaknessAnalysis.welcomed": true,
        "weaknessAnalysis.welcomedAt": new Date(),
      }).catch((error) => console.warn("Failed to update weakness welcome flag:", error.message));
    }
  }

  const companyInfo = companyMeta.companyInfo || "";
  const actualSkillsContext = finalModuleData.skillsCovered || [];

  const [embedding, externalKnowledge] = await Promise.all([
    embedTextFromRetrievalService(newMessage).catch((error) => {
      console.warn("⚠️ Embedding skipped:", error.message);
      return null;
    }),
    fetchAgenticKnowledgeFromRetrievalService(newMessage, [], cacheKey),
  ]);

  const pineconeResults = embedding
    ? await queryPineconeFromRetrievalService({ embedding, companyId, deptId })
    : [];
  const relevantDocs = pineconeResults.filter((doc) => isDocAllowed({
    similarityScore: doc.score,
    docDepartment: doc.dept,
    userDepartment: deptId.toUpperCase(),
  }));

  const contextCandidates = rankContextCandidatesFromRetrievalService(newMessage, [
    ...relevantDocs.map((doc) => ({ source: "companyDoc", text: doc.text, score: doc.score })),
    ...externalKnowledge.summary.map((doc) => ({
      source: doc.source || "external",
      text: [doc.title, doc.summary, doc.text, doc.link].filter(Boolean).join(" | "),
      score: Number(doc.score || 0),
    })),
  ]);

  const context = contextCandidates.length > 0
    ? contextCandidates.map((item) => item.text).join("\n\n")
    : "No additional context.";

  const recentFeedback = Array.isArray(userData?.chatbotFeedback?.entries)
    ? userData.chatbotFeedback.entries.slice(-3)
        .map((entry) => {
          const rating = Number(entry?.rating) || 0;
          const comment = String(entry?.comment || "").trim();
          if (rating && comment) return `- ${rating}/5: ${comment}`;
          if (rating) return `- ${rating}/5`;
          if (comment) return `- ${comment}`;
          return "";
        })
        .filter(Boolean)
        .join("\n")
    : "";

  const finalPrompt = buildChatPromptFromContextBuilder({
    userData,
    companyInfo,
    finalModuleData,
    moduleStartDate,
    completedDays: calculateTrainingProgress(finalModuleData, moduleStartDate).completedDays,
    remainingDays: calculateTrainingProgress(finalModuleData, moduleStartDate).remainingDays,
    recentFeedback,
    agentMemory,
    strugglingAreas,
    masteredTopics,
    skillProgress,
    context,
    weaknessWelcome,
    missedDateInfo,
    message: newMessage,
  });

  const chatResult = await orchestrator.executeWorkflow("chatPipeline", {
    companyId,
    deptId,
    userId,
    userMessage: newMessage,
    finalPrompt,
    contextCandidates,
    expectedFormat: "html",
    fallbackReply: "I am here to help with your training module.",
    constraints: {
      maxLatency: 2000,
      costSensitivity: "medium",
    },
  });

  let botReply = chatResult?.reply || "I am here to help with your training module.";
  const plainReply = botReply.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!/[?؟]/.test(plainReply)) {
    const moduleTitle = (finalModuleData?.moduleTitle || "this module").trim();
    botReply = `${botReply.trim()}\n\nWhat would you like to learn next about ${moduleTitle}: concept, example, or a quick practice task?`;
  }

  await chatSessionRef.update({
    messages: admin.firestore.FieldValue.arrayUnion(
      { from: "user", text: newMessage, timestamp: new Date() },
      { from: "bot", text: botReply, timestamp: new Date() }
    ),
  });

  const botRepliesToday = existingMessages.filter((message) => message?.from === "bot").length + 1;
  const askForFeedback = botRepliesToday % FEEDBACK_PROMPT_INTERVAL === 0;

  updateMemoryAfterChat({
    userId,
    companyId,
    deptId,
    moduleId: activeModule.id,
    userMessage: newMessage,
    botReply,
  }).catch((error) => console.warn("⚠️ Memory update skipped:", error.message));

  const response = {
    reply: botReply,
    sourceUsed: relevantDocs.length > 0,
    askForFeedback,
    botRepliesToday,
    chatDecision: {
      plan: chatResult?.plan || null,
      guardrail: chatResult?.guardrail || null,
      rankedContext: chatResult?.rankedContext || [],
      usedRecovery: Boolean(chatResult?.usedRecovery),
    },
  };

  setCache(cacheKey, response);
  return response;
}
