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
 * @param {string} companyId 
 * @param {string} deptId 
 * @param {string} userId 
 * @returns {Promise<OAuth2Client>}
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

    if (!googleOAuth || !googleOAuth.refreshToken) {
      throw new Error(`User ${userId} has not connected their Google Calendar`);
    }

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
    return oAuth2Client;
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
  const userAuth = await getUserOAuthClient(companyId, deptId, userId);
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

  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: "none", // Don't send email, it's their own calendar
  });

  console.log("✅ Daily reminder added to user's calendar", {
    userId,
    userEmail: attendeeEmail,
    moduleTitle,
    occurrenceCount,
  });
}

export async function createQuizUnlockReminder({
  companyId,
  deptId,
  userId,
  moduleTitle,
  companyName,
  unlockDate,
  reminderTime,
  timeZone = DEFAULT_TIMEZONE,
  attendeeEmail,
}) {
  // Get user-specific OAuth client
  const userAuth = await getUserOAuthClient(companyId, deptId, userId);
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
    description: `🎉 Great news! Your quiz has been unlocked.\n\n📝 Module: ${moduleTitle}\n🏢 Company: ${companyName}\n\n⏰ Action Required: Attempt your quiz within the given timeframe to progress to the next module.\n\n🔗 Log in to TrainMate now to take your quiz!\n\n---\nTrainMate - Your AI-Powered Corporate Training Platform`,
    start: { dateTime: startDateTime.toISOString(), timeZone },
    end: { dateTime: endDateTime.toISOString(), timeZone },
    reminders: { useDefault: false, overrides: getReminderOverrides() },
    colorId: "11",
  };

  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: "none", // Don't send email, it's their own calendar
  });

  console.log("✅ Quiz unlock added to user's calendar", {
    userId,
    userEmail: attendeeEmail,
    moduleTitle,
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
  const userAuth = await getUserOAuthClient(companyId, deptId, userId);
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

  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: "none", // Don't send email, it's their own calendar
  });

  console.log("✅ Roadmap event added to user's calendar", {
    userId,
    userEmail: attendeeEmail,
    trainingTopic,
  });
}
