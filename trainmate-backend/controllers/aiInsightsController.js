// trainmate-backend/controllers/aiInsightsController.js
import { aiGetLearnerInsights } from "../services/aiAgenticNotificationService.js";

/**
 * Get AI-generated insights about learner's progress
 */
export async function getLearnerInsights(req, res) {
  try {
    const { companyId, deptId, userId } = req.params;

    const insights = await aiGetLearnerInsights({
      companyId,
      deptId,
      userId,
      userName: req.query.userName || "Learner",
    });

    if (!insights) {
      return res.status(500).json({ error: "Failed to generate insights" });
    }

    return res.json({
      success: true,
      insights,
      message: "AI-generated learner insights",
    });
  } catch (error) {
    console.error("Error getting learner insights:", error);
    return res.status(500).json({ error: "Failed to get insights" });
  }
}
