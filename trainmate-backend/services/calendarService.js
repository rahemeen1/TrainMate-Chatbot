// trainmate-backend/services/calendarService.js
import { google } from "googleapis";
import { db } from "../config/firebase.js";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
const DEFAULT_REMINDER_TIME = process.env.DAILY_REMINDER_TIME || "22:30";
const DEFAULT_CALENDAR_ID = "primary"; // Always use user's primary calendar

/**
 * Get user-specific OAuth client using their stored tokens
 * Falls back to company admin's OAuth tokens if user hasn't authorized
 * @param {string} companyId 
 * @param {string} deptId 
 * @param {string} userId 
 * @returns {Promise<{client: OAuth2Client, isUsingFallback: boolean}>}
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
    const googleOAuth = userData.googleOAuth;

    // If user has their own OAuth tokens, use them
    if (googleOAuth && googleOAuth.refreshToken) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error("Missing Google OAuth credentials in environment");
      }

      const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
      
      // Set the user's refresh token
      oAuth2Client.setCredentials({
        refresh_token: googleOAuth.refreshToken,
        access_token: googleOAuth.accessToken,
      });

      console.log(`✅ Retrieved OAuth client for user ${userId} (${userData.email})`);
      return { client: oAuth2Client, isUsingFallback: false };
    }

    // Fallback: Use company admin's OAuth tokens
    console.log(`⚠️ User ${userId} hasn't authorized Google Calendar, using company admin's tokens...`);
    const companyDoc = await db.collection("companies").doc(companyId).get();
    
    if (!companyDoc.exists) {
      throw new Error(`Company ${companyId} not found`);
    }

    const companyData = companyDoc.data();
    const companyGoogleOAuth = companyData.googleOAuth;

    if (!companyGoogleOAuth || !companyGoogleOAuth.refreshToken) {
      throw new Error(
        `Company admin has not authorized Google Calendar. User ${userId} must either authorize themselves or company admin must authorize.`
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Missing Google OAuth credentials in environment");
    }

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
    
    // Set the company admin's refresh token (fallback)
    oAuth2Client.setCredentials({
      refresh_token: companyGoogleOAuth.refreshToken,
      access_token: companyGoogleOAuth.accessToken,
    });

    console.log(`✅ Using company admin's OAuth client for user ${userId} (${userData.email})`);
    return { client: oAuth2Client, isUsingFallback: true };
  } catch (error) {
    console.error(`❌ Failed to get OAuth client for user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Get OAuth client from environment (fallback/admin calendar)
 * @returns {OAuth2Client}
 */
function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google Calendar OAuth environment variables");
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

function getCalendarClient(auth) {
  return google.calendar({ version: "v3", auth });
}

function parseTimeTo24h(timeStr) {
  if (!timeStr || typeof timeStr !== "string") {
    return { hours: 15, minutes: 0 };
  }

  const normalized = timeStr.trim().toLowerCase();
  const ampmMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2] || "0", 10);
    const meridiem = ampmMatch[3];
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  const twentyFourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourMatch) {
    return {
      hours: parseInt(twentyFourMatch[1], 10),
      minutes: parseInt(twentyFourMatch[2], 10),
    };
  }

  return { hours: 15, minutes: 0 };
}

function buildDateTime(date, timeStr) {
  const { hours, minutes } = parseTimeTo24h(timeStr || DEFAULT_REMINDER_TIME);
  const dt = new Date(date);
  dt.setHours(hours, minutes, 0, 0);
  return dt;
}

function getReminderOverrides() {
  return [
    { method: "email", minutes: 60 },
    { method: "popup", minutes: 10 },
  ];
}

