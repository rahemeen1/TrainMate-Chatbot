# Agentic Notification System

## Overview
The TrainMate notification system uses **agentic decision-making** to intelligently determine when and how to send notifications to users. Instead of blindly sending every notification, the system analyzes multiple factors to make smart decisions.

## How It Works

### Intelligent Decision Factors

The system considers the following before sending any notification:

1. **User Preferences**
   - Email enabled/disabled
   - Calendar invites enabled/disabled
   - Daily reminders enabled/disabled
   - Quiz notifications enabled/disabled
   - Preferred reminder time

2. **User Activity Status**
   - Last login date (inactive after 30 days)
   - Only sends to active users

3. **Email Validity**
   - Validates email format
   - Skips invalid emails

4. **Appropriate Timing**
   - Only sends notifications between 8 AM - 10 PM
   - Respects user's timezone
   - Uses preferred reminder time

5. **Context Awareness**
   - First-time vs. returning users
   - Module progress
   - Quiz unlock timing

## Notification Types

### 1. Roadmap Generation
**When triggered:** When a new roadmap is generated

**Decisions made:**
- ✅ Send email if user has valid email and email enabled
- ✅ Create calendar event if calendar enabled and user is active
- ⏭️ Skip if user disabled notifications

### 2. Daily Module Reminders
**When triggered:** Every day at 3 PM (configurable)

**Decisions made:**
- ✅ Send if user is active, has valid email, and hasn't disabled reminders
- ✅ Respect notification hours (8 AM - 10 PM)
- ⏭️ Skip inactive users (no login in 30 days)

### 3. Quiz Unlock Notifications
**When triggered:** When a quiz becomes available

**Decisions made:**
- ✅ Send calendar invite if enabled
- ✅ Send email if within notification hours
- ⏭️ Delay email if outside notification hours

## User Preference Management

### Default Settings (if not set)
```javascript
{
  emailEnabled: true,
  calendarEnabled: true,
  dailyRemindersEnabled: true,
  quizNotificationsEnabled: true,
  preferredReminderTime: "15:00"
}
```

### API Endpoints

**Get Preferences:**
```
GET /api/notifications/preferences/:companyId/:deptId/:userId
```

**Update Preferences:**
```
PUT /api/notifications/preferences/:companyId/:deptId/:userId
Body: {
  emailEnabled: boolean,
  calendarEnabled: boolean,
  dailyRemindersEnabled: boolean,
  quizNotificationsEnabled: boolean,
  preferredReminderTime: "HH:MM"
}
```

## Environment Variables

```env
DEFAULT_TIMEZONE=Asia/Karachi
DAILY_REMINDER_TIME=15:00
DAILY_REMINDER_CRON=0 15 * * *
```

## Benefits of Agentic Approach

1. **Reduces Spam** - No notifications sent to inactive users
2. **Respects User Preferences** - Users have full control
3. **Smart Timing** - Notifications sent at appropriate times
4. **Context-Aware** - Different logic for different scenarios
5. **Non-Intrusive** - Adapts to user behavior

## Logs & Monitoring

All agentic decisions are logged with emojis for easy identification:

- `🤖` - Agentic service analyzing context
- `📊` - Decision factors being evaluated
- `✅` - Notification sent successfully
- `⏭️` - Notification skipped (with reason)
- `⚠️` - Warning or non-critical error

Example log:
```
🤖 Agentic Notification Service: Analyzing roadmap notification context...
📊 Context Analysis: { hasValidEmail: true, isActive: true, emailEnabled: true }
✅ [Agentic] Roadmap email sent to: user@example.com
⏭️ [Agentic] Skipping calendar - User disabled calendar
```

## Implementation Files

- `services/agenticNotificationService.js` - Main agentic logic
- `controllers/notificationPreferencesController.js` - Preference management
- `routes/notificationRoutes.js` - API routes
- `services/scheduledJobs.js` - Cron job integration

## Future Enhancements

- Machine learning to predict best notification times
- Adaptive frequency based on user engagement
- Multi-channel preferences (SMS, Push, etc.)
- A/B testing notification strategies
- Notification digest mode (batch notifications)
