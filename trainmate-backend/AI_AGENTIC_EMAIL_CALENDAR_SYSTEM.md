# 🤖 AI Agentic Notification & Email System

## Overview

TrainMate now features an **AI-powered agentic notification system** using Google's Gemini API. Instead of sending generic notifications to everyone, the system:

- 🧠 **Analyzes** each user's learning patterns and engagement
- 🤖 **Decides** intelligently whether to send notifications
- ✨ **Personalizes** content based on individual progress
- 🎯 **Optimizes** timing for maximum engagement
- � **Adds events to user's personal calendar** (the Gmail they logged in with)
- 📈 **Learns** from user interactions to improve over time

## 🆕 User-Specific Google Calendar Integration

**Key Feature:** Calendar events are added directly to each user's **personal Google Calendar** using the email they logged in with.

**How it works:**
1. User logs in with Google OAuth
2. System stores their calendar access tokens
3. When events are triggered, they're added to **their** calendar automatically
4. No invitations needed - events appear in their own calendar instantly

**Benefits:**
- ✅ Events appear in user's personal calendar (no spam invites)
- ✅ Fully integrated with user's existing calendar
- ✅ Automatic syncing across all devices
- ✅ Custom reminders based on user preferences

## How It Works

### Step-by-Step Flow

```
1. Event Triggered (Roadmap Generated, Module Unlock, etc.)
   ↓
2. 📊 Analyze User Engagement Data
   - Student's learning streak
   - Quiz performance
   - Time spent learning
   - Email open/click rates
   - Last login date
   ↓
3. 🧠 Consult Gemini AI
   - Ask:  Should we send this notification?
   - When: What's the optimal time?
   - How:  What tone should we use?
   - Probability: How likely will they engage?
   ↓
4. ✨ Generate Personalized Content
   - AI creates custom subject line
   - Tailored to their progress level
   - Matching their learning style
   ↓
5. 📧 Send via Selected Channels
   - Email (if AI recommends + user agrees)
   - Google Calendar (if preferences allow)
   ↓
6. 📈 Track Engagement
   - Monitor opens, clicks
   - Feed back into next decision
```

## Key Features

### 1. **Intelligent Decision-Making**

The AI analyzes:
- ✅ User engagement metrics (streak, scores, time spent)
- ✅ Email behavior (open rates, click rates)
- ✅ Activity status (inactive users get fewer notifications)
- ✅ Time of day (respects timezone & working hours)
- ✅ Learning pace preferences

**Example:**
```
Input: User has a 15-day streak, 88% avg score, opened 90% of emails
AI Decision:
- shouldSend: true
- reason: "User is highly engaged, optimal time is their peak hours"
- estimatedEngagementScore: 92/100
- recommendedMessageTone: "motivational"
- optimalTime: "14:30" (learned from their activity)
```

### 2. **Personalized Content Generation**

Gemini AI generates:
- **Custom subject lines** tailored to user's progress
- **Personal email previews** matching their learning style
- **Motivational messages** relevant to their achievements
- **Call-to-action text** suited to their engagement level

**Example:**
```
For high-performer: "You're on Fire! 🔥 Next Module Ready"
For struggling learner: "Let's Try This Module - You Got This! 💪"
For new learner: "Your Learning Journey Starts Now 🚀"
```

### 3. **Adaptive Timing**

Instead of fixed notification times:
- 🎯 AI learns when each user is most receptive
- ⏰ Considers their timezone and work hours
- 📈 Optimizes based on past engagement patterns
- 🌙 Avoids sending during their sleep hours

### 4. **Multi-Channel Smart Delivery**

- **Email**: Only if user is engaged and AI recommends
- **Google Calendar**: Events added to user's **personal calendar** (their Gmail account)
- **Frequency Management**: Prevents notification fatigue
- **Context Awareness**: Different tactics for different situations
- **No Spam Invites**: Events appear directly in user's calendar without email invitations

## Notification Types

### 🎓 Roadmap Generated
- AI analyzes: Is user ready for a new roadmap?
- Sends: Personalized welcome with **in user's personal calendar**
- No invitations: Event appears directly in their Google Calendar
- Engagement boost: Usually 85%+ open rate

### 📚 Daily Module Reminders
- AI analyzes: Should we remind them today?
- Considers: Their engagement pattern, learning streak
- Sends: At optimal time learned from history
- Calendar: Daily recurring events **in user's personal calendar**
- Personalization: "Keep your 10-day streak going!"

