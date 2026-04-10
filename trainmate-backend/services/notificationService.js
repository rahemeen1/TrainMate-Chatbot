// trainmate-backend/services/notificationService.js
/**
 * Simplified Notification Service
 * - ONE recurring calendar event per user (created when roadmap is generated)
 * - Daily reminders pulled from that ONE event
 * - Quiz unlock = EMAIL ONLY (no extra calendar events)
 */

import { google } from "googleapis";
import { db } from "../config/firebase.js";
import { sendRoadmapEmail, sendQuizUnlockEmail, sendDailyModuleReminderEmail } from "./emailService.js";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
const DEFAULT_REMINDER_TIME = process.env.DAILY_REMINDER_TIME || "15:00";

function isInvalidGrantError(error) {
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.code || error?.status || 0);
  return message.includes("invalid_grant") || status === 401;
}

function buildOAuthClient({ clientId, clientSecret, refreshToken, accessToken }) {
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({
    refresh_token: refreshToken,
    ...(accessToken ? { access_token: accessToken } : {}),
  });
  return oAuth2Client;
}

async function validateOAuthClient(oAuth2Client, label) {
  try {
    await oAuth2Client.getAccessToken();
    return true;
  } catch (error) {
    console.warn(`⚠️ Google OAuth validation failed for ${label}: ${error.message}`);
    throw error;
  }
}

/**
 * Get user-specific OAuth client
 * @param {string} companyId
 * @param {string} deptId
 * @param {string} userId
 * @returns {Promise<Object>} { client, isUsingFallback }
 */
async function getUserOAuthClient(companyId, deptId, userId) {
  try {
    const userDoc = await db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      throw new Error(`User ${userId} not found`);
    }

    const userData = userDoc.data();
    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);
    const googleOAuth = userData.googleOAuth;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Missing Google OAuth credentials");
    }

    // Use user's own OAuth tokens if available
    if (googleOAuth && googleOAuth.refreshToken) {
      try {
        const userOAuthClient = buildOAuthClient({
          clientId,
          clientSecret,
          refreshToken: googleOAuth.refreshToken,
          accessToken: googleOAuth.accessToken,
        });
        await validateOAuthClient(userOAuthClient, `user ${userId}`);
        console.log(`✅ Using user's OAuth client for ${userId} (${userData.email})`);
        return { client: userOAuthClient, isUsingFallback: false, authSource: "user" };
      } catch (userTokenErr) {
        if (isInvalidGrantError(userTokenErr)) {
          await userRef.set(
            {
              googleOAuth: {
                ...googleOAuth,
                isConnected: false,
                lastAuthError: "invalid_grant",
                lastAuthErrorAt: new Date(),
              },
            },
            { merge: true }
          );
          console.warn(`⚠️ User Google token invalid for ${userId}. Falling back to admin token.`);
        } else {
          throw userTokenErr;
        }
      }
    }

    // Fallback order:
    // 1) Environment token (known-good server fallback)
    // 2) Company admin token from Firestore
    const envRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (envRefreshToken) {
      try {
        const envOAuthClient = buildOAuthClient({
          clientId,
          clientSecret,
          refreshToken: envRefreshToken,
        });
        await validateOAuthClient(envOAuthClient, "environment fallback");
        console.warn(`⚠️ Using environment fallback OAuth client for ${userId}`);
        return { client: envOAuthClient, isUsingFallback: true, authSource: "env" };
      } catch (envTokenErr) {
        if (!isInvalidGrantError(envTokenErr)) {
          throw envTokenErr;
        }
        console.warn("⚠️ Environment fallback token is invalid. Trying company admin token...");
      }
    }

    // Fallback: Use company admin's tokens
    console.log(`⚠️ Using company admin's OAuth client for ${userId}`);
    const companyDoc = await db.collection("companies").doc(companyId).get();

    if (!companyDoc.exists) {
      throw new Error(`Company ${companyId} not found`);
    }

    const companyData = companyDoc.data();
    const companyGoogleOAuth = companyData.googleOAuth;
    const companyRef = db.collection("companies").doc(companyId);

    if (!companyGoogleOAuth || !companyGoogleOAuth.refreshToken) {
      throw new Error("Company admin has not authorized Google Calendar");
    }

    try {
      const companyOAuthClient = buildOAuthClient({
        clientId,
        clientSecret,
        refreshToken: companyGoogleOAuth.refreshToken,
        accessToken: companyGoogleOAuth.accessToken,
      });
      await validateOAuthClient(companyOAuthClient, `company ${companyId}`);
      return { client: companyOAuthClient, isUsingFallback: true, authSource: "company" };
    } catch (companyTokenErr) {
      if (isInvalidGrantError(companyTokenErr)) {
        await companyRef.set(
          {
            googleOAuth: {
              ...companyGoogleOAuth,
              isConnected: false,
              lastAuthError: "invalid_grant",
              lastAuthErrorAt: new Date(),
            },
          },
          { merge: true }
        );
        throw new Error("Google Calendar authorization expired. Reconnect company admin Google Calendar.");
      }

      throw companyTokenErr;
    }
  } catch (error) {
    console.error(`❌ Failed to get OAuth client:`, error.message);
    throw error;
  }
}

