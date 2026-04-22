// trainmate-backend/controllers/companyFresherChatController.js
import { db } from "../config/firebase.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { queueAgentRunIncrement } from "../services/agentHealthStorage.service.js";

dotenv.config();

let model = null;

function recordCompanyChatAgentRun({ status, durationMs }) {
  try {
    queueAgentRunIncrement({
      agentKey: "company-fresher-chat-agent",
      agentName: "Company Fresher Chat Agent",
      status,
      durationMs,
      segment: "Company",
      type: "function-agent",
    });
  } catch (error) {
    console.warn("[AGENT-HEALTH] Failed to queue company chat agent metric:", error.message);
  }
}

const KNOWN_DEPARTMENTS = [
  "HR",
  "SOFTWAREDEVELOPMENT",
  "AI",
  "ACCOUNTING",
  "MARKETING",
  "OPERATIONS",
  "DATASCIENCE",
  "IT",
];

function initializeModel() {
  if (!model) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return model;
}

async function resolveDepartmentIds(companyId) {
  const companyRef = db.collection("freshers").doc(companyId);
  const departmentsRef = companyRef.collection("departments");
  const departmentsSnap = await departmentsRef.get();
  const deptIds = departmentsSnap.docs.map((doc) => doc.id);

  if (deptIds.length > 0) return deptIds;

  try {
    const usersGroupSnap = await db.collectionGroup("users").get();
    const discoveredDeptIds = new Set();

    for (const userDoc of usersGroupSnap.docs) {
      const segments = userDoc.ref.path.split("/");
      if (
        segments[0] === "freshers" &&
        segments[1] === companyId &&
        segments[2] === "departments" &&
        segments[3]
      ) {
        discoveredDeptIds.add(segments[3]);
      }
    }

    if (discoveredDeptIds.size > 0) {
      return Array.from(discoveredDeptIds);
    }
  } catch {
    // fallback to known department list
  }

  const existingDepts = [];
  for (const deptName of KNOWN_DEPARTMENTS) {
    try {
      const usersSnap = await departmentsRef.doc(deptName).collection("users").limit(1).get();
      if (!usersSnap.empty) existingDepts.push(deptName);
    } catch {
      // ignore malformed/unauthorized department reads and continue
    }
  }

  return existingDepts;
}

/**
 * Fetch all freshers of a company with their performance metrics
 */
async function getFreshersData(companyId) {
  try {
    const normalizedCompanyId = String(companyId || "").trim();
    if (!normalizedCompanyId) return [];

    const freshersData = [];
    const departmentIds = await resolveDepartmentIds(normalizedCompanyId);

    for (const deptId of departmentIds) {
      const deptDoc = await db
        .collection("freshers")
        .doc(normalizedCompanyId)
        .collection("departments")
        .doc(deptId)
        .get();

      const deptData = deptDoc.data();

      const usersSnap = await db
        .collection("freshers")
        .doc(normalizedCompanyId)
        .collection("departments")
        .doc(deptId)
        .collection("users")
        .get();

      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();

        // Fetch roadmap data
        const roadmapSnap = await db
          .collection("freshers")
          .doc(normalizedCompanyId)
          .collection("departments")
          .doc(deptId)
          .collection("users")
          .doc(userId)
          .collection("roadmap")
          .get();

        const modules = roadmapSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        const completedModules = modules.filter((m) => m.completed).length;
        const totalModules = modules.length;
        const activeModule =
  modules.find(m => !m.completed && !m.moduleLocked) ||
  modules.find(m => !m.completed);

        freshersData.push({
          userId,
          deptId,
          name: userData.name, 
          email: userData.email,
          status: userData.status,
          trainingStatus: userData.trainingStatus,
          trainingOn: userData.trainingOn,
          trainingLevel: userData.trainingLevel,
          progress: userData.progress ,
          department: deptId,
          completedModules,
          totalModules,
          activeModuleTitle: activeModule?.moduleTitle,
          onboarding: userData.onboarding || {},
        });
      }
    }

    return freshersData;
  } catch (err) {
    console.error("❌ Error fetching freshers data:", err);
    return [];
  }
}

/**
 * Get summary statistics for all freshers
 */
async function getFreashersSummary(companyId) {
  try {
    const freshersData = await getFreshersData(companyId);

    const totalFreshers = freshersData.length;
    const activeFreshers = freshersData.filter(
      (f) => f.status === "active"
    ).length;
    const avgProgress =
      freshersData.length > 0
        ? Math.round(
            freshersData.reduce((sum, f) => sum + f.progress, 0) /
              freshersData.length
          )
        : 0;
    const avgCompletedModules =
      freshersData.length > 0
        ? (
            freshersData.reduce((sum, f) => sum + f.completedModules, 0) /
            freshersData.length
          ).toFixed(1)
        : 0;

    return {
      totalFreshers,
      activeFreshers,
      inactiveFreshers: totalFreshers - activeFreshers,
      avgProgress,
      avgCompletedModules,
      freshersData,
    };
  } catch (err) {
    console.error("❌ Error getting freshers summary:", err);
    return {
      totalFreshers: 0,
      activeFreshers: 0,
      inactiveFreshers: 0,
      avgProgress: 0,
      avgCompletedModules: 0,
      freshersData: [],
    };
  }
}

