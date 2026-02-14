# 🔄 Agentic Roadmap Regeneration with Weakness Analysis

## Overview
Comprehensive AI-powered roadmap regeneration system that analyzes quiz failures, identifies weak concepts, and creates personalized learning paths based on user performance and company documentation.

---

## ✨ Key Features Implemented

### 1. **Deep Weakness Analysis** 🎯
- ✅ Analyzes all quiz attempts from modules
- ✅ Extracts wrong questions (MCQ, One-Liners, Coding)
- ✅ Identifies weak concepts using AI pattern recognition
- ✅ Weights concepts by failure frequency
- ✅ Tracks scoring patterns across all attempts

**Technical Implementation:**
```javascript
// Extracts technical concepts from question text
function extractConceptsFromQuestion(questionText) {
  // Matches capitalized words (React, JavaScript, API)
  // Matches technical terms (function, class, async, etc.)
  // Returns normalized concepts for analysis
}
```

### 2. **Enhanced Learning Profile** 📊
**Previous:** Basic summary, struggling areas, mastered topics
**Now Includes:**
- `quizAttempts[]` - Complete attempt history with scores
- `wrongQuestions[]` - Detailed record of all incorrect answers
- `weakConcepts[]` - Ranked concepts with failure frequency
- `totalAttempts` - Count of all quiz attempts
- Pattern analysis across multiple modules

**Example Profile:**
```javascript
{
  summary: "User struggling with async programming | Component lifecycle unclear",
  strugglingAreas: ["async", "promises", "useEffect", "component lifecycle"],
  masteredTopics: ["JSX", "props", "state management"],
  avgScore: 62,
  quizAttempts: [
    { moduleId: "mod1", moduleTitle: "React Basics", score: 65, attemptNumber: 2 },
    { moduleId: "mod2", moduleTitle: "Advanced Hooks", score: 58, attemptNumber: 3 }
  ],
  wrongQuestions: [
    {
      type: "MCQ",
      question: "What is the purpose of useEffect hook?",
      correctAnswer: "To handle side effects",
      moduleTitle: "React Basics"
    }
  ],
  weakConcepts: [
    { concept: "useEffect", frequency: 5 },
    { concept: "async/await", frequency: 4 },
    { concept: "promises", frequency: 3 }
  ]
}
```

### 3. **Intelligent Roadmap Regeneration** 🧠

**Regeneration Triggers:**
- After EVERY failed quiz attempt (not just 3rd)
- Analyzes all past attempts, not just current one
- Uses company documentation for context
- Considers time spent and remaining days

**Regeneration Process:**
```
1. Calculate Days: currentDate - firstModule.createdAt
2. Analyze Weaknesses: Extract from all quiz attempts
3. Build Context: Wrong questions + weak concepts + company docs
4. Generate Plan: AI creates targeted queries for weak areas
5. Fetch Docs: Retrieve relevant company materials
6. Create Roadmap: AI generates optimized modules focusing on gaps
7. Store Metadata: Save weakness analysis for chatbot
8. Delete Incomplete: Remove old modules, keep completed ones
```

**AI Prompt Enhancement:**
```javascript
const weaknessContext = `
QUIZ WEAKNESS ANALYSIS:
- async/await (failed 5 times)
- useEffect (failed 4 times)
- promises (failed 3 times)

WRONG QUESTIONS PATTERNS:
- [MCQ] What is the purpose of useEffect hook?...
- [Coding] Implement async data fetching...
- [One-Liner] Explain Promise.all() behavior...

STRUGGLING AREAS: async, promises, useEffect
AVERAGE QUIZ SCORE: 62%
`;
```

### 4. **Intelligent Chatbot Welcome** 👋

**First Message After Regeneration:**
When user opens chatbot for the first time after roadmap regeneration (within 48 hours):

```
🔄 ROADMAP REGENERATION CONTEXT:
Your learning roadmap has been regenerated based on your quiz performance.

AREAS YOU STRUGGLED WITH:
async/await, useEffect, promises, component lifecycle, state management

AVERAGE QUIZ SCORE: 62%

SAMPLE QUESTIONS YOU GOT WRONG:
- What is the purpose of useEffect hook?...
- Implement async data fetching with error handling...
- Explain the difference between Promise.all() and Promise.race()...

I will focus our conversation on strengthening these areas. Let's start from 
the fundamentals and build your understanding step by step.
```

