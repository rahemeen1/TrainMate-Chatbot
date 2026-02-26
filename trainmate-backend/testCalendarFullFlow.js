import dotenv from "dotenv";
dotenv.config();

import {
  createDailyModuleReminder,
  createQuizUnlockReminder,
  createRoadmapGeneratedEvent,
} from "./services/calendarService.js";

console.log("Full Google Calendar Integration Test\n");

const mockModules = [
  {
    moduleTitle: "JavaScript Fundamentals",
    description: "Learn JS basics",
    estimatedDays: 7,
  },
  {
    moduleTitle: "DOM Manipulation",
    description: "Learn to work with the DOM",
    estimatedDays: 5,
  },
  {
    moduleTitle: "Async & Promises",
    description: "Learn async programming",
    estimatedDays: 5,
  },
];

const mockFresher = {
  name: "Test Fresher",
  email: process.env.GOOGLE_CALENDAR_EMAIL || "trainmate01@gmail.com",
  company: "Tech Company Inc",
  trainingTopic: "Web Development",
};

const config = {
  calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
  timeZone: process.env.DEFAULT_TIMEZONE || "Asia/Karachi",
  reminderTime: process.env.DAILY_REMINDER_TIME || "22:15",
};

let successCount = 0;
let failureCount = 0;

async function testRoadmapEvent() {
  try {
    await createRoadmapGeneratedEvent({
      calendarId: config.calendarId,
      userName: mockFresher.name,
      companyName: mockFresher.company,
      trainingTopic: mockFresher.trainingTopic,
      generatedAt: new Date(),
      reminderTime: config.reminderTime,
      timeZone: config.timeZone,
      attendeeEmail: mockFresher.email,
    });
    successCount++;
    return true;
  } catch (error) {
    console.error("Roadmap event failed:", error.message);
    failureCount++;
    return false;
  }
}

async function testFirstModuleEvents() {
  const firstModule = mockModules[0];
  const moduleStartDate = new Date();
  moduleStartDate.setHours(0, 0, 0, 0);

  try {
    await createDailyModuleReminder({
      calendarId: config.calendarId,
      moduleTitle: firstModule.moduleTitle,
      companyName: mockFresher.company,
      startDate: moduleStartDate,
      occurrenceCount: firstModule.estimatedDays,
      reminderTime: config.reminderTime,
      timeZone: config.timeZone,
      attendeeEmail: mockFresher.email,
    });
    successCount++;
  } catch (error) {
    console.error("Daily reminder failed:", error.message);
    failureCount++;
  }

  const quizDate = new Date();
  quizDate.setDate(quizDate.getDate() + firstModule.estimatedDays);

  try {
    await createQuizUnlockReminder({
      calendarId: config.calendarId,
      moduleTitle: firstModule.moduleTitle,
      companyName: mockFresher.company,
      unlockDate: quizDate,
      reminderTime: config.reminderTime,
      timeZone: config.timeZone,
      attendeeEmail: mockFresher.email,
    });
    successCount++;
  } catch (error) {
    console.error("Quiz unlock failed:", error.message);
    failureCount++;
  }
}

async function runAllTests() {
  await testRoadmapEvent();
  await testFirstModuleEvents();

  console.log("Test Results Summary");
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failureCount}`);

  process.exit(failureCount === 0 ? 0 : 1);
}

runAllTests().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
