import express from "express";
import { sendAdminRegeneratedRoadmapEmail, sendAdminGrantedAttemptsEmail } from "../services/emailService.js";

const router = express.Router();

/**
 * POST /api/email/admin-regenerated-roadmap
 * Send email when admin regenerates a user's roadmap
 */
router.post("/email/admin-regenerated-roadmap", async (req, res) => {
  try {
    const { userEmail, userName, moduleTitle, companyName, companyEmail } = req.body;

    if (!userEmail || !userName || !moduleTitle) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await sendAdminRegeneratedRoadmapEmail({
      userEmail,
      userName,
      moduleTitle,
      companyName,
      companyEmail,
    });

    res.json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error("Error in admin regenerated roadmap email route:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

/**
 * POST /api/email/admin-granted-attempts
 * Send email when admin grants additional quiz attempts to a user
 */
router.post("/email/admin-granted-attempts", async (req, res) => {
  try {
    const { userEmail, userName, moduleTitle, attemptsGranted, companyName, companyEmail } = req.body;

    if (!userEmail || !userName || !moduleTitle || !attemptsGranted) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await sendAdminGrantedAttemptsEmail({
      userEmail,
      userName,
      moduleTitle,
      attemptsGranted,
      companyName,
      companyEmail,
    });

    res.json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error("Error in admin granted attempts email route:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

export default router;