**Features:**
- ✅ Automatically detects first chat after regeneration
- ✅ Shows top 5 weak concepts
- ✅ Displays sample wrong questions
- ✅ Sets encouraging, supportive tone
- ✅ Only shown once (flag set after display)
- ✅ Expires after 48 hours

**Technical Implementation:**
```javascript
// Check if roadmap regenerated + first chat today
if (isFirstMessageToday && userData.roadmapRegenerated && userData.weaknessAnalysis) {
  const weakness = userData.weaknessAnalysis;
  const hoursSinceRegeneration = (new Date() - generatedAt) / (1000 * 60 * 60);
  
  if (hoursSinceRegeneration < 48) {
    // Show weakness welcome message
    // Clear flag after showing once
  }
}
```

---

## 📦 Data Structure

### Firestore: User Document
```javascript
{
  roadmapRegenerated: true,
  lastRegenerationDate: Timestamp,
  regenerationCount: 2,
  roadmapAgentic: {
    planQueries: ["async programming basics", "React hooks advanced"],
    planFocusAreas: ["Asynchronous JavaScript", "Hook lifecycle"],
    learningProfile: {
      summary: "...",
      strugglingAreas: ["async", "useEffect"],
      masteredTopics: ["JSX", "props"],
      avgScore: 62,
      weakConcepts: [{ concept: "async", frequency: 5 }],
      wrongQuestionsCount: 18,
      totalQuizAttempts: 6
    },
    regeneratedAfterFailure: true,
    remainingDays: 60,
    originalDays: 90,
    daysSpent: 30
  },
  weaknessAnalysis: {
    concepts: [
      { concept: "useEffect", frequency: 5 },
      { concept: "async/await", frequency: 4 }
    ],
    wrongQuestions: [
      {
        type: "MCQ",
        question: "What is useEffect?",
        correctAnswer: "Side effect handler",
        moduleTitle: "React Basics"
      }
    ],
    strugglingAreas: ["async", "promises"],
    avgScore: 62,
    generatedAt: Timestamp,
    welcomed: false, // Set to true after chatbot shows welcome
    welcomedAt: null
  }
}
```

### Roadmap Module Document
```javascript
{
  moduleTitle: "Mastering Async JavaScript",
  description: "Deep dive into promises, async/await...",
  estimatedDays: 7,
  skillsCovered: ["promises", "async/await", "error handling"],
  order: 5,
  completed: false,
  status: "pending",
  createdAt: Timestamp,
  regenerated: true,
  regenerationReason: "Quiz failure after 3 attempts",
  quizAttempts: 2, // Shows on button
  quizLocked: false,
  quizPassed: false,
  quizTimeUnlocked: true
}
```

---

## 🎯 User Flow

### Complete Regeneration Flow:
```
1. User fails quiz (Attempt 1) → Score 60%
   ├─ Backend: Analyzes wrong questions
   ├─ Backend: Records weak concepts (promises, async)
   ├─ Backend: Regenerates roadmap immediately
   ├─ Frontend: Shows "Regenerating roadmap..." animation
   └─ Frontend: Button shows "🔄 Retry Quiz (1/3)"

2. User reviews new roadmap
   ├─ Sees modules focused on weak areas
   ├─ Module titles reflect struggle points
   └─ Estimated days adjusted for remaining time

3. User opens chatbot
   ├─ Detects: First chat after regeneration
   ├─ Shows: Welcome message with weakness summary
   ├─ Lists: Top 5 weak concepts
   ├─ Shows: Sample wrong questions
   └─ Sets encouraging tone

4. User studies and retries (Attempt 2) → Score 68%
   ├─ Backend: Analyzes again
   ├─ Backend: Updates weak concepts
   ├─ Backend: Regenerates roadmap again (iterative improvement)
   └─ Frontend: Button shows "🔄 Retry Quiz (2/3)"

5. User retries (Attempt 3) → Score 72% → PASS ✅
   ├─ Backend: Marks module complete
   ├─ Backend: Updates mastered topics
   └─ Frontend: Button shows "✅ Quiz Passed"

6. If Attempt 3 fails → Score 65%
   ├─ Backend: Regenerates roadmap one final time
   ├─ Backend: Unlocks quiz, module, chatbot
   ├─ Backend: Sets requiresAdminContact flag
   └─ Frontend: Shows "Contact Admin" message
```

---

## 🔌 API Endpoints

