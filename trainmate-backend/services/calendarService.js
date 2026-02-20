// trainmate-backend/services/calendarService.js
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
const DEFAULT_REMINDER_TIME = process.env.DAILY_REMINDER_TIME || "22:30";
const DEFAULT_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";

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

function getCalendarClient() {
  const auth = getOAuthClient();
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
  calendarId = DEFAULT_CALENDAR_ID,
  moduleTitle,
  companyName,
  startDate,
  occurrenceCount,
  reminderTime,
  timeZone = DEFAULT_TIMEZONE,
  attendeeEmail,
}) {
  const calendar = getCalendarClient();
  const startDateTime = buildDateTime(startDate, reminderTime);
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

  console.log("📅 Creating daily reminder event", {
    calendarId,
    moduleTitle,
    companyName,
    start: startDateTime.toISOString(),
    timeZone,
    occurrenceCount,
    attendeeEmail: attendeeEmail || "none",
  });

  const event = {
    summary: `TrainMate: ${moduleTitle} Daily Learning`,
    description: `Daily learning reminder for ${moduleTitle} at ${companyName}.`,
    start: { dateTime: startDateTime.toISOString(), timeZone },
    end: { dateTime: endDateTime.toISOString(), timeZone },
    recurrence: [`RRULE:FREQ=DAILY;COUNT=${Math.max(1, occurrenceCount)}`],
    reminders: { useDefault: false, overrides: getReminderOverrides() },
  };

  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: attendeeEmail ? "all" : "none",
  });

  console.log("✅ Daily reminder event created", {
    moduleTitle,
    occurrenceCount,
    reminderTime: reminderTime || DEFAULT_REMINDER_TIME,
  });
}

export async function createQuizUnlockReminder({
  calendarId = DEFAULT_CALENDAR_ID,
  moduleTitle,
  companyName,
  unlockDate,
  reminderTime,
  timeZone = DEFAULT_TIMEZONE,
  attendeeEmail,
}) {
  const calendar = getCalendarClient();
  const startDateTime = buildDateTime(unlockDate, reminderTime);
  const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000);

  console.log("📅 Creating quiz unlock event", {
    calendarId,
    moduleTitle,
    companyName,
    unlockDate: startDateTime.toISOString(),
    timeZone,
    attendeeEmail: attendeeEmail || "none",
  });

  const event = {
    summary: `TrainMate: Quiz Unlocked - ${moduleTitle}`,
    description: `Your quiz is now available for ${moduleTitle} at ${companyName}.`,
    start: { dateTime: startDateTime.toISOString(), timeZone },
    end: { dateTime: endDateTime.toISOString(), timeZone },
    reminders: { useDefault: false, overrides: getReminderOverrides() },
  };

  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: attendeeEmail ? "all" : "none",
  });

  console.log("✅ Quiz unlock event created", {
    moduleTitle,
    reminderTime: reminderTime || DEFAULT_REMINDER_TIME,
  });
}

export async function createRoadmapGeneratedEvent({
  calendarId = DEFAULT_CALENDAR_ID,
  userName,
  companyName,
  trainingTopic,
  generatedAt,
  reminderTime,
  timeZone = DEFAULT_TIMEZONE,
  attendeeEmail,
}) {
  const calendar = getCalendarClient();
  const startDateTime = buildDateTime(generatedAt || new Date(), reminderTime);
  const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000);

  console.log("📅 Creating roadmap generated event", {
    calendarId,
    userName,
    companyName,
    trainingTopic,
    start: startDateTime.toISOString(),
    timeZone,
    attendeeEmail: attendeeEmail || "none",
  });

  const event = {
    summary: `TrainMate: Roadmap Generated` ,
    description: `Roadmap generated for ${userName || "trainee"} (${trainingTopic || "training"}) at ${companyName || "company"}.`,
    start: { dateTime: startDateTime.toISOString(), timeZone },
    end: { dateTime: endDateTime.toISOString(), timeZone },
    reminders: { useDefault: false, overrides: getReminderOverrides() },
  };

  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: attendeeEmail ? "all" : "none",
  });

  console.log("✅ Roadmap generated event created", {
    trainingTopic,
    reminderTime: reminderTime || DEFAULT_REMINDER_TIME,
  });
}
