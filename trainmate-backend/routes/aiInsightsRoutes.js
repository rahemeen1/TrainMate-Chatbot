// trainmate-backend/routes/aiInsightsRoutes.js
import express from "express";
import { getLearnerInsights } from "../controllers/aiInsightsController.js";

const router = express.Router();

// Get AI insights for learner
router.get("/ai-insights/:companyId/:deptId/:userId", getLearnerInsights);

export default router;
