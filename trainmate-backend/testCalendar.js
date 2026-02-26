import dotenv from "dotenv";
dotenv.config();

import {
  createDailyModuleReminder,
  createQuizUnlockReminder,
  createRoadmapGeneratedEvent,
} from "./services/calendarService.js";

console.log("Google Calendar Integration Test Suite\n");

const requiredEnvVars = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_CALENDAR_ID",
];

let allEnvVarsValid = true;
requiredEnvVars.forEach((envVar) => {
  const exists = !!process.env[envVar];
  console.log(`${envVar}: ${exists ? "SET" : "MISSING"}`);
  if (!exists) allEnvVarsValid = false;
});

if (!allEnvVarsValid) {
  console.error("Missing required environment variables");
  process.exit(1);
}

async function testDailyModuleReminder() {
  try {
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 1);

    await createDailyModuleReminder({
      calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
      moduleTitle: "Test Module - JavaScript Basics",
      companyName: "Tech Company Inc",
      startDate: testDate,
      occurrenceCount: 5,
      reminderTime: "10:00 AM",
      timeZone: "Asia/Karachi",
      attendeeEmail: process.env.TEST_EMAIL || undefined,
    });

    console.log("Daily module reminder created successfully");
    return true;
  } catch (error) {
    console.error("Daily module reminder failed:", error.message);
    return false;
  }
}

async function testQuizUnlockReminder() {
  try {
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 3);

    await createQuizUnlockReminder({
      calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
      moduleTitle: "Advanced JavaScript",
      companyName: "Tech Company Inc",
      unlockDate: testDate,
      reminderTime: "03:00 PM",
      timeZone: "Asia/Karachi",
      attendeeEmail: process.env.TEST_EMAIL || undefined,
    });

    console.log("Quiz unlock reminder created successfully");
    return true;
  } catch (error) {
    console.error("Quiz unlock reminder failed:", error.message);
    return false;
  }
}

async function testRoadmapGeneratedEvent() {
  try {
    const now = new Date();

    await createRoadmapGeneratedEvent({
      calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
      userName: "John Doe",
      companyName: "Tech Company Inc",
      trainingTopic: "Full Stack Development",
      generatedAt: now,
      reminderTime: "02:00 PM",
      timeZone: "Asia/Karachi",
      attendeeEmail: process.env.TEST_EMAIL || undefined,
    });

    console.log("Roadmap generated event created successfully");
    return true;
  } catch (error) {
    console.error("Roadmap generated event failed:", error.message);
    return false;
  }
}

async function runAllTests() {
  console.log("Starting Google Calendar tests...\n");

  const results = {
    dailyReminder: await testDailyModuleReminder(),
    quizUnlock: await testQuizUnlockReminder(),
    roadmapEvent: await testRoadmapGeneratedEvent(),
  };

  console.log("Test Results Summary");
  console.log(`Daily Module Reminder: ${results.dailyReminder ? "PASSED" : "FAILED"}`);
  console.log(`Quiz Unlock Reminder: ${results.quizUnlock ? "PASSED" : "FAILED"}`);
  console.log(`Roadmap Generated Event: ${results.roadmapEvent ? "PASSED" : "FAILED"}`);

  const passedCount = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;

  console.log(`Overall: ${passedCount}/${totalTests} tests passed`);
  process.exit(passedCount === totalTests ? 0 : 1);
}

runAllTests().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
