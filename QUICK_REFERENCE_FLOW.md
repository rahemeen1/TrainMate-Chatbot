# 🎯 Quick Reference - What Happens After Changes

## FLOW 1: Roadmap Generation

```
┌─────────────────────────────────────────────────────┐
│ Fresh user: john.doe@company.com                    │
│ Generates roadmap for "React Fundamentals"          │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
        ┌─────────────────────────┐
        │ POST /api/roadmap       │
        │ roadmap.controller.js   │
        └──────────┬──────────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │ handleRoadmapGenerated({         │
    │   userEmail: "john.doe@..."      │
    │   userName: "John",              │
    │   modules: [...],                │
    │   pdfBuffer: <PDF>               │
    │ })                               │
    └──────────┬───────────────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
    ┌───────────┐  ┌──────────────────────┐
    │ Email:    │  │ Calendar Event:      │
    │           │  │                      │
    │ Subject:  │  │ Title: 🎓 Daily      │
    │ "Your     │  │ Learning: React      │
    │ Roadmap   │  │ Basics               │
    │ Ready"    │  │                      │
    │           │  │ Start: Tomorrow 3 PM │
    │ To:       │  │ Recurrence: DAILY    │
    │ john.doe@ │  │ Attendee:            │
    │ company   │  │ john.doe@company.com │
    │ .com      │  │                      │
    │           │  │ Reminders:           │
    │ PDF: YES  │  │ • Email 60 min       │
    │           │  │ • Popup 10 min       │
    └───────────┘  └──────────────────────┘
        │                 │
        │                 │
        ▼                 ▼
    📧 Gmail        📅 Google Calendar
    "Your Roadmap"  "Accept invitation"
    Sent 2:00 PM    Sent 2:05 PM
```

**Result:** john.doe@company.com NOW gets**:**
- ✅ Roadmap email with PDF
- ✅ Calendar invite (ONE, recurring forever)

---

## FLOW 2: Daily Reminders (Automatic)

```
┌──────────────────────────────────┐
│ Every Day at 3:00 PM             │
│ (Google Calendar Automated)      │
└──────────────┬───────────────────┘
               │
        ┌──────┴─────┐
        │            │
        ▼            ▼
    ┌────────┐  ┌─────────────┐
    │ 2:00 PM│  │ 2:50 PM    │
    │ Email  │  │ Popup      │
    │Reminder│  │ Reminder   │
    ├────────┤  ├─────────────┤
    │"Your   │  │"Daily      │
    │event   │  │Learning    │
    │starts  │  │starts in   │
    │in      │  │10 minutes" │
    │60 min" │  │            │
    └────────┘  └─────────────┘
        │            │
        ▼            ▼
    📧 Inbox      🔔 Browser

    3:00 PM - Event shows in Calendar
    
    📅 Daily Learning: React Basics
       Your active module: React Basics
```

**Result:** john.doe@company.com gets reminders automatically from Google Calendar

---

## FLOW 3: User Completes Module

```
┌─────────────────────────────────────┐
│ User completes React Basics          │
│ (Button: "Mark as Complete")         │
└──────────────┬──────────────────────┘
               │
               ▼
   ┌─────────────────────────┐
   │ markModuleComplete()    │
   │ (Module Handler)        │
   └──────────┬──────────────┘
              │
              ▼
   ┌──────────────────────────────┐
   │ handleActiveModuleChange({   │
   │   userEmail: "john.doe@..."  │
   │   newActiveModuleTitle:      │
   │   "Next.js Fundamentals"     │
   │ })                           │
   └──────────┬───────────────────┘
              │
              ▼
   ┌──────────────────────────┐
   │ Update Existing Event:   │
   │ (NO new event)           │
   │                          │
   │ Title: 🎓 Daily Learning │
   │ Next.js Fundamentals     │
   │                          │
   │ Desc: Your active:       │
   │ Next.js Fundamentals     │
   └──────────┬───────────────┘
              │
              ▼
   john.doe@company.com NOW sees:
   
   📅 Daily Learning: Next.js Fundamentals
      (Same event, just refreshed)
      
   ✅ No new invitation email
   ✅ No new calendar event
   ✅ Same daily reminders start for this module
```

**Result:** Calendar event smoothly transitions to new module

---

## FLOW 4: Quiz Unlock (After ~7 days)

```
┌──────────────────────────────────┐
│ Scheduled Job (Daily 3 PM)       │
│ Checks quiz unlock condition     │
│ (70% of module time passed)      │
└──────────────┬───────────────────┘
               │
        ┌──────▼────────┐
        │               │
        ▼               ▼
   ✅ SHOULD         ❌ NOT YET
   UNLOCK            READY
   │                 │
   ▼                 └─→ Continue daily reminders
   
   Call:
   handleQuizUnlock({
     userEmail: "john.doe@...",
     moduleTitle: "React Basics"
   })
   │
   ▼
   ┌─────────────────────────┐
   │ Send Email ONLY:        │
   │ (NO calendar changes)   │
   └──────────┬──────────────┘
              │
              ▼
         ┌─────────────┐
         │ Email:      │
         │             │
         │ Subject:    │
         │ "Quiz       │
         │ Ready! 🎉"  │
         │             │
         │ Body:       │
         │ "Your React │
         │  Basics     │
         │  quiz is    │
         │  unlocked"  │
         │             │
         │ CTA:        │
         │ [Take Quiz] │
         │             │
         │ To:         │
         │ john.doe@..│
         └─────────────┘
              │
              ▼
         📧 Gmail 7:00 PM
         "Quiz Ready!"
         
    📅 Calendar:
       (NO CHANGE - still shows React Basics)
       (Daily reminders continue from existing event)
```

