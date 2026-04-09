// trainmate-backend/services/scheduledJobs.js
import cron from "node-cron";
import { db } from "../config/firebase.js";
import { handleQuizUnlock } from "./notificationService.js";

/**
 * Check if quiz should be unlocked (70% of module time passed by default)
 * @param {Date} moduleStartDate - When module became active
 * @param {number} estimatedDays - Total estimated days for the module
 * @param {number} unlockPercent - Quiz unlock percentage threshold
 * @returns {boolean} - True if quiz should be unlocked
 */
function shouldUnlockQuiz(moduleStartDate, estimatedDays, unlockPercent = 70) {
  const now = Date.now();
  const startTime = moduleStartDate instanceof Date 
    ? moduleStartDate.getTime() 
    : moduleStartDate.toDate ? moduleStartDate.toDate().getTime() : new Date(moduleStartDate).getTime();

  const normalizedUnlockPercent = Number.isFinite(Number(unlockPercent))
    ? Number(unlockPercent)
    : 70;
  const unlockRatio = Math.max(0, Math.min(100, normalizedUnlockPercent)) / 100;
  const unlockDelay = estimatedDays * unlockRatio * 24 * 60 * 60 * 1000;
  const unlockTime = startTime + unlockDelay;
  
  // Check if quiz was just unlocked today (within last 24 hours)
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  return now >= unlockTime && unlockTime >= oneDayAgo;
}

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getModuleStartDate(moduleData) {
  return (
    toDateSafe(moduleData.startedAt) ||
    toDateSafe(moduleData.startDate) ||
    toDateSafe(moduleData.FirstTimeCreatedAt) ||
    toDateSafe(moduleData.createdAt)
  );
}

function isModuleDeadlineExceeded(moduleData, now = new Date()) {
  const startDate = getModuleStartDate(moduleData);
  if (!startDate) return false;
  const totalDays = Number(moduleData.estimatedDays) || 1;
  const deadline = new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
  return now >= deadline;
}

async function enforceExpiredStatusForUser(roadmapRef, now = new Date()) {
  const roadmapSnap = await roadmapRef.get();
  if (roadmapSnap.empty) return;

  for (const moduleDoc of roadmapSnap.docs) {
    const moduleData = moduleDoc.data();
    if (!isModuleDeadlineExceeded(moduleData, now)) continue;

    const hasQuizCompletionEvidence = !!(
      moduleData.quizPassed ||
      moduleData.lastQuizSubmitted ||
      moduleData.completedAt
    );
    if (hasQuizCompletionEvidence) continue;

    let hasChatSession = false;
    if (moduleData.completed || moduleData.status === "completed") {
      const chatSnap = await roadmapRef.doc(moduleDoc.id).collection("chatSessions").limit(1).get();
      hasChatSession = !chatSnap.empty;
    }

    if (hasChatSession && (moduleData.completed || moduleData.status === "completed")) {
      continue;
    }

    const needsUpdate = moduleData.status !== "expired" || !!moduleData.completed || !moduleData.moduleLocked;
    if (!needsUpdate) continue;

    await roadmapRef.doc(moduleDoc.id).update({
      status: "expired",
      completed: false,
      moduleLocked: true,
      expiredAt: now,
    });
    console.log(`⏰ Module expired (scheduler): ${moduleData.moduleTitle || moduleDoc.id}`);
  }
}

/**
 * Send quiz unlock notifications (email only - reuses existing calendar event)
 * Simplified version - just delegates to notification service
 */
async function sendQuizUnlockNotifications({
  companyId,
  deptId,
  userId,
  userEmail,
  userName,
  moduleTitle,
  companyName,
  moduleId,
}) {
  console.log(`\n🔓 Quiz unlock for ${userName} - ${moduleTitle}`);
  
  try {
    // Use simplified notification service - sends ONLY email notification
    await handleQuizUnlock({
      companyId,
      deptId,
      userId,
      userEmail,
      userName,
      moduleTitle,
      companyName,
    });
    
    // Mark quiz as unlocked in Firestore
    const moduleRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap")
      .doc(moduleId);
    
    await moduleRef.update({
      quizUnlockNotificationSent: true,
      quizUnlockedAt: new Date(),
    });
    
    return true;
  } catch (error) {
    console.error(`❌ Quiz unlock failed: ${error.message}`);
    return false;
  }
}

