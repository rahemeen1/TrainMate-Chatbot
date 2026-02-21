// trainmate-backend/routes/companyFresherChatRoutes.js
import express from "express";
import {
  companyFresherChatController,
  getCompanyFreshersSummaryController,
  getTopPerformersController,
  getFreshersNeedingAttentionController,
} from "../controllers/companyFresherChatController.js";

const router = express.Router();

// POST - Company chat with AI assistant
router.post("/chat", companyFresherChatController);

// GET - Get freshers summary
router.get("/summary/:companyId", getCompanyFreshersSummaryController);

// GET - Get top performers
router.get("/top-performers/:companyId", getTopPerformersController);

// GET - Get freshers needing attention
router.get("/attention/:companyId", getFreshersNeedingAttentionController);

export default router;