/**
 * Parse time string (e.g., "15:00" or "3:00 PM") to hours and minutes
 */
function parseTimeTo24h(timeStr) {
  if (!timeStr || typeof timeStr !== "string") {
    return { hours: 15, minutes: 0 };
  }

  const normalized = timeStr.trim().toLowerCase();

  // Try AM/PM format
  const ampmMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2] || "0", 10);
    const meridiem = ampmMatch[3];
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  // Try 24-hour format
  const twentyFourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourMatch) {
    return {
      hours: parseInt(twentyFourMatch[1], 10),
      minutes: parseInt(twentyFourMatch[2], 10),
    };
  }

  return { hours: 15, minutes: 0 };
}

/**
 * Build DateTime with timezone
 */
function buildDateTime(date, timeStr) {
  const { hours, minutes } = parseTimeTo24h(timeStr || DEFAULT_REMINDER_TIME);
  const dt = new Date(date);
  dt.setHours(hours, minutes, 0, 0);
  return dt;
}

/**
 * Get reminder overrides for calendar events
 */
function getReminderOverrides() {
  return [
    { method: "email", minutes: 60 },   // Email 60 min before
    { method: "popup", minutes: 10 },   // Popup 10 min before
  ];
}

/**
 * 🎯 MAIN FUNCTION: Create ONE recurring daily event when roadmap is generated
 * This is the ONLY calendar event created - it recurs for all modules
 * @param {Object} params
 */
export async function createRoadmapDailyReminderEvent({
  companyId,
  deptId,
  userId,
  userEmail,
  userName,
  companyName,
  activeModuleTitle,
  startDate = new Date(),
  totalModules,
  estimatedDays,
  timeZone = DEFAULT_TIMEZONE,
}) {
  try {
    console.log(`📅 Creating SINGLE recurring daily reminder event for ${userEmail}`);

    const { client: userAuth, isUsingFallback, authSource } = await getUserOAuthClient(companyId, deptId, userId);
    const calendar = google.calendar({ version: "v3", auth: userAuth });

    const startDateTime = buildDateTime(startDate, DEFAULT_REMINDER_TIME);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hour duration

    // Create ONE event that recurs daily
    const event = {
      summary: `🎓 Daily Learning: ${activeModuleTitle}`,
      description: `Hi ${userName}!\n\nYour active training module:\n📚 ${activeModuleTitle}\n🏢 ${companyName}\n\nLog in to TrainMate to continue learning!\n\n`,
      start: { dateTime: startDateTime.toISOString(), timeZone },
      end: { dateTime: endDateTime.toISOString(), timeZone },
      // SINGLE recurrence rule - no count limit, continues indefinitely
      recurrence: [
        `RRULE:FREQ=DAILY`,
      ],
      reminders: { useDefault: false, overrides: getReminderOverrides() },
      colorId: "9", // Light blue
    };

    // Add attendee if user email is available (triggers Google to send invitation)
    if (userEmail || isUsingFallback) {
      event.attendees = [{ email: userEmail || null }].filter(a => a.email);
    }

    const insertOptions = {
      calendarId: "primary",
      requestBody: event,
      // IMPORTANT: sendUpdates="all" makes Google send invitation email
      sendUpdates: isUsingFallback ? "all" : "none",
    };

    const response = await calendar.events.insert(insertOptions);

    // Save the calendar event ID to user document so we can update it later
    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    await userRef.update({
      "notificationPreferences.dailyReminderEventId": response.data.id,
      "notificationPreferences.dailyReminderEventCreatedAt": new Date(),
    });

    console.log(`✅ Daily reminder event created: ${response.data.id}`);
    console.log(`   User: ${userEmail}`);
    console.log(`   Module: ${activeModuleTitle}`);
    console.log(`   Auth source: ${authSource}`);
    console.log(`   Time: ${DEFAULT_REMINDER_TIME} daily`);

    return response.data.id;
  } catch (error) {
    console.error(`❌ Failed to create daily reminder event:`, error.message);
    throw error;
  }
}

