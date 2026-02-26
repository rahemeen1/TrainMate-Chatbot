// trainmate-backend/routes/notificationRoutes.js
import express from "express";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../controllers/notificationPreferencesController.js";

const router = express.Router();

// Get notification preferences
router.get("/notifications/preferences/:companyId/:deptId/:userId", getNotificationPreferences);

// Update notification preferences
router.put("/notifications/preferences/:companyId/:deptId/:userId", updateNotificationPreferences);

export default router;
