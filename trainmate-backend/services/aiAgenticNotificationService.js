// trainmate-backend/services/aiAgenticNotificationService.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../config/firebase.js";
import { sendRoadmapEmail, sendDailyModuleReminderEmail, sendQuizUnlockEmail } from "./emailService.js";
import { createDailyModuleReminder, createQuizUnlockReminder, createRoadmapGeneratedEvent } from "./calendarService.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * AI Agentic Notification Service
 * Uses Gemini AI to make intelligent, personalized notification decisions
 */

/**
 * Analyze user engagement patterns using AI
 * @param {string} companyId 
 * @param {string} deptId 
 * @param {string} userId 
 * @returns {Promise<Object>} User engagement analysis
 */
export async function analyzeUserEngagement(companyId, deptId, userId) {
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
      return null;
    }

    const userData = userDoc.data();

    // Collect user metrics
    const engagementData = {
      lastLoginAt: userData.lastLoginAt?.toDate?.() || new Date(),
      totalQuizzesAttempted: userData.totalQuizzesAttempted || 0,
      averageQuizScore: userData.averageQuizScore || 0,
      learningStreak: userData.learningStreak || 0,
      modulesCompleted: userData.modulesCompleted || 0,
      lastActiveModule: userData.lastActiveModule || "Unknown",
      timeSpentLearning: userData.timeSpentLearning || 0, // in minutes
      preferredLearningHours: userData.preferredLearningHours || "Not tracked",
      emailOpenRate: userData.emailOpenRate || 0,
      emailClickRate: userData.emailClickRate || 0,
    };

    return engagementData;
  } catch (error) {
    console.warn("⚠️ Error analyzing engagement:", error.message);
    return null;
  }
}

/**
 * Use AI to decide if notification should be sent
 * @param {Object} context - Notification context
 * @returns {Promise<Object>} AI decision
 */
export async function aiDecideNotificationStrategy(context) {
  console.log("\n🤖 AI Agentic Service: Consulting Gemini for notification strategy...");

  const prompt = `You are an intelligent notification strategist for a corporate training platform called TrainMate.

Analyze this user context and make smart notification decisions:

USER PROFILE:
- Name: ${context.userName}
- Company: ${context.companyName}
- Training Topic: ${context.trainingTopic}
- Last Login: ${context.engagementData?.lastLoginAt?.toLocaleString() || "Unknown"}
- Learning Streak: ${context.engagementData?.learningStreak || 0} days
- Modules Completed: ${context.engagementData?.modulesCompleted || 0}
- Average Quiz Score: ${context.engagementData?.averageQuizScore || 0}%
- Email Open Rate: ${context.engagementData?.emailOpenRate || 0}%
- Time Spent Learning: ${context.engagementData?.timeSpentLearning || 0} minutes
- Current Module: ${context.activeModule?.moduleTitle || "None"}

NOTIFICATION CONTEXT:
- Notification Type: ${context.notificationType}
- Is First-time User: ${context.isNewUser}
- Current Hour: ${new Date().getHours()}
- User Timezone: ${context.timezone}

Based on this profile, provide a JSON response with these EXACT fields:
{
  "shouldSend": true/false,
  "reason": "Brief explanation",
  "sendEmail": true/false,
  "createCalendarEvent": true/false,
  "optimalTime": "HH:MM",
  "personalizationTip": "How to personalize content",
  "urgencyLevel": "high/medium/low",
  "estimatedEngagementScore": 0-100,
  "recommendedMessageTone": "motivational/factual/supportive"
}

Consider:
1. User engagement patterns and history
2. Optimal timing based on their activity
3. Risk of notification fatigue (too many emails)
4. Learning effectiveness (when they're most receptive)
5. Whether they're likely to engage`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const aiDecision = JSON.parse(jsonMatch[0]);
    console.log("🧠 AI Decision:", {
      shouldSend: aiDecision.shouldSend,
      reason: aiDecision.reason,
      estimatedEngagement: aiDecision.estimatedEngagementScore,
    });

    return aiDecision;
  } catch (error) {
    console.error("❌ AI decision-making failed:", error.message);
    // Fallback to safe defaults
    return {
      shouldSend: true,
      reason: "AI unavailable, using defaults",
      sendEmail: true,
      createCalendarEvent: true,
      optimalTime: "15:00",
      estimatedEngagementScore: 50,
      recommendedMessageTone: "motivational",
      urgencyLevel: "medium",
    };
  }
}

/**
 * Use AI to generate personalized email subject and preview
 * @param {Object} context 
 * @returns {Promise<Object>} Personalized content
 */