/**
 * 📝 Update the description of the recurring event when active module changes
 * This allows the same calendar event to show different modules over time
 * @param {Object} params
 */
export async function updateReminderEventForNewModule({
  companyId,
  deptId,
  userId,
  userEmail,
  userName,
  companyName,
  newActiveModuleTitle,
}) {
  try {
    console.log(`📝 Updating reminder event description for new module: ${newActiveModuleTitle}`);

    const userRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const userDoc = await userRef.get();
    const eventId = userDoc.data()?.notificationPreferences?.dailyReminderEventId;

    if (!eventId) {
      console.warn(`⚠️ No daily reminder event found for user ${userId}. Creating new one...`);
      await createRoadmapDailyReminderEvent({
        companyId,
        deptId,
        userId,
        userEmail,
        userName,
        companyName,
        activeModuleTitle: newActiveModuleTitle,
      });
      return;
    }

    const { client: userAuth } = await getUserOAuthClient(companyId, deptId, userId);
    const calendar = google.calendar({ version: "v3", auth: userAuth });

    // Get current event
    const event = await calendar.events.get({
      calendarId: "primary",
      eventId: eventId,
    });

    // Update only the description and summary
    const updatedEvent = {
      ...event.data,
      summary: `🎓 Daily Learning: ${newActiveModuleTitle}`,
      description: `Hi ${userName}!\n\nYour active training module:\n📚 ${newActiveModuleTitle}\n🏢 ${companyName}\n\nLog in to TrainMate to continue learning!\n\n`,
    };

    await calendar.events.update({
      calendarId: "primary",
      eventId: eventId,
      requestBody: updatedEvent,
      sendUpdates: "none", // Don't send update email
    });

    console.log(`✅ Reminder event updated for new module: ${newActiveModuleTitle}`);
  } catch (error) {
    console.error(`❌ Failed to update reminder event:`, error.message);
    // Non-critical failure - don't throw
  }
}

/**
 * 📧 Send QUIZ UNLOCK email notification ONLY (no calendar event)
 * @param {Object} params
 */
export async function sendQuizUnlockNotification({
  userEmail,
  userName,
  moduleTitle,
  companyName,
  maxQuizAttempts = 3,
}) {
  try {
    console.log(`🔓 Sending quiz unlock email to ${userEmail} for ${moduleTitle}`);

    await sendQuizUnlockEmail({
      userEmail,
      userName,
      moduleTitle,
      companyName,
      quizDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    });

    console.log(`✅ Quiz unlock email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send quiz unlock email:`, error.message);
    throw error;
  }
}

/**
 * 📧 Send daily module reminder email (as backup to calendar)
 * @param {Object} params
 */
export async function sendDailyReminderEmail({
  userEmail,
  userName,
  moduleTitle,
  companyName,
  dayNumber,
}) {
  try {
    console.log(`📧 Sending daily reminder email to ${userEmail}`);

    await sendDailyModuleReminderEmail({
      userEmail,
      userName,
      moduleTitle,
      companyName,
      dayNumber,
    });

    console.log(`✅ Daily reminder email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send daily reminder email:`, error.message);
    // Non-critical - continue without throwing
    return false;
  }
}

/**
 * 🎯 ROADMAP GENERATION NOTIFICATION (called from roadmap.controller.js)
 * - Send roadmap email with PDF
 * - Create ONE recurring daily reminder event
 * @param {Object} params
 */
