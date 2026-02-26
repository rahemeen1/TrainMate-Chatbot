# 🤖 Complete Agentic AI Flow Documentation

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Agentic AI Architecture](#agentic-ai-architecture)
3. [Flow 1: Roadmap Generation](#flow-1-roadmap-generation-with-agentic-ai)
4. [Flow 2: Daily Reminders](#flow-2-daily-reminders-with-agentic-ai)
5. [Flow 3: Quiz Unlock Notifications](#flow-3-quiz-unlock-notifications-with-agentic-ai)
6. [Flow 4: Module Unlock Notifications](#flow-4-module-unlock-notifications)
7. [Core AI Functions](#core-ai-functions)
8. [Data Flow Diagram](#data-flow-diagram)
9. [File Architecture](#file-architecture)

---

## System Overview

TrainMate uses **Google Gemini AI** to power an intelligent, agentic notification system. Instead of sending generic notifications to all users, the AI:

- **Analyzes** each user's behavior patterns and engagement metrics
- **Decides** intelligently whether to send notifications (and through which channels)
- **Personalizes** content based on individual progress and learning style
- **Optimizes** timing for maximum engagement based on user activity patterns
- **Creates** calendar events directly in each user's personal Google Calendar
- **Adapts** over time by learning from user interactions

### Key Technologies
- **AI Engine**: Google Gemini 2.5-flash
- **Email**: Nodemailer with HTML templates
- **Calendar**: Google Calendar API (OAuth 2.0, user-specific)
- **Database**: Firebase Firestore
- **Scheduling**: Node-cron
- **Backend**: Node.js/Express

---

## Agentic AI Architecture

### What is "Agentic AI"?

**Agentic AI** means the AI acts as an autonomous agent that:
1. **Observes** user behavior and context
2. **Reasons** about the best action to take
3. **Acts** by making decisions (send/skip, email/calendar, timing, tone)
4. **Learns** from outcomes to improve future decisions

### Three Core AI Functions

```javascript
┌─────────────────────────────────────────────────────────────┐
│                  AGENTIC AI FUNCTIONS                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. analyzeUserEngagement(companyId, deptId, userId)       │
│     → Retrieves engagement metrics from Firestore          │
│     → Returns: Login patterns, quiz scores, streaks, etc.  │
│                                                             │
│  2. aiDecideNotificationStrategy(context)                  │
│     → Calls Gemini AI with user context                    │
│     → AI returns: shouldSend, sendEmail, createCalendar,   │
│                   optimalTime, urgency, tone               │
│                                                             │
│  3. aiGeneratePersonalizedContent(context)                 │
│     → Calls Gemini AI to generate personalized content     │
│     → Returns: Email subject, preview, call-to-action      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Flow 1: Roadmap Generation with Agentic AI

### When It Triggers
- User uploads their CV/resume
- System generates a personalized training roadmap
- Roadmap contains multiple modules with estimated days

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  USER UPLOADS CV                                            │
└──────────────────┬──────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  1. CV PARSING & SKILL EXTRACTION                           │
│  File: controllers/roadmap.controller.js                    │
│  Function: generateRoadmapController()                      │
│                                                              │
│  Actions:                                                    │
│  → Parse CV using cvParser.service.js                       │
│  → Extract skills from CV text                              │
│  → Retrieve company docs from Pinecone vector DB            │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  2. AI ROADMAP GENERATION                                   │
│  File: services/llmService.js                               │
│  Function: generateRoadmap()                                │
│                                                              │
│  Actions:                                                    │
│  → Send CV text + company docs to Gemini AI                 │
│  → AI generates modules with:                               │
│    • moduleTitle                                            │
│    • description                                            │
│    • estimatedDays                                          │
│    • skillsCovered[]                                        │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  3. SAVE ROADMAP TO FIRESTORE                               │
│  File: controllers/roadmap.controller.js                    │
│                                                              │
│  Firestore Path:                                            │
│  freshers/{companyId}/departments/{deptId}/users/{userId}/  │
│    roadmap/{moduleId}                                       │
│                                                              │
│  Module Data:                                               │
│  {                                                           │
│    moduleTitle: "React Fundamentals",                       │
│    description: "Learn React basics...",                    │
│    estimatedDays: 5,                                        │
│    skillsCovered: ["React", "JSX", "Components"],           │
│    status: "active",  // First module is active             │
│    order: 1,                                                │
│    startDate: Timestamp,                                    │
│    startedAt: Timestamp                                     │
│  }                                                           │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  4. GENERATE ROADMAP PDF                                    │
│  File: services/pdfService.js                               │
│  Function: generateRoadmapPDF()                             │
│                                                              │
│  Actions:                                                    │
│  → Create PDF with company branding                         │
│  → Include all modules with descriptions                    │
│  → Add estimated timeline                                   │
│  → Return PDF buffer                                        │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  5. 🤖 AGENTIC AI NOTIFICATION SERVICE                      │
│  File: services/aiAgenticNotificationService.js             │
│  Function: aiAgenticSendRoadmapNotifications()              │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
       ┌───────────┴───────────┐
       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐
│  STEP 5A:        │  │  STEP 5B:        │
│  Analyze User    │  │  AI Decision     │
│  Engagement      │  │  Making          │
└────────┬─────────┘  └────────┬─────────┘
         ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  5A. ANALYZE USER ENGAGEMENT                                │
│  Function: analyzeUserEngagement(companyId, deptId, userId) │
│                                                              │
│  Retrieves from Firestore:                                  │
│  {                                                           │
│    lastLoginAt: Date,                                       │
│    totalQuizzesAttempted: 0,                                │
│    averageQuizScore: 0,                                     │
│    learningStreak: 0,                                       │
│    modulesCompleted: 0,                                     │
│    timeSpentLearning: 0,  // minutes                        │
│    emailOpenRate: 0.0,    // 0-1                            │
│    emailClickRate: 0.0    // 0-1                            │
│  }                                                           │
│                                                              │
│  For new users: All metrics are 0/null                      │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  5B. AI DECISION MAKING (Gemini AI)                         │
│  Function: aiDecideNotificationStrategy(context)            │
│                                                              │
│  AI Input Context:                                          │
│  {                                                           │
│    userName: "John Doe",                                    │
│    companyName: "TechCorp",                                 │
│    trainingTopic: "React Development",                      │
│    engagementData: {...},  // From Step 5A                  │
│    notificationType: "ROADMAP_GENERATED",                   │
│    isNewUser: true,        // First roadmap                 │
│    timezone: "Asia/Karachi",                                │
│    activeModule: {...}     // First module                  │
│  }                                                           │
│                                                              │
│  Gemini AI Prompt:                                          │
│  "You are an intelligent notification strategist for        │
│   TrainMate. Analyze this user and decide:                  │
│   - Should we send this notification?                       │
│   - Via email? Via calendar?                                │
│   - What time is optimal?                                   │
│   - What tone should we use?                                │
│   - Estimated engagement probability?"                      │
│                                                              │
│  AI Response Format:                                        │
│  {                                                           │
│    shouldSend: true,                                        │
│    reason: "New user - welcome onboarding is critical",     │
│    sendEmail: true,                                         │
│    createCalendarEvent: true,                               │
│    optimalTime: "09:00",                                    │
│    personalizationTip: "Welcome warmly, explain platform",  │
│    urgencyLevel: "high",                                    │
│    estimatedEngagementScore: 85,                            │
│    recommendedMessageTone: "welcoming"                      │
│  }                                                           │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
          ┌────────┴────────┐
          ▼                 ▼
   ┌─────────────┐   ┌──────────────┐
   │ AI says NO  │   │  AI says YES │
   └──────┬──────┘   └──────┬───────┘
          ▼                 ▼
┌─────────────────┐  ┌──────────────────────────────────┐
│  Skip           │  │  CONTINUE TO STEP 6              │
│  Notification   │  │  (Personalized Content)          │
└─────────────────┘  └──────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  6. GENERATE PERSONALIZED CONTENT                           │
│  Function: aiGeneratePersonalizedContent(context)           │
│                                                              │
│  Gemini AI generates:                                       │
│  {                                                           │
│    emailSubject: "Welcome to TechCorp Training! 🚀",        │
│    emailPreview: "Your personalized React roadmap is...",   │
│    callToAction: "Start Your Journey Today",                │
│    motivationalMessage: "You're about to embark..."         │
│  }                                                           │
│                                                              │
│  AI considers:                                              │
│  → User's role/seniority (from CV)                          │
│  → Training difficulty level                                │
│  → Company culture (formal vs casual)                       │
│  → User's past engagement (if any)                          │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
          ┌────────┴────────┐
          ▼                 ▼
   ┌──────────────┐   ┌──────────────┐
   │  7A. EMAIL   │   │ 7B. CALENDAR │
   └──────┬───────┘   └──────┬───────┘
          ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│  7A. SEND EMAIL (if AI recommends)                          │
│  File: services/emailService.js                             │
│  Function: sendRoadmapEmail()                               │
│                                                              │
│  Email Details:                                              │
│  → To: user's email                                         │
│  → Subject: AI-generated subject                            │
│  → Body: HTML template with roadmap details                 │
│  → Attachment: Roadmap PDF                                  │
│  → Tone: Matches AI recommendation (welcoming/motivational) │
│                                                              │
│  Email Content:                                              │
│  - Personalized greeting                                    │
│  - Roadmap overview                                         │
│  - Module count and estimated timeline                      │
│  - Call-to-action button                                    │
│  - PDF attachment                                           │
└─────────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  7B. CREATE GOOGLE CALENDAR EVENT (if AI recommends)        │
│  File: services/calendarService.js                          │
│  Function: createRoadmapGeneratedEvent()                    │
│                                                              │
│  How It Works:                                              │
│  1. Retrieve user's OAuth tokens from Firestore            │
│     Path: freshers/{companyId}/departments/{deptId}/        │
│           users/{userId}/googleOAuth                        │
│                                                              │
│  2. Create OAuth2 client with user's tokens                 │
│     → accessToken: User's current access token              │
│     → refreshToken: User's refresh token                    │
│                                                              │
│  3. Call Google Calendar API                                │
│     → calendar.events.insert()                              │
│     → calendarId: "primary" (user's default calendar)       │
│                                                              │
│  Event Details:                                              │
│  {                                                           │
│    summary: "TrainMate: Roadmap Generated - React",         │
│    description: "Your personalized roadmap for React...",   │
│    start: { dateTime: "2026-02-26T09:00:00+05:00" },       │
│    end: { dateTime: "2026-02-26T09:30:00+05:00" },         │
│    reminders: {                                             │
│      useDefault: false,                                     │
│      overrides: [                                           │
│        { method: "popup", minutes: 30 },                    │
│        { method: "email", minutes: 60 }                     │
│      ]                                                       │
│    },                                                        │
│    colorId: "9"  // Blue color                              │
│  }                                                           │
│                                                              │
│  ✅ Event appears in user's PERSONAL Google Calendar        │
│  ✅ No email invitation needed                              │
│  ✅ Syncs across all user's devices                         │
└─────────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  8. UPDATE FIRESTORE TRACKING                               │
│                                                              │
│  User document update:                                      │
│  {                                                           │
│    roadmapGeneratedAt: Timestamp,                           │
│    lastNotificationSentAt: Timestamp,                       │
│    emailNotificationsSent: increment(1),                    │
│    calendarEventCreated: true                               │
│  }                                                           │
│                                                              │
│  First module marked as "active"                            │
└─────────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  ✅ ROADMAP GENERATION COMPLETE                             │
│                                                              │
│  User receives:                                              │
│  ✅ Personalized email with PDF                             │
│  ✅ Calendar event in their Google Calendar                 │
│  ✅ Access to interactive roadmap in platform               │
└─────────────────────────────────────────────────────────────┘
```

### Key Files in Flow 1

| File | Function | Purpose |
|------|----------|---------|
| `controllers/roadmap.controller.js` | `generateRoadmapController()` | Main orchestrator for roadmap generation |
| `services/llmService.js` | `generateRoadmap()` | Uses Gemini AI to create roadmap modules |
| `services/pdfService.js` | `generateRoadmapPDF()` | Creates PDF document |
| `services/aiAgenticNotificationService.js` | `aiAgenticSendRoadmapNotifications()` | AI-powered notification logic |
| `services/aiAgenticNotificationService.js` | `analyzeUserEngagement()` | Retrieves user metrics |
| `services/aiAgenticNotificationService.js` | `aiDecideNotificationStrategy()` | AI decision-making |
| `services/aiAgenticNotificationService.js` | `aiGeneratePersonalizedContent()` | AI content generation |
| `services/emailService.js` | `sendRoadmapEmail()` | Sends email with PDF |
| `services/calendarService.js` | `createRoadmapGeneratedEvent()` | Creates calendar event in user's calendar |

---

## Flow 2: Daily Reminders with Agentic AI

### When It Triggers
- **Scheduled Job**: Runs every day at 3:00 PM (Asia/Karachi timezone)
- **Target**: All users with active modules
- **Purpose**: Remind users to continue their daily learning

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  ⏰ CRON TRIGGER: 3:00 PM Daily                             │
│  File: services/scheduledJobs.js                            │
│  Function: scheduleDailyModuleReminders()                   │
│  Schedule: "0 15 * * *"  (3 PM every day)                   │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  1. FETCH ALL COMPANIES                                     │
│                                                              │
│  Query: db.collection("freshers").get()                     │
│  Result: List of all companies using TrainMate              │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
                   │ For each company
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  2. FETCH ALL DEPARTMENTS                                   │
│                                                              │
│  Query: freshers/{companyId}/departments                    │
│  Result: List of all departments in company                 │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
                   │ For each department
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  3. FETCH ALL USERS                                         │
│                                                              │
│  Query: freshers/{companyId}/departments/{deptId}/users     │
│  Result: List of all users (freshers) in department         │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
                   │ For each user
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  4. CHECK FOR ACTIVE MODULE                                 │
│                                                              │
│  Query: freshers/{companyId}/departments/{deptId}/          │
│         users/{userId}/roadmap                              │
│         .where("status", "==", "active")                    │
│                                                              │
│  If no active module → Skip user                            │
│  If active module exists → Continue to Step 5               │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  5. CHECK QUIZ UNLOCK STATUS (50% Time Rule)                │
│  Function: shouldUnlockQuiz()                               │
│                                                              │
│  Logic:                                                      │
│  → Calculate: unlockTime = startDate + (estimatedDays * 0.5)│
│  → Check: Has 50% of module time passed?                    │
│  → Check: Was quiz just unlocked today?                     │
│                                                              │
│  If quiz should unlock → Send quiz unlock notification      │
│  (See Flow 3 for details)                                   │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  6. 🤖 AGENTIC AI DAILY REMINDER                            │
│  Function: aiAgenticSendDailyReminder()                     │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
       ┌───────────┴───────────┐
       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐
│  STEP 6A:        │  │  STEP 6B:        │
│  Analyze User    │  │  AI Decision     │
└────────┬─────────┘  └────────┬─────────┘
         ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  6A. ANALYZE USER ENGAGEMENT                                │
│  Function: analyzeUserEngagement()                          │
│                                                              │
│  Retrieves:                                                 │
│  → Last login time                                          │
│  → Current learning streak                                  │
│  → Quiz performance                                         │
│  → Time spent learning                                      │
│  → Email engagement (open/click rates)                      │
│                                                              │
│  Example for active user:                                   │
│  {                                                           │
│    lastLoginAt: "2026-02-25 14:30",                         │
│    learningStreak: 7,  // 7 days consecutive                │
│    totalQuizzesAttempted: 3,                                │
│    averageQuizScore: 82,                                    │
│    timeSpentLearning: 150,  // 150 minutes                  │
│    emailOpenRate: 0.85,     // Opens 85% of emails          │
│    emailClickRate: 0.60     // Clicks 60% of emails         │
│  }                                                           │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  6B. AI DECISION MAKING                                     │
│  Function: aiDecideNotificationStrategy()                   │
│                                                              │
│  Gemini AI analyzes:                                        │
│  → Is user actively engaged? (high streak = engaged)        │
│  → Did they login recently? (yesterday = engaged)           │
│  → Do they open emails? (high rate = send email)            │
│  → Are they burned out? (too many reminders = skip)         │
│  → What time do they usually learn? (optimize timing)       │
│                                                              │
│  AI Decision Examples:                                      │
│                                                              │
│  Example 1: High Engagement User                            │
│  {                                                           │
│    shouldSend: true,                                        │
│    reason: "User has 7-day streak, high engagement",        │
│    sendEmail: true,                                         │
│    createCalendarEvent: true,                               │
│    optimalTime: "14:30",  // User's peak activity time      │
│    recommendedMessageTone: "motivational",                  │
│    urgencyLevel: "medium",                                  │
│    estimatedEngagementScore: 88,                            │
│    personalizationTip: "Mention their impressive streak"    │
│  }                                                           │
│                                                              │
│  Example 2: Inactive User                                   │
│  {                                                           │
│    shouldSend: false,                                       │
│    reason: "User hasn't logged in for 10 days - avoid spam",│
│    sendEmail: false,                                        │
│    createCalendarEvent: false,                              │
│    estimatedEngagementScore: 15                             │
│  }                                                           │
│                                                              │
│  Example 3: Struggling User                                 │
│  {                                                           │
│    shouldSend: true,                                        │
│    reason: "User struggling with quizzes - needs support",  │
│    sendEmail: true,                                         │
│    createCalendarEvent: true,                               │
│    optimalTime: "16:00",                                    │
│    recommendedMessageTone: "supportive",                    │
│    urgencyLevel: "high",                                    │
│    estimatedEngagementScore: 65,                            │
│    personalizationTip: "Offer help, mention resources"      │
│  }                                                           │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
          ┌────────┴────────┐
          ▼                 ▼
   ┌─────────────┐   ┌──────────────┐
   │ AI says NO  │   │  AI says YES │
   │ Skip user   │   │  Continue    │
   └─────────────┘   └──────┬───────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  7. GENERATE PERSONALIZED CONTENT                           │
│  Function: aiGeneratePersonalizedContent()                  │
│                                                              │
│  AI generates:                                              │
│  → Custom email subject                                     │
│  → Personalized message body                                │
│  → Call-to-action text                                      │
│  → Motivational message                                     │
│                                                              │
│  Example Output:                                            │
│  {                                                           │
│    emailSubject: "Day 7: Keep That Streak Going! 🔥",       │
│    emailPreview: "You're doing amazing with React...",      │
│    callToAction: "Continue Your Module",                    │
│    motivationalMessage: "Your 7-day streak shows..."        │
│  }                                                           │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
          ┌────────┴────────┐
          ▼                 ▼
   ┌──────────────┐   ┌──────────────┐
   │  8A. EMAIL   │   │ 8B. CALENDAR │
   └──────┬───────┘   └──────┬───────┘
          ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│  8A. SEND DAILY REMINDER EMAIL                              │
│  File: services/emailService.js                             │
│  Function: sendDailyModuleReminderEmail()                   │
│                                                              │
│  Email Content:                                              │
│  → Subject: AI-generated personalized subject               │
│  → Body: HTML template with module info                     │
│  → Call-to-action button to access module                   │
│  → Progress summary                                         │
│  → Motivational message based on AI tone                    │
└─────────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  8B. CREATE/UPDATE CALENDAR REMINDER                        │
│  File: services/calendarService.js                          │
│  Function: createDailyModuleReminder()                      │
│                                                              │
│  Creates RECURRING event in user's calendar:                │
│  {                                                           │
│    summary: "React Module - Daily Learning",                │
│    description: "Continue your React training...",          │
│    start: { dateTime: "2026-02-26T14:30:00+05:00" },       │
│    end: { dateTime: "2026-02-26T15:30:00+05:00" },         │
│    recurrence: [                                            │
│      "RRULE:FREQ=DAILY;COUNT=5"  // Based on estimatedDays │
│    ],                                                        │
│    reminders: {                                             │
│      overrides: [                                           │
│        { method: "popup", minutes: 15 }                     │
│      ]                                                       │
│    }                                                         │
│  }                                                           │
│                                                              │
│  ✅ Recurring daily event for module duration               │
│  ✅ Auto-reminds user at optimal time                       │
└─────────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  9. LOG AI DECISION & TRACK ENGAGEMENT                      │
│                                                              │
│  Console logs (for monitoring):                             │
│  🤖 AI Agentic Service: Evaluating daily reminder...        │
│  📊 Engagement Score: 88/100                                │
│  ✅ [AI] Daily reminder sent to user@example.com            │
│  📧 Subject: "Day 7: Keep That Streak Going! 🔥"            │
│                                                              │
│  Firestore tracking:                                        │
│  {                                                           │
│    lastReminderSentAt: Timestamp,                           │
│    totalRemindersSent: increment(1),                        │
│    lastEngagementScore: 88                                  │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  10. REPEAT FOR NEXT USER                                   │
│                                                              │
│  Process continues for:                                     │
│  → All users in current department                          │
│  → All departments in current company                       │
│  → All companies in system                                  │
│                                                              │
│  Job completes when all users processed                     │
└─────────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  ✅ DAILY REMINDER JOB COMPLETE                             │
│                                                              │
│  Summary logged:                                            │
│  ✅ Daily Module Reminder Job Completed                     │
│  → Total users processed: 150                               │
│  → AI recommended send: 85 users                            │
│  → AI recommended skip: 65 users                            │
│  → Emails sent: 85                                          │
│  → Calendar events created: 85                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Files in Flow 2

| File | Function | Purpose |
|------|----------|---------|
| `services/scheduledJobs.js` | `scheduleDailyModuleReminders()` | Cron job orchestrator |
| `services/scheduledJobs.js` | `shouldUnlockQuiz()` | Checks if quiz should unlock |
| `services/aiAgenticNotificationService.js` | `aiAgenticSendDailyReminder()` | AI-powered daily reminder |
| `services/emailService.js` | `sendDailyModuleReminderEmail()` | Sends reminder email |
| `services/calendarService.js` | `createDailyModuleReminder()` | Creates recurring calendar event |

---

## Flow 3: Quiz Unlock Notifications with Agentic AI

### When It Triggers
- **Automatic**: During daily reminder cron job (3 PM)
- **Condition**: When 50% of module's estimated days have passed
- **Purpose**: Notify user that quiz is now available

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  PART OF DAILY REMINDER JOB (Flow 2)                       │
│  Time: 3:00 PM daily                                        │
│  Context: Processing active module for each user            │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  1. CHECK QUIZ UNLOCK TIME                                  │
│  File: services/scheduledJobs.js                            │
│  Function: shouldUnlockQuiz(moduleStartDate, estimatedDays) │
│                                                              │
│  Calculation:                                               │
│  unlockTime = startDate + (estimatedDays * 0.5 * 24hrs)     │
│                                                              │
│  Example:                                                    │
│  → Module started: Feb 20, 2026                             │
│  → Estimated days: 6 days                                   │
│  → 50% time: 3 days                                         │
│  → Unlock time: Feb 23, 2026                                │
│  → Current time: Feb 23, 2026 3:00 PM                       │
│  → Result: true (quiz should unlock NOW)                    │
│                                                              │
│  Additional check:                                          │
│  → Only unlock if within last 24 hours                      │
│  → Prevents duplicate notifications                         │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
          ┌────────┴────────┐
          ▼                 ▼
   ┌─────────────┐   ┌──────────────┐
   │Not yet time │   │  Time to     │
   │Skip         │   │  unlock quiz │
   └─────────────┘   └──────┬───────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. CHECK IF ALREADY NOTIFIED                               │
│                                                              │
│  Check Firestore field:                                     │
│  → quizUnlockNotificationSent: false?                       │
│                                                              │
│  If already notified → Skip                                 │
│  If not notified → Continue                                 │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 🤖 AGENTIC AI QUIZ UNLOCK NOTIFICATION                  │
│  Function: sendQuizUnlockNotifications()                    │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
       ┌───────────┴───────────┐
       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐
│  STEP 3A:        │  │  STEP 3B:        │
│  Analyze User    │  │  AI Decision     │
└────────┬─────────┘  └────────┬─────────┘
         ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  3A. ANALYZE USER ENGAGEMENT                                │
│  Function: analyzeUserEngagement()                          │
│                                                              │
│  Retrieves user's quiz history:                             │
│  → totalQuizzesAttempted                                    │
│  → averageQuizScore                                         │
│  → Last quiz performance                                    │
│  → Time spent in current module                             │
│                                                              │
│  Example:                                                    │
│  {                                                           │
│    totalQuizzesAttempted: 2,                                │
│    averageQuizScore: 75,  // 75% average                    │
│    learningStreak: 5,                                       │
│    timeSpentLearning: 180  // 180 minutes in module        │
│  }                                                           │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  3B. AI DECISION MAKING                                     │
│  Function: aiDecideNotificationStrategy()                   │
│                                                              │
│  Context sent to AI:                                        │
│  {                                                           │
│    userName: "John Doe",                                    │
│    companyName: "TechCorp",                                 │
│    trainingTopic: "React Fundamentals",                     │
│    engagementData: {...},                                   │
│    notificationType: "QUIZ_UNLOCK",                         │
│    isNewUser: false,                                        │
│    timezone: "Asia/Karachi",                                │
│    activeModule: {                                          │
│      moduleTitle: "React Fundamentals",                     │
│      estimatedDays: 6,                                      │
│      daysPassed: 3  // 50% complete                         │
│    }                                                         │
│  }                                                           │
│                                                              │
│  AI analyzes:                                               │
│  → Is user ready for quiz? (based on time spent)            │
│  → Should we encourage or pressure?                         │
│  → What urgency level? (quiz has deadline)                  │
│  → Best time to take quiz?                                  │
│                                                              │
│  AI Decision:                                               │
│  {                                                           │
│    shouldSend: true,                                        │
│    reason: "User ready - 50% time passed, good engagement", │
│    sendEmail: true,                                         │
│    createCalendarEvent: true,                               │
│    optimalTime: "10:00",  // Morning for quiz focus         │
│    recommendedMessageTone: "encouraging",                   │
│    urgencyLevel: "high",  // Quiz is time-sensitive         │
│    estimatedEngagementScore: 80,                            │
│    personalizationTip: "Mention readiness, offer support"   │
│  }                                                           │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
          ┌────────┴────────┐
          ▼                 ▼
   ┌──────────────┐   ┌──────────────┐
   │  4A. EMAIL   │   │ 4B. CALENDAR │
   └──────┬───────┘   └──────┬───────┘
          ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│  4A. SEND QUIZ UNLOCK EMAIL                                 │
│  File: services/emailService.js                             │
│  Function: sendQuizUnlockEmail()                            │
│                                                              │
│  Email Content:                                              │
│  → Subject: "🎯 Quiz Unlocked: React Fundamentals"          │
│  → Body: HTML template with:                                │
│    • Congratulations message                                │
│    • Module progress summary                                │
│    • Quiz deadline (7 days from unlock)                     │
│    • Tips for quiz preparation                              │
│    • Call-to-action button                                  │
│                                                              │
│  Personalization:                                           │
│  → Tone: Encouraging (as recommended by AI)                 │
│  → Mention user's preparation time                          │
│  → Include module recap                                     │
│                                                              │
│  Example Email:                                              │
│  ┌───────────────────────────────────────────────┐          │
│  │ Subject: 🎯 Quiz Unlocked: React Fundamentals │          │
│  │                                               │          │
│  │ Hi John,                                      │          │
│  │                                               │          │
│  │ Great news! You've completed 50% of your     │          │
│  │ React Fundamentals module, and your quiz is  │          │
│  │ now available.                                │          │
│  │                                               │          │
│  │ You've been learning consistently for 3 days │          │
│  │ - that preparation will help you succeed!    │          │
│  │                                               │          │
│  │ Quiz Details:                                 │          │
│  │ • Available: Now                              │          │
│  │ • Deadline: March 3, 2026                     │          │
│  │ • Duration: 30 minutes                        │          │
│  │ • Attempts: 3 maximum                         │          │
│  │                                               │          │
│  │ Tips:                                         │          │
│  │ • Review your module notes                    │          │
│  │ • Practice key concepts                       │          │
│  │ • Take it when you feel focused               │          │
│  │                                               │          │
│  │ [Take Quiz Now] button                        │          │
│  └───────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  4B. CREATE QUIZ DEADLINE CALENDAR EVENT                    │
│  File: services/calendarService.js                          │
│  Function: createQuizUnlockReminder()                       │
│                                                              │
│  Event Details:                                              │
│  {                                                           │
│    summary: "⏰ Quiz Deadline: React Fundamentals",         │
│    description: "Your quiz for React Fundamentals is...",   │
│    start: { dateTime: "2026-03-03T23:59:00+05:00" }, // Deadline │
│    end: { dateTime: "2026-03-03T23:59:00+05:00" },         │
│    reminders: {                                             │
│      overrides: [                                           │
│        { method: "popup", minutes: 1440 }, // 1 day before │
│        { method: "popup", minutes: 720 },  // 12 hrs before│
│        { method: "email", minutes: 1440 }  // 1 day before │
│      ]                                                       │
│    },                                                        │
│    colorId: "11"  // Red color for urgent deadline          │
│  }                                                           │
│                                                              │
│  ✅ Deadline event with multiple reminders                  │
│  ✅ Red color indicates urgency                             │
│  ✅ Appears in user's personal calendar                     │
└─────────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  5. UPDATE FIRESTORE - MARK AS NOTIFIED                     │
│                                                              │
│  Update module document:                                    │
│  {                                                           │
│    quizUnlockNotificationSent: true,                        │
│    quizUnlockedAt: Timestamp (Feb 23, 2026 3:00 PM),       │
│    quizDeadline: Timestamp (March 3, 2026 11:59 PM)        │
│  }                                                           │
│                                                              │
│  Prevents duplicate notifications                           │
└─────────────────────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  ✅ QUIZ UNLOCK NOTIFICATION COMPLETE                       │
│                                                              │
│  User receives:                                              │
│  ✅ Email notification about quiz availability              │
│  ✅ Calendar event for quiz deadline                        │
│  ✅ Multiple reminders before deadline                      │
│  ✅ Quiz unlocked in platform UI                            │
└─────────────────────────────────────────────────────────────┘
```

### Quiz Unlock Backend Validation

The system also has **backend validation** in `controllers/QuizController.js`:

```javascript
// When user tries to access quiz
if (!quizTimeUnlocked) {
  return res.status(403).json({
    error: "Quiz is locked",
    message: "Complete 50% of module time to unlock quiz",
    remainingTime: "2 days 4 hours",
    unlockTime: "Feb 23, 2026 3:00 PM"
  });
}
```

### Key Files in Flow 3

| File | Function | Purpose |
|------|----------|---------|
| `services/scheduledJobs.js` | `shouldUnlockQuiz()` | Calculates if 50% time passed |
| `services/scheduledJobs.js` | `sendQuizUnlockNotifications()` | Orchestrates quiz unlock flow |
| `services/aiAgenticNotificationService.js` | `analyzeUserEngagement()` | Retrieves user quiz history |
| `services/aiAgenticNotificationService.js` | `aiDecideNotificationStrategy()` | AI decision for quiz notification |
| `services/emailService.js` | `sendQuizUnlockEmail()` | Sends quiz unlock email |
| `services/calendarService.js` | `createQuizUnlockReminder()` | Creates deadline reminder |
| `controllers/QuizController.js` | `checkQuizTimeUnlock()` | Backend validation |

---

## Flow 4: Module Unlock Notifications

### When It Triggers
- **Automatic**: When previous module quiz is passed
- **Condition**: Quiz score >= 60%
- **Purpose**: Notify user that next module is now accessible

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  USER SUBMITS QUIZ                                          │
│  File: controllers/QuizController.js                        │
│  Function: submitQuiz()                                     │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  1. GRADE QUIZ                                              │
│                                                              │
│  Calculate score:                                           │
│  → Total questions: 10                                      │
│  → Correct answers: 8                                       │
│  → Score: 80%                                               │
│  → Passing threshold: 60%                                   │
│  → Result: PASSED ✅                                        │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  2. UPDATE CURRENT MODULE STATUS                            │
│                                                              │
│  Update Firestore:                                          │
│  {                                                           │
│    status: "completed",  // Was "active"                    │
│    completedAt: Timestamp,                                  │
│    quizScore: 80,                                           │
│    quizAttempts: 1                                          │
│  }                                                           │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  3. UNLOCK NEXT MODULE                                      │
│                                                              │
│  Find next module (order = currentOrder + 1)                │
│  Update next module:                                        │
│  {                                                           │
│    status: "active",  // Was "locked"                       │
│    startDate: Timestamp (now),                              │
│    startedAt: Timestamp (now)                               │
│  }                                                           │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 🤖 AGENTIC MODULE NOTIFICATION                          │
│  Function: aiAgenticSendModuleNotifications()               │
│                                                              │
│  AI Decision:                                               │
│  → analyzeUserEngagement() - Check progress                 │
│  → aiDecideNotificationStrategy() - Should notify?          │
│  → If yes:                                                  │
│    • Send email about new module                            │
│    • Create calendar events for new module duration         │
└──────────────────┬────────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  ✅ NEXT MODULE UNLOCKED                                    │
│                                                              │
│  User receives:                                              │
│  ✅ Congrats email for passing quiz                         │
│  ✅ New module introduction email                           │
│  ✅ Calendar events for new module                          │
│  ✅ Next module visible in roadmap UI                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Core AI Functions

### 1. `analyzeUserEngagement(companyId, deptId, userId)`

**Purpose**: Retrieve user's behavioral data from Firestore

**Returns**:
```javascript
{
  lastLoginAt: Date,
  totalQuizzesAttempted: number,
  averageQuizScore: number,
  learningStreak: number,
  modulesCompleted: number,
  timeSpentLearning: number,  // minutes
  emailOpenRate: number,       // 0-1
  emailClickRate: number       // 0-1
}
```

**Used in**: All notification flows

---

### 2. `aiDecideNotificationStrategy(context)`

**Purpose**: Consult Gemini AI to decide notification strategy

**Input Context**:
```javascript
{
  userName: string,
  companyName: string,
  trainingTopic: string,
  engagementData: object,
  notificationType: string,  // ROADMAP_GENERATED, MODULE_REMINDER, QUIZ_UNLOCK
  isNewUser: boolean,
  timezone: string,
  activeModule: object
}
```

**AI Prompt Structure**:
```
You are an intelligent notification strategist for TrainMate.
Analyze this user and decide:
- Should we send notification?
- Via email? Calendar?
- What time is optimal?
- What tone to use?
- Engagement probability?
```

**Returns**:
```javascript
{
  shouldSend: boolean,
  reason: string,
  sendEmail: boolean,
  createCalendarEvent: boolean,
  optimalTime: string,
  personalizationTip: string,
  urgencyLevel: string,
  estimatedEngagementScore: number,
  recommendedMessageTone: string
}
```

---

### 3. `aiGeneratePersonalizedContent(context)`

**Purpose**: Generate personalized notification content

**Input Context**:
```javascript
{
  userName: string,
  companyName: string,
  engagementData: object,
  notificationType: string,
  activeModule: object
}
```

**Returns**:
```javascript
{
  emailSubject: string,
  emailPreview: string,
  callToAction: string,
  motivationalMessage: string
}
```

**Example**:
```javascript
// For high performer
{
  emailSubject: "You're Crushing It! 🚀 Next Module Ready",
  emailPreview: "Your consistent effort is paying off...",
  callToAction: "Tackle Next Challenge",
  motivationalMessage: "You're in the top 10% of learners!"
}

// For struggling learner
{
  emailSubject: "We're Here to Help - Let's Succeed Together",
  emailPreview: "Learning can be challenging, but you've got this...",
  callToAction: "Get Back On Track",
  motivationalMessage: "Every expert was once a beginner"
}
```

---

## Data Flow Diagram

### System-Wide Agentic AI Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    EVENT TRIGGERS                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Roadmap    │  │    Daily     │  │     Quiz     │     │
│  │  Generated   │  │   3 PM Cron  │  │   Unlocked   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
└─────────┼─────────────────┼─────────────────┼──────────────┘
          │                 │                 │
          └─────────┬───────┴────────┬────────┘
                    ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│              AGENTIC AI ENGINE                              │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  STEP 1: DATA COLLECTION                               │ │
│  │  analyzeUserEngagement()                               │ │
│  │  ↓                                                      │ │
│  │  Firestore Query                                       │ │
│  │  freshers/{companyId}/departments/{deptId}/users/...  │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  STEP 2: AI REASONING                                  │ │
│  │  aiDecideNotificationStrategy()                        │ │
│  │  ↓                                                      │ │
│  │  Gemini AI API Call                                    │ │
│  │  → Analyze engagement patterns                         │ │
│  │  → Consider notification history                       │ │
│  │  → Optimize timing                                     │ │
│  │  → Decide channels (email/calendar)                    │ │
│  │  → Determine urgency                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                    ┌──────┴──────┐                          │
│                    ▼             ▼                          │
│              ┌─────────┐   ┌─────────┐                      │
│              │ SEND    │   │  SKIP   │                      │
│              └────┬────┘   └─────────┘                      │
│                   │                                          │
│                   ▼                                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  STEP 3: CONTENT GENERATION                            │ │
│  │  aiGeneratePersonalizedContent()                       │ │
│  │  ↓                                                      │ │
│  │  Gemini AI API Call                                    │ │
│  │  → Generate email subject                              │ │
│  │  → Create personalized message                         │ │
│  │  → Adapt tone to user's level                          │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              NOTIFICATION CHANNELS                          │
│                                                              │
│  ┌──────────────────────┐    ┌──────────────────────────┐  │
│  │   EMAIL SERVICE      │    │   CALENDAR SERVICE       │  │
│  │                      │    │                          │  │
│  │  • Nodemailer        │    │  • Google Calendar API   │  │
│  │  • HTML templates    │    │  • OAuth2 per user       │  │
│  │  • PDF attachments   │    │  • Recurring events      │  │
│  │  • Personalized tone │    │  • Smart reminders       │  │
│  └──────────┬───────────┘    └──────────┬───────────────┘  │
│             │                           │                   │
└─────────────┼───────────────────────────┼───────────────────┘
              ▼                           ▼
┌──────────────────────┐    ┌──────────────────────────────┐
│   USER EMAIL INBOX   │    │   USER GOOGLE CALENDAR       │
│                      │    │   (Personal, not shared)     │
│  • Personalized msg  │    │   • Event with reminders     │
│  • Call-to-action    │    │   • Color-coded urgency      │
│  • PDF attachment    │    │   • Auto-syncs devices       │
└──────────────────────┘    └──────────────────────────────┘
              │                           │
              └───────────┬───────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              ENGAGEMENT TRACKING                            │
│                                                              │
│  Firestore Updates:                                         │
│  → lastNotificationSentAt                                   │
│  → totalEmailsSent++                                        │
│  → lastEngagementScore                                      │
│  → emailOpenRate (tracked via email service)                │
│  → emailClickRate (tracked via links)                       │
│                                                              │
│  This data feeds back into future AI decisions ↺            │
└─────────────────────────────────────────────────────────────┘
```

---

## File Architecture

### Backend Structure

```
trainmate-backend/
│
├── controllers/
│   ├── roadmap.controller.js
│   │   └─ generateRoadmapController() - Orchestrates roadmap generation
│   │   └─ Calls: llmService, pdfService, aiAgenticNotificationService
│   │
│   └── QuizController.js
│       └─ submitQuiz() - Handles quiz submission
│       └─ checkQuizTimeUnlock() - Validates 50% time rule
│
├── services/
│   ├── aiAgenticNotificationService.js  ⭐ CORE AGENTIC AI
│   │   ├─ analyzeUserEngagement()
│   │   ├─ aiDecideNotificationStrategy()
│   │   ├─ aiGeneratePersonalizedContent()
│   │   ├─ aiAgenticSendRoadmapNotifications()
│   │   ├─ aiAgenticSendModuleNotifications()
│   │   └─ aiAgenticSendDailyReminder()
│   │
│   ├── scheduledJobs.js  ⭐ CRON SCHEDULER
│   │   ├─ scheduleDailyModuleReminders() - 3 PM daily
│   │   ├─ shouldUnlockQuiz() - 50% time check
│   │   └─ sendQuizUnlockNotifications()
│   │
│   ├── llmService.js  ⭐ ROADMAP GENERATION
│   │   └─ generateRoadmap() - Gemini creates modules
│   │
│   ├── emailService.js  ⭐ EMAIL DELIVERY
│   │   ├─ sendRoadmapEmail()
│   │   ├─ sendDailyModuleReminderEmail()
│   │   └─ sendQuizUnlockEmail()
│   │
│   ├── calendarService.js  ⭐ CALENDAR INTEGRATION
│   │   ├─ createRoadmapGeneratedEvent()
│   │   ├─ createDailyModuleReminder()
│   │   └─ createQuizUnlockReminder()
│   │
│   ├── pdfService.js
│   │   └─ generateRoadmapPDF() - Creates PDF
│   │
│   ├── cvParser.service.js
│   │   └─ parseCvFromUrl() - Extracts CV text
│   │
│   └── pineconeService.js
│       └─ retrieveDeptDocsFromPinecone() - Vector search
│
├── config/
│   └── firebase.js - Firestore database
│
└── routes/
    ├── roadmapRoutes.js - POST /api/roadmap/generate
    └── quizRoutes.js - POST /api/quiz/submit
```

### Frontend Structure (Relevant Files)

```
frontend/src/
├── components/
│   └── Fresher/
│       ├── Roadmap.jsx
│       │   └─ checkQuizTimeUnlock() - Frontend validation
│       │   └─ Displays lock status
│       │
│       ├── ModuleQuiz.jsx
│       │   └─ Shows lock screen if quiz locked
│       │   └─ Countdown to unlock time
│       │
│       └── Chatbot.jsx
│           └─ generateDailyAgenda() - AI daily greeting
│           └─ Shows "Day X of Y" message
```

---

## AI Decision Examples

### Example 1: New User - Roadmap Generated

**User Profile**:
```javascript
{
  userName: "Sarah Johnson",
  isNewUser: true,
  lastLoginAt: "2026-02-26 10:30",
  learningStreak: 0,
  totalQuizzesAttempted: 0,
  emailOpenRate: null,
  trainingTopic: "Full Stack Web Development"
}
```

**AI Decision**:
```javascript
{
  shouldSend: true,
  reason: "New user onboarding is critical for engagement",
  sendEmail: true,
  createCalendarEvent: true,
  optimalTime: "09:00",  // Start of work day
  personalizationTip: "Welcome warmly, explain platform features",
  urgencyLevel: "high",
  estimatedEngagementScore: 90,
  recommendedMessageTone: "welcoming and educational"
}
```

**Generated Content**:
```javascript
{
  emailSubject: "Welcome to TechCorp Training! Your Journey Begins 🚀",
  emailPreview: "We're excited to have you start your Full Stack...",
  callToAction: "Explore Your Roadmap",
  motivationalMessage: "You're about to gain valuable skills..."
}
```

---

### Example 2: Active Learner - Daily Reminder

**User Profile**:
```javascript
{
  userName: "Michael Chen",
  isNewUser: false,
  lastLoginAt: "2026-02-25 16:45",
  learningStreak: 12,  // 12 consecutive days!
  totalQuizzesAttempted: 4,
  averageQuizScore: 88,
  emailOpenRate: 0.92,  // Opens 92% of emails
  timeSpentLearning: 320,  // 320 minutes
  trainingTopic: "Advanced React Patterns"
}
```

**AI Decision**:
```javascript
{
  shouldSend: true,
  reason: "User highly engaged, maintain momentum with positive reinforcement",
  sendEmail: true,
  createCalendarEvent: true,
  optimalTime: "16:30",  // User's typical learning time
  personalizationTip: "Celebrate 12-day streak, motivate to continue",
  urgencyLevel: "medium",
  estimatedEngagementScore: 95,
  recommendedMessageTone: "motivational and celebratory"
}
```

**Generated Content**:
```javascript
{
  emailSubject: "Day 12 Streak! 🔥 You're On Fire, Michael!",
  emailPreview: "Your consistency is remarkable - 12 days straight!",
  callToAction: "Continue Your Streak",
  motivationalMessage: "You're in the top 5% of learners!"
}
```

---

### Example 3: Inactive User - Daily Reminder

**User Profile**:
```javascript
{
  userName: "Lisa Martinez",
  isNewUser: false,
  lastLoginAt: "2026-02-14",  // 12 days ago!
  learningStreak: 0,
  totalQuizzesAttempted: 1,
  averageQuizScore: 45,  // Failed quiz
  emailOpenRate: 0.20,  // Opens only 20% of emails
  timeSpentLearning: 45,
  trainingTopic: "JavaScript Basics"
}
```

**AI Decision**:
```javascript
{
  shouldSend: false,
  reason: "User disengaged - avoid email fatigue, wait for re-engagement",
  sendEmail: false,
  createCalendarEvent: false,
  estimatedEngagementScore: 12,
  note: "Consider re-engagement campaign after 30 days"
}
```

---

### Example 4: Struggling Learner - Quiz Unlock

**User Profile**:
```javascript
{
  userName: "David Kim",
  isNewUser: false,
  lastLoginAt: "2026-02-25 11:00",
  learningStreak: 4,
  totalQuizzesAttempted: 2,
  averageQuizScore: 52,  // Barely passing
  emailOpenRate: 0.75,
  timeSpentLearning: 200,
  trainingTopic: "Database Design"
}
```

**AI Decision**:
```javascript
{
  shouldSend: true,
  reason: "User struggling but engaged - provide supportive guidance",
  sendEmail: true,
  createCalendarEvent: true,
  optimalTime: "10:00",
  personalizationTip: "Offer encouragement, suggest resources",
  urgencyLevel: "high",
  estimatedEngagementScore: 70,
  recommendedMessageTone: "supportive and resourceful"
}
```

**Generated Content**:
```javascript
{
  emailSubject: "Quiz Ready: We're Here to Help You Succeed",
  emailPreview: "Database Design can be challenging - let's tackle it together",
  callToAction: "Review Resources Before Quiz",
  motivationalMessage: "Remember, every expert was once a beginner..."
}
```

---

## Benefits of Agentic AI System

### For Users (Learners)
- ✅ **Less Spam**: Only receive notifications when AI determines they're beneficial
- ✅ **Personalized**: Messages tailored to their progress and learning style
- ✅ **Optimal Timing**: Notifications sent when users are most likely to engage
- ✅ **Supportive**: AI adapts tone based on user's struggles or successes
- ✅ **Convenient**: Calendar integration reminds them across all devices

### For Companies (Training Managers)
- 📈 **Higher Engagement**: Smart notifications = better open rates
- 📊 **Better Completion**: Timely reminders keep learners on track
- 💰 **ROI Improvement**: More learners completing training successfully
- 🔍 **Insights**: AI provides data on learner patterns
- ⏱️ **Time Savings**: Automated intelligent notifications

### For Platform (TrainMate)
- 🧠 **Continuous Learning**: System improves with more data
- 🎯 **Precision**: AI makes better decisions than rules-based systems
- 🔄 **Adaptability**: Handles diverse learner types automatically
- 🚀 **Scalability**: Works for 10 users or 10,000 users
- 🏆 **Competitive Edge**: Advanced AI features differentiate platform

---

## Environment Configuration

### Required .env Variables

```bash
# Gemini AI (Core AI Engine)
GEMINI_API_KEY=your_gemini_api_key_here

# Email Service
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Google OAuth (For User Calendar Access)
GOOGLE_CLIENT_ID=your_oauth_client_id
GOOGLE_CLIENT_SECRET=your_oauth_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback

# Timezone & Scheduling
DEFAULT_TIMEZONE=Asia/Karachi
DAILY_REMINDER_TIME=15:00
DAILY_REMINDER_CRON=0 15 * * *

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

---

## Monitoring & Logging

### AI Decision Logs

All AI decisions logged with emojis for easy identification:

```
🚀 AI Agentic Service: Starting roadmap notification workflow...
📊 User Engagement Analysis Complete
🤖 AI Agentic Service: Consulting Gemini for notification strategy...
🧠 AI Decision: { shouldSend: true, reason: "User highly engaged..." }
✨ Personalized content generated
✅ [AI] Email sent to user@example.com
📆 [AI] Calendar event created in user's personal calendar
📈 Engagement Score: 88/100
```

### Key Metrics Tracked

- **AI Decision Accuracy**: shouldSend vs actual engagement
- **Email Open Rates**: Per user, per notification type
- **Calendar Event Attendance**: Do users show up?
- **Engagement Score**: AI's estimated vs actual
- **Response Time**: How long after notification does user engage?

---

## Testing

### Test Calendar Integration

Run: `node testCalendar.js`

Tests:
- ✅ Roadmap generated event
- ✅ Daily module reminder
- ✅ Quiz unlock reminder

### Test AI Decisions

Create test users with different profiles:
1. **New user**: Should get welcoming tone
2. **High performer**: Should get motivational tone
3. **Struggling learner**: Should get supportive tone
4. **Inactive user**: Should be skipped

---

## Future Enhancements

### v2.0 - Enhanced AI Capabilities
- 🔮 Predictive analytics (predict who will drop off)
- 🎯 A/B testing different message tones
- 📊 Admin analytics dashboard
- 🌍 Multi-language content generation
- 🎓 Learning style adaptation (visual vs text learners)

### v2.1 - Two-Way Communication
- 💬 Users can reply to notifications
- 🤖 AI processes user feedback
- 📝 AI adjusts strategy based on responses

### v2.2 - Advanced Personalization
- 🤝 Peer comparison (anonymized)
- 🏆 Gamification elements
- 📱 SMS & Push notification support
- 🎵 Video personalized messages

---

## Conclusion

TrainMate's **Agentic AI System** represents a sophisticated, intelligent approach to user engagement. Instead of generic mass notifications, the system:

1. **Observes** each user's unique behavior patterns
2. **Reasons** about the best action using Gemini AI
3. **Acts** by sending personalized notifications through optimal channels
4. **Learns** from outcomes to improve future decisions

This creates a **user-centric experience** where learners receive exactly what they need, when they need it, in the way they prefer - resulting in higher engagement, better completion rates, and improved learning outcomes.

---

**Status**: ✅ Production Ready  
**Last Updated**: February 26, 2026  
**Version**: 1.0  
**Maintained by**: TrainMate Engineering Team