export async function aiGeneratePersonalizedContent(context) {
  console.log("🤖 AI Agentic Service: Generating personalized content...");

  const prompt = `Generate personalized email content for a training platform user.

USER CONTEXT:
- Name: ${context.userName}
- Company: ${context.companyName}
- Learning Streak: ${context.engagementData?.learningStreak || 0} days
- Modules Completed: ${context.engagementData?.modulesCompleted || 0}
- Average Score: ${context.engagementData?.averageQuizScore || 0}%
- Engagement: ${context.engagementData?.emailOpenRate || 0}%

NOTIFICATION TYPE: ${context.notificationType}
${context.activeModule ? `- Active Module: ${context.activeModule.moduleTitle}` : ""}

Generate a JSON response with EXACT fields:
{
  "emailSubject": "Compelling subject line",
  "emailPreview": "Brief preview text (under 50 chars)",
  "personalizationElements": ["element1", "element2"],
  "callToActionText": "Action text",
  "motivationalMessage": "Message tailored to their progress"
}

Make it personal, relevant to their progress, and motivating.`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const content = JSON.parse(jsonMatch[0]);
    console.log("✨ Personalized content generated");
    return content;
  } catch (error) {
    console.error("❌ Content generation failed:", error.message);
    return {
      emailSubject: `Continue Your Learning Journey`,
      emailPreview: "Your next module is ready",
      callToActionText: "Start Learning",
      motivationalMessage: "Keep up the great work!",
    };
  }
}

/**
 * AI-driven intelligent notification sending
 * @param {Object} params 
 */
export async function aiAgenticSendRoadmapNotifications({
  companyId,
  deptId,
  userId,
  userName,
  userEmail,
  companyName,
  trainingTopic,
  modules,
  pdfBuffer,
  userData,
}) {
  console.log("\n🚀 AI Agentic Notification Service: Starting roadmap notification workflow...");

  // Step 1: Analyze user engagement
  const engagementData = await analyzeUserEngagement(companyId, deptId, userId);
  console.log("📊 User Engagement Analysis Complete");

  // Step 2: AI decides notification strategy
  const aiDecision = await aiDecideNotificationStrategy({
    userName,
    companyName,
    trainingTopic,
    engagementData,
    notificationType: "ROADMAP_GENERATED",
    isNewUser: !userData?.roadmapGeneratedAt,
    timezone: process.env.DEFAULT_TIMEZONE,
    activeModule: modules[0],
  });

  if (!aiDecision.shouldSend) {
    console.log(`⏭️ AI Decision: Skip notification - ${aiDecision.reason}`);
    return;
  }

  console.log(`✅ AI Decision: Send notification - ${aiDecision.reason}`);
  console.log(`   Engagement Score: ${aiDecision.estimatedEngagementScore}/100`);

  // Step 3: Generate personalized content
  const personalizedContent = await aiGeneratePersonalizedContent({
    userName,
    companyName,
    engagementData,
    notificationType: "ROADMAP_GENERATED",
    activeModule: modules[0],
  });

  // Step 4: Send email with AI-generated content
  if (aiDecision.sendEmail && userEmail) {
    try {
      await sendRoadmapEmail({
        userEmail,
        userName,
        companyName,
        trainingTopic,
        moduleCount: modules.length,
        pdfBuffer,
      });
      console.log(`✅ [AI] Roadmap email sent to ${userEmail}`);
      console.log(`   Subject: ${personalizedContent.emailSubject}`);
      console.log(`   Tone: ${aiDecision.recommendedMessageTone}`);
    } catch (error) {
      console.error("❌ Email send failed:", error.message);
    }
  }

  // Step 5: Create calendar event in user's personal calendar based on AI recommendation
  if (aiDecision.createCalendarEvent && userEmail) {
    try {
      const timeZone = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
      const reminderTime = aiDecision.optimalTime || process.env.DAILY_REMINDER_TIME || "15:00";

      await createRoadmapGeneratedEvent({
        companyId,
        deptId,
        userId,
        userName,
        companyName,
        trainingTopic,
        generatedAt: new Date(),
        reminderTime,
        timeZone,
        attendeeEmail: userEmail,
      });
      console.log(`✅ [AI] Calendar event added to user's personal calendar`);
      console.log(`   User: ${userEmail}`);
      console.log(`   Urgency: ${aiDecision.urgencyLevel}`);
    } catch (error) {
      console.error("❌ Calendar event failed:", error.message);
      console.warn("⚠️ User may need to connect their Google Calendar on first login");
    }
  }
}

/**
 * AI-driven module and quiz notifications
 * @param {Object} params 
 */