### ✅ Quiz Unlocked
- AI analyzes: Is the user ready?
- Considers: Their quiz performance history
- Sends: Encouragement + deadline reminder
- Calendar: Quiz deadline event **in user's personal calendar**y
- Sends: Encouragement + deadline reminder
- Urgency: High (time-sensitive)

## User Engagement Metrics Tracked

```javascript
{
  lastLoginAt: Date,          // When did they last login?
  totalQuizzesAttempted: 5,   // How many quizzes taken?
  averageQuizScore: 87,       // Average score percentage
  learningStreak: 12,         // Consecutive days learning
  modulesCompleted: 3,        // Modules finished
  timeSpentLearning: 450,     // Minutes spent
  emailOpenRate: 0.85,        // 85% of emails opened
  emailClickRate: 0.42,       // 42% of emails clicked
}
```

## API Endpoints

### Get Learner Insights
```
GET /api/ai-insights/:companyId/:deptId/:userId
Query params: ?userName=John

Response:
{
  "strengths": ["Quick learner", "High consistency"],
  "areasForImprovement": ["Quiz performance", "Time management"],
  "recommendedPace": "fast",
  "motivationalMessage": "You're progressing exceptionally well!",
  "nextStepsRecommendation": "Focus on implementing quiz concepts"
}
```

### Get Notification Preferences
```
GET /api/notifications/preferences/:companyId/:deptId/:userId
```

### Update Notification Preferences
```
PUT /api/notifications/preferences/:companyId/:deptId/:userId
Body:
{
  "emailEnabled": true,
  "calendarEnabled": true,
  "dailyRemindersEnabled": true,
  "quizNotificationsEnabled": true,
  "preferredReminderTime": "15:00"
}
```

## AI Decision Logic (Gemini Instructions)

The system prompts Gemini with:

1. **User Context**
   - Profile data (name, company, training)
   - Engagement metrics
   - Learning history

2. **Situation**
   - What triggered the notification
   - Is it first-time or recurring
   - Current time vs. user's timezone

3. **Decision Request**
   - Should we send? (yes/no)
   - Best time to send
   - Recommended tone
   - Estimated engagement probability

## Gemini AI Response Format

```json
{
  "shouldSend": true,
  "reason": "User is highly engaged with consistent login pattern",
  "sendEmail": true,
  "createCalendarEvent": true,
  "optimalTime": "14:30",
  "personalizationTip": "Mention their 10-day streak",
  "urgencyLevel": "high",
  "estimatedEngagementScore": 87,
  "recommendedMessageTone": "motivational"
}
```

## Benefits

