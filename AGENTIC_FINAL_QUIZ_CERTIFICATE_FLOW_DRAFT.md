# Agentic Final Quiz + Certificate Flow (Draft, Not Integrated)

Status: Draft only. This file is intentionally separate and does not change existing runtime behavior.

## 1) Objective
Implement a final certification gate after roadmap completion:
- Unlock Claim Certificate only after final quiz pass
- Open final quiz for 2 days
- Send user email when final quiz opens
- Use agentic, comprehensive quiz generation (MCQ + one-liners + coding)
- On pass, unlock certificate immediately
- Show final quiz instructions before starting

## 2) Agreed Product Rules
- Attempts: 2
- Pass threshold: 70%
- Quiz format: MCQ + one-liners + coding
- Certificate unlock: immediate on pass
- Email: dedicated final-quiz-opened template

## 3) Firestore Data Contract (User Document)
Path:
- freshers/{companyId}/departments/{deptId}/users/{userId}

Proposed fields:
```json
{
  "certificateUnlocked": false,
  "certificateUnlockedAt": null,
  "certificateFinalQuizScore": null,
  "finalAssessment": {
    "status": "locked",
    "openedAt": null,
    "deadlineAt": null,
    "maxAttempts": 2,
    "attemptsUsed": 0,
    "passThreshold": 70,
    "emailSentAt": null,
    "lastAttemptAt": null,
    "lastScore": null,
    "quizId": null
  }
}
```

Allowed finalAssessment.status values:
- locked
- open
- passed
- failed
- expired

## 4) New API Contract (Draft)
Base: /api/quiz

### 4.1 POST /final/open
Purpose:
- Open final quiz if all modules are truly completed
- Set 2-day deadline
- Send email once

Request:
```json
{
  "companyId": "...",
  "deptId": "...",
  "userId": "..."
}
```

Response:
```json
{
  "ok": true,
  "status": "open",
  "deadlineAt": "ISO_DATE",
  "maxAttempts": 2,
  "passThreshold": 70,
  "emailSent": true
}
```

### 4.2 POST /final/generate
Purpose:
- Generate comprehensive agentic final quiz
- Enforce status=open, attempts, deadline

Request:
```json
{
  "companyId": "...",
  "deptId": "...",
  "userId": "..."
}
```

Response:
```json
{
  "quizId": "final-...",
  "type": "final",
  "passThreshold": 70,
  "deadlineAt": "ISO_DATE",
  "attemptsLeft": 2,
  "mcq": [],
  "oneLiners": [],
  "coding": []
}
```

### 4.3 POST /final/submit
Purpose:
- Evaluate final quiz
- Increment attempts
- Unlock certificate immediately on pass

Request:
```json
{
  "companyId": "...",
  "deptId": "...",
  "userId": "...",
  "quizId": "final-...",
  "answers": {
    "mcq": [],
    "oneLiners": [],
    "coding": []
  }
}
```

Response:
```json
{
  "ok": true,
  "score": 74,
  "passed": true,
  "attemptsUsed": 1,
  "attemptsLeft": 1,
  "finalStatus": "passed",
  "certificateUnlocked": true
}
```

## 5) Agentic Architecture (Practical)
Use AI where it helps; keep cert decision deterministic.

### 5.1 Eligibility Agent (deterministic-first)
Inputs:
- roadmap module statuses
- expired/completed states

Decision:
- Allow open only if all modules are completed and none pending/in-progress/expired

### 5.2 Composition Agent (LLM)
Inputs:
- roadmap topics
- prior quiz weaknesses
- difficulty target

Output schema:
- strict JSON with mcq, oneLiners, coding
- bounded counts and coverage tags

### 5.3 Evaluation Agent
- MCQ: deterministic compare
- One-liners: rubric-based LLM scoring with justification
- Coding: test-based score + LLM explanation

