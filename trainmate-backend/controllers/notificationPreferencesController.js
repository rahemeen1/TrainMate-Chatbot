// trainmate-backend/controllers/notificationPreferencesController.js
import { db } from "../config/firebase.js";

/**
 * Get user notification preferences
 */
export async function getNotificationPreferences(req, res) {
  try {
    const { companyId, deptId, userId } = req.params;

    const userDoc = await db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    const preferences = userData.notificationPreferences || {
      emailEnabled: true,
      calendarEnabled: true,
      dailyRemindersEnabled: true,
      quizNotificationsEnabled: true,
      preferredReminderTime: "15:00",
    };

    return res.json({
      success: true,
      preferences,
    });
  } catch (error) {
    console.error("Error getting notification preferences:", error);
    return res.status(500).json({ error: "Failed to get preferences" });
  }
}

/**
 * Update user notification preferences
 */
export async function updateNotificationPreferences(req, res) {
  try {
    const { companyId, deptId, userId } = req.params;
    const {
      emailEnabled,
      calendarEnabled,
      dailyRemindersEnabled,
      quizNotificationsEnabled,
      preferredReminderTime,
    } = req.body;

    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const updates = {
      "notificationPreferences.emailEnabled": emailEnabled,
      "notificationPreferences.calendarEnabled": calendarEnabled,
      "notificationPreferences.dailyRemindersEnabled": dailyRemindersEnabled,
      "notificationPreferences.quizNotificationsEnabled": quizNotificationsEnabled,
    };

    if (preferredReminderTime) {
      updates["notificationPreferences.preferredReminderTime"] = preferredReminderTime;
    }

    await userRef.update(updates);

    console.log(`✅ Updated notification preferences for user ${userId}`);

    return res.json({
      success: true,
      message: "Preferences updated successfully",
    });
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return res.status(500).json({ error: "Failed to update preferences" });
  }
}
