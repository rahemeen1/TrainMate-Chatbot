// trainmate-backend/routes/authRoutes.js
import express from "express";
import { 
  googleOAuthCallback, 
  generateCompanyGoogleAuthUrl,
  companyGoogleOAuthCallback 
} from "../controllers/googleAuthController.js";

const router = express.Router();

// POST /api/auth/google-callback
router.post("/google-callback", googleOAuthCallback);

// GET /api/auth/company-google-auth-url
router.get("/company-google-auth-url", generateCompanyGoogleAuthUrl);

// POST /api/auth/company-google-callback
router.post("/company-google-callback", companyGoogleOAuthCallback);

export default router;