### 5.4 Certification Gate (deterministic)
Unlock certificate only if all true:
- finalAssessment.status is open
- now <= deadlineAt
- attemptsUsed <= maxAttempts
- score >= passThreshold

## 6) Pseudocode (Backend Draft)
```js
// final/open
if (!allModulesCompleted(userRoadmap)) return reject("Complete all modules first");
if (finalAssessment.status === "passed") return alreadyPassed();

if (finalAssessment.status !== "open") {
  set finalAssessment = {
    status: "open",
    openedAt: now,
    deadlineAt: now + 2 days,
    maxAttempts: 2,
    attemptsUsed: 0,
    passThreshold: 70
  };
}

if (!finalAssessment.emailSentAt) {
  sendFinalQuizOpenedEmail(...);
  finalAssessment.emailSentAt = now;
}

return openPayload();
```

```js
// final/generate
assert(finalAssessment.status === "open");
assert(now <= deadlineAt);
assert(attemptsUsed < maxAttempts);

quiz = agenticComposeFinalQuiz(context);
validateQuizSchema(quiz);
saveQuiz(finalQuizPath);
return quiz;
```

```js
// final/submit
assert(finalAssessment.status === "open");
if (now > deadlineAt) markExpired();

result = evaluateFinalQuiz(answers, quiz);
attemptsUsed += 1;

if (result.score >= passThreshold) {
  finalAssessment.status = "passed";
  user.certificateUnlocked = true;
  user.certificateUnlockedAt = now;
  user.certificateFinalQuizScore = result.score;
} else if (attemptsUsed >= maxAttempts) {
  finalAssessment.status = "failed";
}

saveResult();
return resultPayload();
```

## 7) Frontend Flow Draft
### 7.1 Sidebar Claim Certificate behavior
- If certificateUnlocked=true: route to /certificate
- Else if finalAssessment.status=open: route to final quiz instructions screen
- Else: disabled with tooltip:
  - locked: Complete all modules to open final quiz
  - failed/expired: Contact admin or retake policy message

### 7.2 Final Quiz Instructions screen
Show before starting final quiz:
- Attempts allowed: 2
- Pass threshold: 70%
- Deadline date/time
- Quiz sections: MCQ + one-liners + coding
- Integrity rules and timer expectations

CTA:
- Start Final Quiz

### 7.3 Final Results screen
- Passed: certificate unlocked now, show Go to Certificate button
- Failed with attempts left: show attempts left + targeted guidance
- Failed exhausted/expired: show locked state explanation

## 8) Dedicated Email Template Draft
Subject:
- Final Certification Quiz Opened - Action Required

Body must include:
- User name
- Company/training name
- Deadline exact date/time
- Attempts: 2
- Pass threshold: 70%
- Start now call-to-action

## 9) Safety + Anti-Regression Rules
- Never unlock certificate from module completion alone
- Never open final quiz if module status includes expired/pending/in-progress
- Never send opening email twice for same open window
- Final submit must reject after deadline
- Once passed, certificate remains unlocked

## 10) Suggested File Touch Plan (When You Approve)
Backend:
- trainmate-backend/routes/quizRoutes.js
- trainmate-backend/controllers/QuizController.js
- trainmate-backend/services/emailService.js

Frontend:
- frontend/src/components/Fresher/FresherSideMenu.jsx
- frontend/src/components/Fresher/Certificate.jsx
- frontend/src/App.js
- new final-quiz instruction + view components (separate files)

## 11) Manual Test Matrix (After Integration)
1. All modules completed -> final quiz opens -> email sent once
2. Generate final quiz within window -> succeeds
3. Submit with score >= 70 -> certificateUnlocked=true
4. Submit fail with attempts left -> no unlock
5. Exhaust attempts -> status=failed
6. Deadline passed before submit -> status=expired
7. Sidebar button routes correctly for all statuses

---
This draft is intentionally non-invasive. No existing production files were modified by this document.