export async function createDailyModuleReminder({
  companyId,
  deptId,
  userId,
  moduleTitle,
  companyName,
  startDate,
  occurrenceCount,
  reminderTime,
  timeZone = DEFAULT_TIMEZONE,
  attendeeEmail,
}) {
  // Get user-specific OAuth client
  const { client: userAuth, isUsingFallback } = await getUserOAuthClient(companyId, deptId, userId);
  const calendar = getCalendarClient(userAuth);
  const calendarId = "primary"; // User's primary calendar
  
  const startDateTime = buildDateTime(startDate, reminderTime);
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

  console.log("📅 Creating daily reminder in user's calendar", {
    userId,
    userEmail: attendeeEmail,
    moduleTitle,
    companyName,
    start: startDateTime.toISOString(),
    timeZone,
    occurrenceCount,
    usingFallback: isUsingFallback,
  });

  const event = {
    summary: `🎓 Your Active Module: ${moduleTitle}`,
    description: `Hi there! 👋\n\nThis is your daily reminder to continue learning.\n\n📚 Active Module: ${moduleTitle}\n🏢 Company: ${companyName}\n\nKeep up the great work! Log in to TrainMate to continue your training journey.\n\n---\nTrainMate - Your AI-Powered Corporate Training Platform`,
    start: { dateTime: startDateTime.toISOString(), timeZone },
    end: { dateTime: endDateTime.toISOString(), timeZone },
    recurrence: [`RRULE:FREQ=DAILY;COUNT=${Math.max(1, occurrenceCount)}`],
    reminders: { useDefault: false, overrides: getReminderOverrides() },
    colorId: "9",
  };

  if (attendeeEmail || isUsingFallback) {
    event.attendees = [{ email: attendeeEmail || null }].filter(a => a.email);
  }

  const insertOptions = {
    calendarId,
    requestBody: event,
    // ALWAYS send updates when using fallback - triggers Google to send invitation email
    sendUpdates: isUsingFallback ? "all" : "none",
  };

  await calendar.events.insert(insertOptions);

  console.log("✅ Daily reminder added to calendar", {
    userId,
    userEmail: attendeeEmail,
    moduleTitle,
    sendUpdates: insertOptions.sendUpdates,
    attendeesCount: event.attendees?.length || 0,
  });
}

export async function createQuizUnlockReminder({
  companyId,
  deptId,
  userId,
  moduleTitle,
  companyName,
  unlockDate,
  maxQuizAttempts = 3,
  reminderTime,
  timeZone = DEFAULT_TIMEZONE,
  attendeeEmail,
}) {
  // Get user-specific OAuth client
  const { client: userAuth, isUsingFallback } = await getUserOAuthClient(companyId, deptId, userId);
  const calendar = getCalendarClient(userAuth);
  const calendarId = "primary"; // User's primary calendar
  
  const startDateTime = buildDateTime(unlockDate, reminderTime);
  const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000);

  console.log("📅 Creating quiz unlock in user's calendar", {
    userId,
    userEmail: attendeeEmail,
    moduleTitle,
    companyName,
    unlockDate: startDateTime.toISOString(),
    timeZone,
  });

  const event = {
    summary: `✅ Quiz Unlocked: ${moduleTitle}`,
    description: `🎉 Great news! Your quiz has been unlocked.\n\n📝 Module: ${moduleTitle}\n🏢 Company: ${companyName}\n\n📌 Quiz Attempts Policy:\n- Maximum attempts: ${maxQuizAttempts}\n\n⏰ Action Required: Attempt your quiz within the given timeframe to progress to the next module.\n\n🔗 Log in to TrainMate now to take your quiz!\n\n---\nTrainMate - Your AI-Powered Corporate Training Platform`,
    start: { dateTime: startDateTime.toISOString(), timeZone },
    end: { dateTime: endDateTime.toISOString(), timeZone },
    reminders: { useDefault: false, overrides: getReminderOverrides() },
    colorId: "11",
  };

  if (attendeeEmail || isUsingFallback) {
    event.attendees = [{ email: attendeeEmail || null }].filter(a => a.email);
  }

  const insertOptions = {
    calendarId,
    requestBody: event,
    // ALWAYS send updates when using fallback - triggers Google to send invitation email
    sendUpdates: isUsingFallback ? "all" : "none",
  };

  await calendar.events.insert(insertOptions);

  console.log("✅ Quiz unlock added to user's calendar", {
    userId,
    userEmail: attendeeEmail,
    moduleTitle,
    sendUpdates: insertOptions.sendUpdates,
    attendeesCount: event.attendees?.length || 0,
  });
}