/**
 * Get specific fresher details
 */
  async function getSpecificFresher(companyId, identifier) {
  try {
    const freshersData = await getFreshersData(companyId);
  return freshersData.find(
    f => f.email === identifier || f.userId === identifier
  ) || null;
  } catch (err) {
    console.error("❌ Error getting specific fresher:", err);
    return null;
  }
}

/**
 * Get top performers in the company
 */
async function getTopPerformers(companyId, topN = 5) {
  try {
    const freshersData = await getFreshersData(companyId);
    return freshersData
      .sort((a, b) => b.progress - a.progress)
      .slice(0, topN)
      .map((f) => ({
        name: f.name,
        progress: f.progress,
        department: f.department,
        status: f.status,
      }));
  } catch (err) {
    console.error("❌ Error getting top performers:", err);
    return [];
  }
}

/**
 * Get freshers needing attention (low progress or inactive)
 */
async function getFreshersNeedingAttention(companyId) {
  try {
    const freshersData = await getFreshersData(companyId);
    return freshersData
      .filter((f) => f.progress < 50 || f.status === "inactive")
      .map((f) => ({
        name: f.name,
        progress: f.progress,
        status: f.status,
        department: f.department,
        reason:
          f.status === "inactive"
            ? "Inactive"
            : `Low progress (${f.progress}%)`,
      }));
  } catch (err) {
    console.error("❌ Error getting freshers needing attention:", err);
    return [];
  }
}

/**
 * Generate AI response based on fresher data
 */
async function generateAIResponse(companyId, userQuery) {
  const startedAt = Date.now();
  let runStatus = "success";
  try {
    const model = initializeModel();

    // Get fresher data based on query type
    let context = "";
    let freshersContext = {};

    if (
      userQuery.toLowerCase().includes("summary") ||
      userQuery.toLowerCase().includes("overview")
    ) {
      freshersContext = await getFreashersSummary(companyId);
      context = JSON.stringify(freshersContext, null, 2);
    } else if (
      userQuery.toLowerCase().includes("top") ||
      userQuery.toLowerCase().includes("best")
    ) {
      const topPerformers = await getTopPerformers(companyId);
      context = JSON.stringify(
        { topPerformers },
        null,
        2
      );
    } else if (
      userQuery.toLowerCase().includes("attention") ||
      userQuery.toLowerCase().includes("struggling") ||
      userQuery.toLowerCase().includes("low progress")
    ) {
      const needingAttention = await getFreshersNeedingAttention(companyId);
      context = JSON.stringify(
        { needingAttention },
        null,
        2
      );
    } else {
      // Default: get comprehensive summary
      freshersContext = await getFreashersSummary(companyId);
      context = JSON.stringify(freshersContext, null, 2);
    }

    const systemPrompt = `You are a helpful company HR chatbot assistant. You have access to fresher data from the company's training system.
Your role is to help managers and HR professionals understand fresher performance, progress, and training status.
Always be friendly, professional, and data-driven in your responses.

Fresher Data Context:
${context}

Guidelines:
- Provide specific metrics and numbers when available
- Highlight achievements and concerns
- Make recommendations for improvement
- Keep responses concise but informative
- Do not use markdown symbols like **, *, #, or backticks
- Use plain readable text with short lines and optional bullet points`;

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: userQuery }],
        },
      ],
      systemInstruction: systemPrompt,
    });

    const reply = response.response.text();

    return {
      success: true,
      reply,
      dataContext: freshersContext,
    };
  } catch (err) {
    console.error("❌ Error generating AI response:", err);
    runStatus = "failed";
    return {
      success: false,
      reply: "Sorry, I encountered an error. Please try again.",
      error: err.message,
    };
  } finally {
    recordCompanyChatAgentRun({
      status: runStatus,
      durationMs: Date.now() - startedAt,
    });
  }
}

/**
 * Main chat handler for company chatbot
 */
export async function companyFresherChatController(req, res) {
  try {
    const { companyId, message, queryType } = req.body;

    if (!companyId || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing companyId or message",
      });
    }

    // Generate AI response
    const { success, reply, dataContext, error } = await generateAIResponse(
      companyId,
      message
    );

    if (!success) {
      return res.status(500).json({
        success: false,
        error: error || "Failed to generate response",
      });
    }

    return res.status(200).json({
      success: true,
      reply,
      dataContext,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error("❌ Chat controller error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

/**
 * Get fresher summary controller
 */
export async function getCompanyFreshersSummaryController(req, res) {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "Missing companyId",
      });
    }

    const summary = await getFreashersSummary(companyId);

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    console.error("❌ Error fetching freshers summary:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

/**
 * Get top performers controller
 */
export async function getTopPerformersController(req, res) {
  try {
    const { companyId } = req.params;
    const topN = req.query.limit || 5;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "Missing companyId",
      });
    }

    const topPerformers = await getTopPerformers(companyId, parseInt(topN));

    return res.status(200).json({
      success: true,
      data: topPerformers,
    });
  } catch (err) {
    console.error("❌ Error fetching top performers:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

/**
 * Get freshers needing attention controller
 */
export async function getFreshersNeedingAttentionController(req, res) {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "Missing companyId",
      });
    }

    const needingAttention = await getFreshersNeedingAttention(companyId);

    return res.status(200).json({
      success: true,
      data: needingAttention,
    });
  } catch (err) {
    console.error("❌ Error fetching freshers needing attention:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