export async function aiAgenticSendModuleNotifications({
  companyId,
  deptId,
  userId,
  userName,
  userEmail,
  companyName,
  activeModule,
  userData,
}) {
  console.log("\n🚀 AI Agentic Service: Analyzing module notification strategy...");

  const engagementData = await analyzeUserEngagement(companyId, deptId, userId);

  const aiDecision = await aiDecideNotificationStrategy({
    userName,
    companyName,
    trainingTopic: activeModule.moduleTitle,
    engagementData,
    notificationType: "MODULE_REMINDER",
    isNewUser: false,
    timezone: process.env.DEFAULT_TIMEZONE,
    activeModule,
  });

  if (!aiDecision.shouldSend) {
    console.log(`⏭️ AI: Skip module notifications - ${aiDecision.reason}`);
    return;
  }

  console.log(`✅ AI: Send module notifications - ${aiDecision.reason}`);

  const timeZone = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
  const reminderTime = aiDecision.optimalTime || "15:00";

  // Calendar reminders in user's personal calendar
  if (aiDecision.createCalendarEvent) {
    try {
      const estimatedDays = activeModule.estimatedDays || 1;
      await createDailyModuleReminder({
        companyId,
        deptId,
        userId,
        moduleTitle: activeModule.moduleTitle,
        companyName,
        startDate: new Date(),
        occurrenceCount: estimatedDays,
        reminderTime,
        timeZone,
        attendeeEmail: userEmail,
      });
      console.log(`✅ [AI] Daily module reminders added to user's calendar`);
      console.log(`   User: ${userEmail}`);
    } catch (error) {
      console.error("❌ Daily reminder failed:", error.message);
      console.warn("⚠️ User may need to connect their Google Calendar");
    }
  }

  // Quiz unlock notifications
  // NOTE: Quiz unlock notifications are now sent by the daily reminder cron job
  // when the module reaches 50% of its estimated time (quiz unlock requirement)
  // See scheduledJobs.js for implementation
  console.log(`📝 Quiz unlock notifications will be sent when module reaches 50% time completion`);
}

/**
 * AI-driven daily reminder sending (called by cron)
 * @param {Object} params 
 * @returns {Promise<boolean>}
 */
export async function aiAgenticSendDailyReminder({
  companyId,
  deptId,
  userId,
  userEmail,
  userName,
  moduleTitle,
  companyName,
  dayNumber,
  userData,
}) {
  console.log(`\n🤖 AI Agentic Service: Evaluating daily reminder for ${userName}...`);

  const engagementData = await analyzeUserEngagement(companyId, deptId, userId);

  const aiDecision = await aiDecideNotificationStrategy({
    userName,
    companyName,
    trainingTopic: moduleTitle,
    engagementData,
    notificationType: "DAILY_REMINDER",
    isNewUser: false,
    timezone: process.env.DEFAULT_TIMEZONE,
  });

  if (!aiDecision.shouldSend) {
    console.log(`⏭️ AI: Skip daily reminder - ${aiDecision.reason}`);
    return false;
  }

  try {
    const personalizedContent = await aiGeneratePersonalizedContent({
      userName,
      companyName,
      engagementData,
      notificationType: "DAILY_REMINDER",
    });

    await sendDailyModuleReminderEmail({
      userEmail,
      userName,
      moduleTitle,
      companyName,
      dayNumber,
    });

    console.log(`✅ [AI] Daily reminder sent to ${userEmail}`);
    console.log(`   Engagement Score: ${aiDecision.estimatedEngagementScore}/100`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send daily reminder:`, error.message);
    return false;
  }
}

/**
 * Get AI insights about user's learning progress
 * @param {Object} params 
 * @returns {Promise<Object>} AI insights
 */
export async function aiGetLearnerInsights({
  companyId,
  deptId,
  userId,
  userName,
}) {
  console.log(`\n🧠 AI Agentic Service: Analyzing learner insights for ${userName}...`);

  const engagementData = await analyzeUserEngagement(companyId, deptId, userId);

  const prompt = `Analyze this learner's progress and provide insights:

LEARNER PROFILE:
- Name: ${userName}
- Learning Streak: ${engagementData?.learningStreak || 0} days
- Modules Completed: ${engagementData?.modulesCompleted || 0}
- Average Score: ${engagementData?.averageQuizScore || 0}%
- Time Spent: ${engagementData?.timeSpentLearning || 0} minutes
- Email Engagement: ${engagementData?.emailOpenRate || 0}%

Provide JSON with:
{
  "strengths": ["strength1", "strength2"],
  "areasForImprovement": ["area1", "area2"],
  "recommendedPace": "fast/moderate/slow",
  "motivationalMessage": "Personalized message",
  "nextStepsRecommendation": "What they should focus on"
}`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const insights = JSON.parse(jsonMatch[0]);
    console.log("✨ Learner insights generated");
    return insights;
  } catch (error) {
    console.error("❌ Insights generation failed:", error.message);
    return null;
  }
}