export async function createRoadmapGeneratedEvent({
  companyId,
  deptId,
  userId,
  userName,
  companyName,
  trainingTopic,
  generatedAt,
  reminderTime,
  timeZone = DEFAULT_TIMEZONE,
  attendeeEmail,
}) {
  // Get user-specific OAuth client
  const { client: userAuth, isUsingFallback } = await getUserOAuthClient(companyId, deptId, userId);
  const calendar = getCalendarClient(userAuth);
  const calendarId = "primary"; // User's primary calendar
  
  const startDateTime = buildDateTime(generatedAt || new Date(), reminderTime);
  const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000);

  console.log("📅 Creating roadmap event in user's calendar", {
    userId,
    userEmail: attendeeEmail,
    userName,
    companyName,
    trainingTopic,
    start: startDateTime.toISOString(),
    timeZone,
  });

  const event = {
    summary: `🚀 Your Training Roadmap is Ready!`,
    description: `Congratulations ${userName}! 🎉\n\nYour personalized training roadmap has been successfully generated.\n\n📋 Training Focus: ${trainingTopic}\n🏢 Company: ${companyName}\n\n✨ Your custom learning path is now available. Check your email for the detailed roadmap PDF and log in to TrainMate to begin your journey!\n\n---\nTrainMate - Your AI-Powered Corporate Training Platform\nSupport: trainmate01@gmail.com`,
    start: { dateTime: startDateTime.toISOString(), timeZone },
    end: { dateTime: endDateTime.toISOString(), timeZone },
    reminders: { useDefault: false, overrides: getReminderOverrides() },
    colorId: "10",
  };

  if (attendeeEmail || isUsingFallback) {
    event.attendees = [{ email: attendeeEmail || null }].filter(a => a.email);
  }

  const insertOptions = {
    calendarId,
    requestBody: event,
    // ALWAYS send updates when using fallback - triggers Google to send invitation email
    sendUpdates: isUsingFallback ? "all" : "none",
  };

  await calendar.events.insert(insertOptions);

  console.log("✅ Roadmap event added to user's calendar", {
    userId,
    userEmail: attendeeEmail,
    trainingTopic,
    usingFallback: isUsingFallback,
    sendUpdates: insertOptions.sendUpdates,
    attendeesCount: event.attendees?.length || 0,
  });
}

export async function createFresherWelcomeEvent({
  companyId,
  deptId,
  userId,
  userName,
  companyName,
  deptName,
  trainingTopic,
  maxQuizAttempts = 3,
  quizUnlockPercent = 70,
  agenticMessage,
  messageTone,
  createdAt,
  reminderTime,
  timeZone = DEFAULT_TIMEZONE,
  attendeeEmail,
}) {
  const { client: userAuth, isUsingFallback } = await getUserOAuthClient(companyId, deptId, userId);
  const calendar = getCalendarClient(userAuth);
  
  // When using fallback (admin tokens), we MUST add user as attendee to send invitation
  // When using user's own tokens, add as attendee if provided
  let calendarId = "primary";
  
  const startDateTime = buildDateTime(createdAt || new Date(), reminderTime);
  const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000);

  const event = {
    summary: `👋 Welcome to TrainMate, ${userName || "Fresher"}`,
    description: `Welcome to your training journey!\n\n🏢 Company: ${companyName}\n🏬 Department: ${deptName || "N/A"}\n📚 Training Focus: ${trainingTopic || "General"}\n\n📝 Quiz Policy:\n- Total attempts per module quiz: ${maxQuizAttempts}\n- Quiz unlocks after ${quizUnlockPercent}% module completion time\n\n${agenticMessage ? `🤖 AI Note (${messageTone || "supportive"}): ${agenticMessage}\n\n` : ""}🔔 Keep Google Calendar notifications ON to avoid missing module reminders and quiz unlock alerts.\n\n---\nTrainMate - AI-Powered Corporate Training Platform`,
    start: { dateTime: startDateTime.toISOString(), timeZone },
    end: { dateTime: endDateTime.toISOString(), timeZone },
    reminders: { useDefault: false, overrides: getReminderOverrides() },
    colorId: "2",
  };

  // Always add attendee email when using fallback tokens to trigger invitation
  // This ensures Google sends an invitation email to the user
  if (attendeeEmail || isUsingFallback) {
    event.attendees = [{ email: attendeeEmail || null }].filter(a => a.email);
  }

  const insertOptions = {
    calendarId,
    requestBody: event,
    // ALWAYS send updates when using fallback - triggers Google to send invitation email
    sendUpdates: isUsingFallback ? "all" : "none",
  };

  await calendar.events.insert(insertOptions);

  console.log("✅ Fresher welcome event added to user's calendar", {
    userId,
    userEmail: attendeeEmail,
    companyName,
    deptName,
    usingFallback: isUsingFallback,
    sendUpdates: insertOptions.sendUpdates,
    attendeesCount: event.attendees?.length || 0,
  });
}