### For Users
- 📧 Fewer, smarter notifications (less spam)
- ✨ Personalized messages (feels special)
- ⏰ Messages at optimal times (when they'll engage)
- 🎯 Relevant content (matches their needs)

### For Company
- 📈 Higher email open rates (smart timing)
- ✅ Better engagement metrics
- 💰 ROI improvement (relevant content)
- 🔍 Data-driven insights about learning

## System Architecture

```
Notification Event
    ↓
AI Agentic Service (aiAgenticNotificationService.js)
    ├─ Retrieve User's OAuth Tokens (from Firestore)
    ├─ Send Email (nodemailer + HTML templates)
    └─ Create Calendar Events (Google Calendar API with user's tokens)
    ↓
Notification Channels
    ├─ Email Service (emailService.js)
    ├─ Calendar Service (calendarService.js)
    │   └─ Uses user-specific OAuth client
    └─ Database (Firestore tracking)
```

## Google Calendar Integration Details

### How User Calendars Are Accessed

1. **User Login**: User authenticates with Google OAuth
2. **Token Storage**: 
   ```javascript
   freshers/{companyId}/departments/{deptId}/users/{userId}
   └── googleOAuth: {
         accessToken: "...",
         refreshToken: "...",
# Gemini AI
GEMINI_API_KEY=your_api_key_here

# Timezone & Scheduling
DEFAULT_TIMEZONE=Asia/Karachi
DAILY_REMINDER_TIME=15:00
DAILY_REMINDER_CRON=0 15 * * *

# Google OAuth (for user authentication)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback
FRONTEND_URL=http://localhost:3000

# NOTE: GOOGLE_CALENDAR_ID and GOOGLE_REFRESH_TOKEN are NOT needed
# Events are added to each user's personal calendar using their OAuth tokens

All calendar functions now require user identification:

```javascript
await createRoadmapGeneratedEvent({
  companyId,    // User's company
  deptId,       // User's department
  userId,       // User's ID
  userName,
  companyName,
  trainingTopic,
  // ... other params
  attendeeEmail  // User's Gmail (for reference only)
});
```

Events are created in `"primary"` calendar (user's default Google Calendar). ├─ Email Service (emailService.js)
    ├─ Calendar Service (calendarService.js)
    └─ Database (Firestore tracking)
```

## Scheduled Jobs

**Daily Reminder Cron Job:**
```
Timezone: Asia/Karachi
Time: 3 PM (15:00) - configurable
Frequency: Every day
Process: Analyze each active user → AI decision → Send or skip
```

## Configuration

```env
GEMINI_API_KEY=your_api_key_here
DEFAULT_TIMEZONE=Asia/Karachi
DAILY_REMINDER_TIME=15:00
DAILY_REMINDER_CRON=0 15 * * *
GOOGLE_CALENDAR_ID=primary
GOOGLE_CLIENT_ID=your_id
GOOGLE_CLIENT_SECRET=your_secret
GOOGLE_REFRESH_TOKEN=your_token
```

## Fallback Mechanisms

If Gemini API fails:
- ✅ System defaults to safe, conservative approach
- ✅ Still sends critical notifications (quiz deadlines)
- ✅ Continues operation without AI
- ✅ Logs error for monitoring

```javascript
// Fallback decision if AI unavailable
{and Google OAuth credentials are set in .env**
2. **User logs in with Google** (OAuth flow stores their calendar tokens)
3. **Start server:** `npm start`
4. **Generate a roadmap:** System automatically sends AI-powered notifications
5. **Check user's personal calendar:** Events appear in their Google Calendar
6. **Monitor logs:** Look for 🤖 emojis to see AI decisions

## ⚠️ Important Notes

### First-Time Setup
- **Users must log in with Google OAuth** before calendar events can be created
- Without OAuth connection, system will gracefully skip calendar events (email still sent)
- Log message: `⚠️ User may need to connect their Google Calendar`

### Privacy & Security
- ✅ Each user's calendar tokens are stored securely in Firestore
- ✅ Events only created in user's own calendar (no cross-user access)
- ✅ Tokens automatically refresh when expired
- ✅ Users can revoke access anytime from Google account settings

### Debugging
If calendar events aren't appearing:
1. Check if user has completed Google OAuth login
2. Verify `googleOAuth.refreshToken` exists in user's Firestore document
3. Check console logs for OAuth errors
4. Ensure Google Calendar API is enabled in Google Cloud Console
  optimalTime: "15:00",  // Default time
  estimatedEngagementScore: 50  // Conservative estimate
}
```

## Monitoring & Logging

All AI decisions logged with emojis:

```
🚀 AI Agentic Service: Starting roadmap notification workflow...
📊 User Engagement Analysis Complete
🤖 AI Agentic Service: Consulting Gemini for notification strategy...
🧠 AI Decision: { shouldSend: true, reason: "..." }
✨ Personalized content generated
✅ [AI] Email sent with personalized tone
📈 Engagement Score: 87/100
```

## Future Enhancements

- 🔮 Predictive engagement scoring
- 🎯 A/B testing different message tones
- 📊 Analytics dashboard for admins
- 🌍 Multi-language content generation
- 🎓 Learning style adaptation (visual vs. text-based)
- 💬 Two-way communication (user feedback to AI)
- 🤝 Peer comparison (anonymized progress)
- 📱 SMS & Push notification support

## Files Involved

- `services/aiAgenticNotificationService.js` - Core AI logic
- `controllers/roadmap.controller.js` - Roadmap generation (uses AI)
- `services/scheduledJobs.js` - Cron jobs (uses AI)
- `controllers/aiInsightsController.js` - Insights endpoint
- `routes/aiInsightsRoutes.js` - API routes
- `services/emailService.js` - Email delivery
- `services/calendarService.js` - Calendar integration

## Quick Start

1. **Ensure GEMINI_API_KEY is set in .env**
2. **Start server:** `npm start`
3. **Generate a roadmap:** System automatically sends AI-powered notifications
4. **Monitor logs:** Look for 🤖 emojis to see AI decisions
5. **Check email:** Personalized content arrives

---

**Status:** ✅ Production Ready
**Last Updated:** Feb 26, 2026
**Maintainer:** TrainMate Engineering
