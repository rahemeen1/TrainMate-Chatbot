import admin from "firebase-admin";
import { db } from "../../config/firebase.js";
import { createFresherWelcomeEvent } from "../../services/calendarService.js";
import {
  analyzeUserEngagement,
  aiDecideNotificationStrategy,
  aiGeneratePersonalizedContent,
} from "../../services/aiAgenticNotificationService.js";

const DEFAULT_MAX_QUIZ_ATTEMPTS = 3;
const DEFAULT_QUIZ_UNLOCK_PERCENT = 70;

export const initializeFresherNotifications = async (req, res) => {
  try {
    const { companyId, deptId, userId } = req.body || {};

    if (!companyId || !deptId || !userId) {
      return res.status(400).json({ error: "companyId, deptId, and userId are required" });
    }

    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const [userSnap, companySnap] = await Promise.all([
      userRef.get(),
      db.collection("companies").doc(companyId).get(),
    ]);

    if (!userSnap.exists) {
      return res.status(404).json({ error: "Fresher not found" });
    }

    const userData = userSnap.data();
    const companyData = companySnap.exists ? companySnap.data() : {};

    const engagementData = await analyzeUserEngagement(companyId, deptId, userId);
    const aiDecision = await aiDecideNotificationStrategy({
      userName: userData?.name || "Fresher",
      companyName: companyData?.name || userData?.companyName || "TrainMate Company",
      trainingTopic: userData?.trainingOn || "General",
      engagementData,
      notificationType: "NEW_FRESHER_ONBOARDING",
      isNewUser: true,
      timezone: userData?.timeZone || process.env.DEFAULT_TIMEZONE || "Asia/Karachi",
      activeModule: null,
    });

    const personalizedContent = await aiGeneratePersonalizedContent({
      userName: userData?.name || "Fresher",
      companyName: companyData?.name || userData?.companyName || "TrainMate Company",
      engagementData,
      notificationType: "NEW_FRESHER_ONBOARDING",
      activeModule: null,
    });

    const preferredReminderTime =
      aiDecision?.optimalTime ||
      userData?.notificationPreferences?.preferredReminderTime ||
      "15:00";

    const notificationPreferences = {
      emailEnabled: aiDecision?.sendEmail ?? true,
      calendarEnabled: aiDecision?.createCalendarEvent ?? true,
      dailyRemindersEnabled: true,
      quizNotificationsEnabled: true,
      preferredReminderTime,
      ...(userData?.notificationPreferences || {}),
    };

    await userRef.set(
      {
        notificationPreferences,
        quizPolicy: {
          maxQuizAttempts: userData?.quizPolicy?.maxQuizAttempts || DEFAULT_MAX_QUIZ_ATTEMPTS,
          quizUnlockPercent: userData?.quizPolicy?.quizUnlockPercent || DEFAULT_QUIZ_UNLOCK_PERCENT,
        },
        notificationSetup: {
          initializedAt: admin.firestore.FieldValue.serverTimestamp(),
          initializedBy: "fresher-create-flow",
          agenticEnabled: true,
          agenticDecision: {
            shouldSend: aiDecision?.shouldSend ?? true,
            reason: aiDecision?.reason || "AI strategy applied",
            urgencyLevel: aiDecision?.urgencyLevel || "medium",
            estimatedEngagementScore: aiDecision?.estimatedEngagementScore ?? 50,
            recommendedMessageTone: aiDecision?.recommendedMessageTone || "supportive",
          },
        },
      },
      { merge: true }
    );

    let calendarCreated = false;
    let calendarError = null;

    try {
      if ((aiDecision?.shouldSend ?? true) && notificationPreferences.calendarEnabled) {
        await createFresherWelcomeEvent({
          companyId,
          deptId,
          userId,
          userName: userData?.name || "Fresher",
          attendeeEmail: userData?.email || null,
          companyName: companyData?.name || userData?.companyName || "TrainMate Company",
          deptName: userData?.deptName || deptId,
          trainingTopic: userData?.trainingOn || "General",
          maxQuizAttempts: userData?.quizPolicy?.maxQuizAttempts || DEFAULT_MAX_QUIZ_ATTEMPTS,
          quizUnlockPercent: userData?.quizPolicy?.quizUnlockPercent || DEFAULT_QUIZ_UNLOCK_PERCENT,
          reminderTime: notificationPreferences.preferredReminderTime,
          timeZone: userData?.timeZone || process.env.DEFAULT_TIMEZONE || "Asia/Karachi",
          createdAt: new Date(),
          messageTone: aiDecision?.recommendedMessageTone || "supportive",
          agenticMessage:
            personalizedContent?.motivationalMessage ||
            aiDecision?.personalizationTip ||
            "Stay consistent and attempt quizzes on time.",
        });
        calendarCreated = true;
      }
    } catch (err) {
      calendarError = err.message;
      await userRef.set(
        {
          notificationSetup: {
            initializedAt: admin.firestore.FieldValue.serverTimestamp(),
            initializedBy: "fresher-create-flow",
            calendarStatus: "failed",
            calendarError: err.message,
          },
        },
        { merge: true }
      );
    }

    return res.json({
      success: true,
      calendarCreated,
      aiDecision: {
        shouldSend: aiDecision?.shouldSend ?? true,
        reason: aiDecision?.reason || "AI strategy applied",
        optimalTime: notificationPreferences.preferredReminderTime,
      },
      message: calendarCreated
        ? "Agentic fresher notifications and Google Calendar setup completed"
        : "Fresher created. Agentic notification preferences saved, calendar event skipped/failed",
      calendarError,
    });
  } catch (err) {
    console.error("initializeFresherNotifications error:", err);
    return res.status(500).json({
      error: "Failed to initialize fresher notifications",
      details: err.message,
    });
  }
};