**Result:** Quiz unlock sent as simple email, reuses existing calendar event

---

## FLOW 5: Email Inbox Timeline

```
john.doe@company.com INBOX VIEW
═══════════════════════════════════════════════════════

📧 trainmate01@gmail.com
   "Your React Learning Roadmap is Ready! 🚀"
   Your 5-module roadmap has been generated...
   [View PDF]
   DAY 1 @ 2:00 PM ✅ SENT
   
──────────────────────────────────────────────────────

📅 Google Calendar <calendar-noreply>
   "Invitation: Daily Learning: React Basics"
   You're invited to attend: Daily Learning: React...
   [Accept] [Decline] [Maybe]
   DAY 1 @ 2:05 PM ✅ SENT
   
──────────────────────────────────────────────────────

📅 Google Calendar <calendar-noreply>
   "Reminder: Daily Learning: React Basics"
   Your event starts in 60 minutes
   DAY 2 @ 2:00 PM ✅ SENT (DAILY FOR 30 DAYS)
   
──────────────────────────────────────────────────────

📅 Google Calendar <calendar-noreply>
   "Reminder: Daily Learning: React Basics"
   Your event starts in 10 minutes
   DAY 2 @ 2:50 PM ✅ SENT (DAILY FOR 30 DAYS)
   
──────────────────────────────────────────────────────

📧 trainmate01@gmail.com
   "Your React Basics Quiz is Ready! 🎉"
   Great news! Your quiz has been unlocked...
   [Take Quiz Now]
   DAY 7 @ 3:00 PM ✅ SENT
   
──────────────────────────────────────────────────────

📅 Google Calendar <calendar-noreply>
   "Reminder: Daily Learning: Next.js Fundamentals"
   (Description & title changed, same event)
   DAY 31 @ 2:00 PM ✅ SENT (CONTINUES...)

═══════════════════════════════════════════════════════
```

---

## 🔑 KEY POINTS ABOUT NEW SYSTEM

### ✅ What Happens:
1. **Roadmap → Email + ONE Calendar Event**
   - Not multiple events
   - Email with PDF attachment
   - Calendar invite with recurrence

2. **Daily → Google Calendar Reminders** (automatic)
   - Email reminder 60 min before
   - Popup reminder 10 min before
   - Comes from Google, not your system

3. **Quiz Unlock → Email Only**
   - Simple email notification
   - Calendar event continues same
   - No new calendar invitations

4. **Module Change → Calendar Update**
   - Update description of existing event
   - No new event created
   - No new email sent

### 📧 Email Flow:
```
1. Roadmap generation:
   trainmate01@gmail.com → john.doe@company.com
   
2. Google Calendar invitations:
   calendar-noreply@google.com → john.doe@company.com
   (Automatic, 60 min before each day at 3 PM)
   
3. Quiz unlock:
   trainmate01@gmail.com → john.doe@company.com
```

### 📅 Calendar Flow:
```
1. One recurring event created when roadmap generated
2. That event recurs DAILY forever (or until deleted)
3. Description updates when module changes
4. Reminders set to: email (60 min) + popup (10 min)
```

---

## 🧪 How to Test

### Test 1: Roadmap Generation ✅
```bash
1. Open frontend
2. User: john.doe@company.com
3. Generate roadmap
4. Check john.doe@company.com email:
   ✅ Should see "Your Roadmap Ready" email
   ✅ Should see Google Calendar invitation
5. Accept calendar invitation
6. Check Google Calendar:
   ✅ Should see "Daily Learning: React Basics"
   ✅ Should see it repeats daily
```

### Test 2: Daily Reminders ✅  
```bash
1. At 2:00 PM next day:
   ✅ Check email → Should see reminder
2. At 2:50 PM next day:
   ✅ Check browser → Should see popup
3. At 3:00 PM next day:
   ✅ Check calendar → Should see event
```

### Test 3: Quiz Unlock ✅
```bash
1. Wait 7 days (or trigger manually)
2. Check email:
   ✅ Should see "Quiz Ready!" email
3. Check calendar:
   ✅ Should still show "React Basics" (no new event)
```

### Test 4: Module Change ✅  
```bash
1. Mark module as complete
2. (Would need handleActiveModuleChange implemented)
3. Check calendar:
   ✅ Should show new module title
   ✅ NO new event created
   ✅ NO new invitation sent
```

---
