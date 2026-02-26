// trainmate-backend/routes/authRoutes.js
import express from "express";
import { googleOAuthCallback } from "../controllers/googleAuthController.js";

const router = express.Router();

// POST /api/auth/google-callback
router.post("/google-callback", googleOAuthCallback);

export default router;
