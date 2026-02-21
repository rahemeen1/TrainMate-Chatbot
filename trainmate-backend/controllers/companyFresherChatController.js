// trainmate-backend/controllers/companyFresherChatController.js
import { db } from "../config/firebase.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

let model = null;

function initializeModel() {
  if (!model) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return model;
}

/**
 * Fetch all freshers of a company with their performance metrics
 */
async function getFreshersData(companyId) {
  try {
    const freshersData = [];
    const departmentsSnap = await db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .get();

    for (const deptDoc of departmentsSnap.docs) {
      const deptId = deptDoc.id;
      const deptData = deptDoc.data();

      const usersSnap = await db
        .collection("freshers")
        .doc(companyId)
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
          .doc(companyId)
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

        freshersData.push({
          userId,
          deptId,
          name: userData.name || "N/A",
          email: userData.email || "N/A",
          status: userData.status || "inactive",
          trainingOn: userData.trainingOn || "N/A",
          trainingLevel: userData.trainingLevel || "N/A",
          progress: userData.progress || 0,
          department: deptData.departmentName || "N/A",
          completedModules,
          totalModules,
          activeModuleTitle:
            modules.find((m) => m.status === "in-progress")?.moduleTitle ||
            modules.find((m) => !m.completed)?.moduleTitle ||
            "N/A",
          trainingStats: userData.trainingStats || {},
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
async function getSpecificFresher(companyId, fresherName) {
  try {
    const freshersData = await getFreshersData(companyId);
    const fresher = freshersData.find(
      (f) => f.name.toLowerCase().includes(fresherName.toLowerCase())
    );
    return fresher || null;
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
- Keep responses concise but informative`;

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
    return {
      success: false,
      reply: "Sorry, I encountered an error. Please try again.",
      error: err.message,
    };
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
