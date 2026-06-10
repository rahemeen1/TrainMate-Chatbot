// trainmate-backend/services/scheduledJobs.js
import cron from "node-cron";
import { db } from "../config/firebase.js";
import { handleQuizUnlock } from "./notificationService.js";
import { sendCompanyLicenseRenewalAlertEmail } from "./emailService.js";

const LICENSE_REMINDER_OFFSETS_DAYS = [5, 4, 3, 2, 1, 0]; // Send reminders 5, 4, 3, 2, 1 days and on renewal day

function timestampToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLatestByCreatedAt(docSnap) {
  if (!docSnap || docSnap.empty) return null;

  const docs = docSnap.docs.slice().sort((a, b) => {
    const aMs = timestampToDate(a.data()?.createdAt)?.getTime() || 0;
    const bMs = timestampToDate(b.data()?.createdAt)?.getTime() || 0;
    return bMs - aMs;
  });

  return docs[0] || null;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function deriveCompanyRenewalDate(companyData, latestBillingData) {
  const billingRenewal =
    timestampToDate(latestBillingData?.renewalDate) ||
    timestampToDate(latestBillingData?.nextRenewalDate) ||
    timestampToDate(latestBillingData?.licenseRenewalDate);
  if (billingRenewal) return billingRenewal;

  const companyRenewal =
    timestampToDate(companyData?.licenseRenewalDate) ||
    timestampToDate(companyData?.nextRenewalDate);
  if (companyRenewal) return companyRenewal;

  const billingCreatedAt = timestampToDate(latestBillingData?.createdAt);
  if (!billingCreatedAt) return null;

  const periodDays = Number(latestBillingData?.billingPeriodDays) || Number(companyData?.billingPeriodDays) || 30;
  const renewalDate = new Date(billingCreatedAt);
  renewalDate.setDate(renewalDate.getDate() + periodDays);
  return renewalDate;
}

export async function processCompanyLicenseRenewalAlerts() {
  const today = startOfDay(new Date());
  console.log(`\n📋 Starting license renewal alert processing for date: ${today.toLocaleDateString()}`);
  
  const companiesSnap = await db.collection("companies").get();
  let processedCount = 0;
  let sentCount = 0;
  let skippedCount = 0;

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    const companyData = companyDoc.data() || {};
    processedCount++;

    if (companyData.status && companyData.status !== "active") {
      console.log(`  ⏭️  Skipping ${companyId}: status is ${companyData.status}, not active`);
      skippedCount++;
      continue;
    }

    const companyEmail =
      String(companyData.email || companyData.companyEmail || "").trim().toLowerCase();
    if (!companyEmail) {
      console.log(`  ⏭️  Skipping ${companyId}: no email found`);
      skippedCount++;
      continue;
    }

    const billingSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("billingPayments")
      .get();

    const latestBillingDoc = getLatestByCreatedAt(billingSnap);
    const latestBillingData = latestBillingDoc?.data() || null;

    const renewalDate = deriveCompanyRenewalDate(companyData, latestBillingData);
    if (!renewalDate) {
      console.log(`  ⏭️  Skipping ${companyId}: no renewal date found`);
      skippedCount++;
      continue;
    }

    const renewalDay = startOfDay(renewalDate);
    const dayDiff = Math.round((renewalDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (!LICENSE_REMINDER_OFFSETS_DAYS.includes(dayDiff)) {
      console.log(`  ⏭️  Skipping ${companyId}: renewal in ${dayDiff} days (no reminder scheduled)`);
      skippedCount++;
      continue;
    }

    const reminderKey = `${renewalDay.toISOString().slice(0, 10)}-d${dayDiff}`;
    const reminderRef = db
      .collection("companies")
      .doc(companyId)
      .collection("licenseNotifications")
      .doc(reminderKey);

    const reminderSnap = await reminderRef.get();
    if (reminderSnap.exists) {
      console.log(`  ⏭️  Skipping ${companyId}: reminder already sent for this date/offset`);
      skippedCount++;
      continue;
    }

    const licensePlan =
      latestBillingData?.plan || companyData.licensePlan || "License Basic";

    const pendingLicensePlan =
      companyData?.pendingLicensePlan === "License Basic" || companyData?.pendingLicensePlan === "License Pro"
        ? companyData.pendingLicensePlan
        : null;

    try {
      await sendCompanyLicenseRenewalAlertEmail({
        companyEmail,
        companyId,
        companyName: companyData.name || "Company",
        licensePlan,
        renewalDate,
        daysRemaining: dayDiff,
        pendingLicensePlan,
      });

      await reminderRef.set({
        companyId,
        companyEmail,
        licensePlan,
        renewalDate,
        daysRemaining: dayDiff,
        sentAt: new Date(),
        sourceBillingDocId: latestBillingDoc?.id || null,
        pendingLicensePlan,
      });

      console.log(
        `✅ License reminder sent for company ${companyId} (${dayDiff} days remaining) to ${companyEmail}`
      );
      sentCount++;
    } catch (emailError) {
      console.error(
        `❌ Failed to send renewal email for company ${companyId}:`,
        emailError?.message
      );
      // Continue processing other companies even if one fails
    }
  }

  console.log(`📊 License renewal job summary: Processed ${processedCount} companies, sent ${sentCount} reminders, skipped ${skippedCount}\n`);
}

export function scheduleCompanyLicenseRenewalAlerts() {
  const cronExpression = process.env.COMPANY_LICENSE_REMINDER_CRON || "0 15 * * *"; // 3 PM daily
  const timezone = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";

  cron.schedule(
    cronExpression,
    async () => {
      console.log(`\n📧 [NOTIFICATIONS][LICENSE] License renewal reminder job started at ${new Date().toLocaleString()} (${timezone})`);
      try {
        await processCompanyLicenseRenewalAlerts();
        console.log("📧 [NOTIFICATIONS][LICENSE] License renewal reminder job completed successfully\n");
      } catch (error) {
        console.error(`❌ [NOTIFICATIONS][LICENSE] License renewal reminder job failed: ${error?.message}\n`, error);
      }
    },
    {
      timezone: timezone,
    }
  );

  console.log(
    `✅ Company license reminder scheduler initialized (runs at ${cronExpression} ${timezone} time)`
  );
}

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

async function enforceExpiredStatusForUser(roadmapRef, now = new Date(), notificationParams = {}) {
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
    console.log(`Module expired (scheduler): ${moduleData.moduleTitle || moduleDoc.id}`);

    // Create in-app notification
    if (notificationParams.companyId && notificationParams.deptId && notificationParams.userId) {
      try {
        const notificationId = `module-lock-${notificationParams.deptId}-${notificationParams.userId}-${moduleDoc.id}`;
        const notificationRef = db
          .collection("companies")
          .doc(notificationParams.companyId)
          .collection("adminNotifications")
          .doc(notificationId);

        await notificationRef.set(
          {
            type: "module_lock",
            subType: "module_expired",
            status: "pending",
            companyId: notificationParams.companyId,
            deptId: notificationParams.deptId,
            userId: notificationParams.userId,
            moduleId: moduleDoc.id,
            title: "Module Deadline Expired",
            userName: notificationParams.userName || "Unknown",
            userEmail: notificationParams.userEmail || "",
            moduleTitle: moduleData.moduleTitle || "Unknown Module",
            attemptNumber: 0,
            score: moduleData.latestScore || 0,
            lockIssueType: "module_expired",
            lockIssueLabel: "Module deadline expired",
            message: `Module deadline expired - ${moduleData.moduleTitle || "module"} has been automatically locked. The learner can no longer access this module. Grant additional time or manually unlock to allow the learner to continue.`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            resolvedAt: null,
          },
          { merge: true }
        );
        console.log(`In-app notification created for module expiration: ${notificationId}`);
      } catch (notificationErr) {
        console.warn(`Failed to create module expiration notification:`, notificationErr.message);
      }
    }

    // Send email notification if parameters are provided
    if (notificationParams.companyEmail && notificationParams.companyName && notificationParams.userName) {
      try {
        const { sendTrainingLockedEmail } = await import("./emailService.js");
        await sendTrainingLockedEmail({
          companyEmail: notificationParams.companyEmail,
          companyName: notificationParams.companyName,
          userName: notificationParams.userName || "Unknown",
          userEmail: notificationParams.userEmail || "",
          moduleTitle: moduleData.moduleTitle || "Unknown Module",
          attemptNumber: 0,
          score: moduleData.latestScore || 0,
          lockIssueLabel: "Module deadline expired",
          lockIssueMessage: "The module deadline has passed and the training has been automatically locked. Please review the learner's progress and decide if you want to grant additional time or unlock the module manually.",
          issueType: "module_expired",
        });
        console.log(`Module expiration email sent for ${notificationParams.userName}`);
      } catch (emailErr) {
        console.warn(`Failed to send module expiration email:`, emailErr.message);
      }
    }
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
  console.log(`\nQuiz unlock for ${userName} - ${moduleTitle}`);
  
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
    console.error(`Quiz unlock failed: ${error.message}`);
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
    console.log("\n==========================================");
    console.log("Daily Module Reminder Job Started at", new Date().toLocaleString());
    console.log("==========================================\n");

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
            // Get company data for notification
            const companySnap = await db.collection("companies").doc(companyId).get();
            const companyData = companySnap.exists ? companySnap.data() : {};
            
            await enforceExpiredStatusForUser(roadmapRef, new Date(), {
              companyId,
              deptId,
              userId,
              companyEmail: companyData?.email || companyData?.companyEmail || "",
              companyName: companyData?.name || "TrainMate Company",
              userName: userData?.name || "Unknown",
              userEmail: userData?.email || "",
            });

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
                console.log(`Quiz unlock condition met for ${userData.email} - ${moduleTitle}`);
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
                  console.error(`Failed to send quiz unlock notification: ${unlockErr.message}`);
                }
              }

              // NOTE: Daily reminders are now handled by the recurring calendar event
              // created in notificationService.js when roadmap is generated
              // No need to send daily emails - they come from Google Calendar reminders
            }
          }
        }
      }

      console.log("\nDaily Module Reminder Job Completed\n");
    } catch (error) {
      console.error("Daily reminder job failed:", error);
    }
  }, {
    timezone: process.env.DEFAULT_TIMEZONE || "Asia/Karachi"
  });

  console.log(`Daily module reminder scheduler initialized (runs at ${cronExpression})`);
}

/**
 * Initialize all scheduled jobs
 */
export function initializeScheduledJobs() {
  console.log("\nInitializing scheduled jobs...");
  scheduleDailyModuleReminders();
  scheduleCompanyLicenseRenewalAlerts();
  console.log("All scheduled jobs initialized\n");
}