### POST `/api/roadmap/regenerate`
**Request:**
```json
{
  "companyId": "comp123",
  "deptId": "IT",
  "userId": "user456",
  "moduleId": "mod789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Roadmap regenerated successfully with 5 new modules",
  "modules": [...],
  "daysSpent": 30,
  "remainingDays": 60,
  "completedModules": 3,
  "newModules": 5
}
```

---

## 🧪 Testing Scenarios

### Test 1: First Failure
1. Fail quiz with score 60%
2. Check: Roadmap regenerates
3. Check: Quiz button shows "Retry (1/3)"
4. Check: weaknessAnalysis stored in Firestore
5. Open chatbot → Should show welcome message

### Test 2: Second Failure
1. Retry quiz, score 65%
2. Check: Roadmap regenerates AGAIN
3. Check: Button shows "Retry (2/3)"
4. Check: Weak concepts updated with new failures

### Test 3: Third Failure
1. Retry quiz, score 62%
2. Check: Roadmap regenerates
3. Check: Everything unlocked (quiz, module, chatbot)
4. Check: "Contact Admin" message shown

### Test 4: Chatbot Welcome
1. After regeneration, open chatbot
2. Check: Welcome message appears with weakness summary
3. Send message, close chatbot
4. Reopen same day → Welcome should NOT appear again
5. Next day → Check welcomed flag = true

---

## 📊 Benefits

1. **Adaptive Learning**: Roadmap adjusts after every failure
2. **Data-Driven**: Based on actual quiz performance
3. **Concept-Focused**: Targets specific weak areas
4. **Time-Optimized**: Accounts for days spent
5. **Company-Aligned**: Uses company docs for context
6. **Supportive**: Chatbot provides encouraging guidance
7. **Transparent**: User sees exactly what they struggled with
8. **Iterative**: Gets smarter with each attempt

---

## 🚀 Frontend Integration Required

### Display Quiz Attempts:
- [x] Show attempt count on button: "Retry Quiz (2/3)"
- [x] Show "Quiz Passed" when quizPassed = true
- [x] Show "Quiz Locked" when quizLocked = true
- [x] Remove "Quiz Opened" state entirely

### Regeneration Animation:
- [x] Show spinner during regeneration
- [x] Display success message
- [x] Auto-refresh roadmap after regeneration

### Results Page:
- [x] Show regeneration status
- [x] Display unlock status after 3rd attempt
- [x] Show "Contact Admin" message

---

## 🎓 Key Improvements Over Previous System

| Aspect | Before | After |
|--------|--------|-------|
| Weakness Detection | Basic struggling areas | Deep concept analysis with frequency |
| Quiz Analysis | Only last attempt | All attempts across all modules |
| Regeneration Timing | Only after 3rd attempt | After EVERY failed attempt |
| Company Context | Generic | Targeted queries based on weaknesses |
| Chatbot Awareness | Generic greetings | Personalized weakness summary |
| Data Tracking | Minimal | Comprehensive attempt history |
| User Guidance | Generic retry message | Specific concept focus |

---

## 🔧 Configuration

**Constants:**
```javascript
MAX_QUIZ_ATTEMPTS = 3
WEAKNESS_WELCOME_EXPIRY = 48 hours
TOP_WEAK_CONCEPTS = 10
WRONG_QUESTIONS_SAMPLE = 5
```

**Firestore Collections:**
```
freshers/{companyId}/departments/{deptId}/users/{userId}/
├── roadmap/{moduleId}
│   ├── quiz/current
│   │   ├── quizAttempts/{attemptNumber}
│   │   └── results/latest
│   ├── chatSessions/{date}
│   └── agentMemory/summary
└── [user document with weaknessAnalysis]
```

---

## ✅ Implementation Checklist

- [x] Enhanced buildLearningProfile() with quiz analysis
- [x] Added extractConceptsFromQuestion() utility
- [x] Updated regenerateRoadmapAfterFailure() with weakness context
- [x] Store weaknessAnalysis in user document
- [x] Chatbot detects first message after regeneration
- [x] Chatbot shows personalized welcome message
- [x] Frontend displays correct quiz attempt count
- [x] Frontend shows regeneration animation
- [x] Backend calculates remaining days correctly
- [x] All metadata stored for analytics

---

## 📝 Notes

- Weakness analysis runs on regeneration (not every chat)
- Chatbot welcome shown once per regeneration
- Quiz attempts preserved even after completion
- Concept extraction uses regex + technical term matching
- System learns from all historical quiz data
- Time calculation based on first module's createdAt

---

**Last Updated:** February 13, 2026
**Status:** ✅ Fully Implemented and Tested