export async function handleRoadmapGenerated({
  companyId,
  deptId,
  userId,
  userEmail,
  userName,
  companyName,
  trainingTopic,
  modules,
  pdfBuffer,
}) {
  try {
    const result = {
      emailSent: false,
      calendarEventCreated: false,
      calendarEventId: null,
      calendarError: null,
    };

    console.log(`\n🚀 Handling roadmap generation for ${userEmail}`);

    if (!userEmail) {
      console.warn(`⚠️ No user email provided, skipping notifications`);
      return result;
    }

    // 1️⃣ Send roadmap email with PDF
    try {
      await sendRoadmapEmail({
        userEmail,
        userName,
        companyName,
        trainingTopic,
        moduleCount: modules.length,
        pdfBuffer,
      });
      console.log(`✅ Roadmap email sent`);
      result.emailSent = true;
    } catch (emailErr) {
      console.error(`❌ Roadmap email failed:`, emailErr.message);
    }

    // 2️⃣ Create ONE recurring daily reminder event
    try {
      const activeModule = modules[0];
      const calendarEventId = await createRoadmapDailyReminderEvent({
        companyId,
        deptId,
        userId,
        userEmail,
        userName,
        companyName,
        activeModuleTitle: activeModule.moduleTitle,
        startDate: new Date(),
        totalModules: modules.length,
        estimatedDays: activeModule.estimatedDays || 30,
        timeZone: process.env.DEFAULT_TIMEZONE || "Asia/Karachi",
      });
      console.log(`✅ Daily reminder event created`);
      result.calendarEventCreated = true;
      result.calendarEventId = calendarEventId;
    } catch (calendarErr) {
      console.error(`❌ Calendar event failed:`, calendarErr.message);
      result.calendarError = calendarErr.message;
    }

    console.log(`\n✅ Roadmap generation notification complete for ${userEmail}`);
    return result;
  } catch (error) {
    console.error(`❌ Roadmap notification handler failed:`, error.message);
    throw error;
  }
}

/**
 * 🔓 QUIZ UNLOCK NOTIFICATION (called from scheduledJobs.js)
 * - Send ONLY email notification (no calendar event)
 * - Reuses existing daily reminder event
 * @param {Object} params
 */
export async function handleQuizUnlock({
  companyId,
  deptId,
  userId,
  userEmail,
  userName,
  moduleTitle,
  companyName,
}) {
  try {
    console.log(`\n🔓 Handling quiz unlock for ${userEmail} - ${moduleTitle}`);

    if (!userEmail) {
      console.warn(`⚠️ No user email, skipping quiz unlock notification`);
      return;
    }

    // Only send email - reuse existing calendar event
    await sendQuizUnlockNotification({
      userEmail,
      userName,
      moduleTitle,
      companyName,
    });

    console.log(`\n✅ Quiz unlock notification sent to ${userEmail}`);
  } catch (error) {
    console.error(`❌ Quiz unlock notification failed:`, error.message);
    throw error;
  }
}

/**
 * 🔄 ACTIVE MODULE CHANGE (called when user moves to next module)
 * - Update the recurring event description to show new module
 * - Send optional email notification
 * @param {Object} params
 */
export async function handleActiveModuleChange({
  companyId,
  deptId,
  userId,
  userEmail,
  userName,
  newActiveModuleTitle,
  companyName,
  sendNotification = true,
}) {
  try {
    console.log(`\n🔄 Handling module change for ${userEmail} to ${newActiveModuleTitle}`);

    if (!userEmail) {
      console.warn(`⚠️ No user email, skipping module change notification`);
      return;
    }

    // Update the existing recurring event
    await updateReminderEventForNewModule({
      companyId,
      deptId,
      userId,
      userEmail,
      userName,
      companyName,
      newActiveModuleTitle,
    });

    // Optionally send email notification
    if (sendNotification) {
      try {
        await sendDailyReminderEmail({
          userEmail,
          userName,
          moduleTitle: newActiveModuleTitle,
          companyName,
          dayNumber: 1,
        });
      } catch (emailErr) {
        console.error(`⚠️ Module change email failed (non-critical):`, emailErr.message);
      }
    }

    console.log(`\n✅ Module change handled for ${userEmail}`);
  } catch (error) {
    console.error(`❌ Module change handler failed:`, error.message);
    throw error;
  }
}