/**
 * Send daily module reminders to all active learners at 3 PM
 * Runs every day at 3:00 PM (15:00)
 */
export function scheduleDailyModuleReminders() {
  // Schedule for 3:00 PM every day (Pakistan time - Asia/Karachi)
  // Cron format: second minute hour day month weekday
  // "0 15 * * *" means: at 15:00 (3 PM) every day
  
  const cronExpression = process.env.DAILY_REMINDER_CRON || "0 15 * * *";
  
  cron.schedule(cronExpression, async () => {
    console.log("\n📧 ==========================================");
    console.log("📧 Daily Module Reminder Job Started at", new Date().toLocaleString());
    console.log("📧 ==========================================\n");

    try {
      const companies = await db.collection("freshers").get();
      
      for (const companyDoc of companies.docs) {
        const companyId = companyDoc.id;
        const companyData = companyDoc.data();
        const companyName = companyData.companyName || "Company";

        // Get all departments
        const departments = await db
          .collection("freshers")
          .doc(companyId)
          .collection("departments")
          .get();

        for (const deptDoc of departments.docs) {
          const deptId = deptDoc.id;

          // Get all users in this department
          const users = await db
            .collection("freshers")
            .doc(companyId)
            .collection("departments")
            .doc(deptId)
            .collection("users")
            .get();

          for (const userDoc of users.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();

            // Check if user has an active module
            const roadmapRef = db
              .collection("freshers")
              .doc(companyId)
              .collection("departments")
              .doc(deptId)
              .collection("users")
              .doc(userId)
              .collection("roadmap");

            // Always enforce practical expiry first, even when user never opened chat.
            await enforceExpiredStatusForUser(roadmapRef, new Date());

            let activeModules = await roadmapRef
              .where("status", "==", "in-progress")
              .limit(1)
              .get();

            // Backward compatibility for legacy "active" status.
            if (activeModules.empty) {
              activeModules = await roadmapRef
                .where("status", "==", "active")
                .limit(1)
                .get();
            }

            if (!activeModules.empty) {
              const activeModuleDoc = activeModules.docs[0];
              const activeModule = activeModuleDoc.data();
              const moduleId = activeModuleDoc.id;
              const moduleTitle = activeModule.moduleTitle || "Current Module";
              const estimatedDays = activeModule.estimatedDays || 1;
              
              // Get the day number (how many days passed since module start)
              const moduleStartDate = activeModule.startDate?.toDate() || activeModule.startedAt?.toDate() || new Date();
              const today = new Date();
              const daysPassed = Math.floor((today - moduleStartDate) / (1000 * 60 * 60 * 24));
              const dayNumber = daysPassed + 1;

              // Check if quiz should be unlocked (70% time requirement by default)
              const quizUnlockPercent = Math.max(
                70,
                Number(userData?.quizPolicy?.quizUnlockPercent) || 70
              );
              if (!activeModule.quizUnlockNotificationSent && shouldUnlockQuiz(moduleStartDate, estimatedDays, quizUnlockPercent)) {
                console.log(`🔓 Quiz unlock condition met for ${userData.email} - ${moduleTitle}`);
                try {
                  await sendQuizUnlockNotifications({
                    companyId,
                    deptId,
                    userId,
                    userEmail: userData.email,
                    userName: userData.name || "Trainee",
                    moduleTitle,
                    companyName,
                    moduleId,
                  });
                } catch (unlockErr) {
                  console.error(`❌ Failed to send quiz unlock notification: ${unlockErr.message}`);
                }
              }

              // NOTE: Daily reminders are now handled by the recurring calendar event
              // created in notificationService.js when roadmap is generated
              // No need to send daily emails - they come from Google Calendar reminders
            }
          }
        }
      }

      console.log("\n✅ Daily Module Reminder Job Completed\n");
    } catch (error) {
      console.error("❌ Daily reminder job failed:", error);
    }
  }, {
    timezone: process.env.DEFAULT_TIMEZONE || "Asia/Karachi"
  });

  console.log(`✅ Daily module reminder scheduler initialized (runs at ${cronExpression})`);
}

/**
 * Initialize all scheduled jobs
 */
export function initializeScheduledJobs() {
  console.log("\n🕐 Initializing scheduled jobs...");
  scheduleDailyModuleReminders();
  console.log("✅ All scheduled jobs initialized\n");
}
