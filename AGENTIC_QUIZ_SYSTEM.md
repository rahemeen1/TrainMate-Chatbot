# 🤖 Agentic AI Quiz System - Implementation Guide

## 📋 Overview

Comprehensive agentic AI quiz system with **AI-decided quiz structure**, **department-level coding controls**, intelligent scoring, retry mechanisms, and automatic roadmap regeneration based on performance.

---

## ✨ Features Implemented

### 1. **Agentic Quiz Generation**
- ✅ **AI decides quiz structure** - No hardcoded counts (8-20 MCQs, 3-10 One-liners, 0-3 Coding)
- ✅ **Department-controlled coding questions** - Companies enable/disable per department
- ✅ Dynamically adapts to module complexity
- ✅ Uses company training materials (90%) + personalized learning context (10%)
- ✅ Multi-query retrieval with agentic planning
- ✅ Quality critique loop ensures high-quality questions

### 2. **Coding Skill Testing**
- ✅ AI-powered code evaluation service (`codeEvaluator.service.js`)
- ✅ Evaluates correctness, logic, best practices, efficiency, readability
- ✅ Scores coding submissions 0-100 with detailed feedback
- ✅ Provides strengths and improvement suggestions
- ✅ Supports multiple programming languages (JavaScript, Python, Java, etc.)

### 3. **Intelligent Scoring**
- ✅ **Weighted scoring system**:
  - MCQs: 50%
  - One-liners: 25%
  - Coding: 25%
- ✅ **Threshold-based pass/fail**: 70% required to pass
- ✅ Score breakdown provided for each question type
- ✅ Semantic evaluation for text answers using LLM

### 4. **Retry Mechanism**
- ✅ **Up to 3 attempts** allowed per quiz
- ✅ Tracks attempt number and history
- ✅ Personalized feedback after each attempt
- ✅ Remediation plans generated for failed attempts
- ✅ Quiz locks after final failed attempt

### 5. **Automatic Roadmap Regeneration**
- ✅ **Triggers after EVERY failed attempt** (not just the 3rd)
- ✅ Calculates days spent (current date - module createdAt)
- ✅ Generates new roadmap with **remaining time**
- ✅ Considers:
  - Mastered topics from completed modules
  - Struggling areas from quiz performance
  - Skills gap analysis
  - User's learning profile
- ✅ Deletes incomplete modules and regenerates optimized path
- ✅ Preserves completed modules
- ✅ **After 3rd attempt**: Unlocks everything (quiz, module, chatbot) + prompts "Contact admin"

---

## 🏗️ Architecture

### Backend Files Modified/Created

#### **Created Files**
1. `services/codeEvaluator.service.js` - AI-powered code evaluation

#### **Modified Files**
1. `controllers/QuizController.js`
   - Added coding question generation
   - Enhanced quiz submission with retry logic
   - Integrated code evaluation
   - Added attempt tracking

2. `controllers/roadmap.controller.js`
   - Added `regenerateRoadmapAfterFailure()` function
   - Calculates days spent and remaining time
   - Generates optimized roadmap based on performance

3. `routes/roadmapRoutes.js`
   - Added `/regenerate` endpoint

---

## 📡 API Endpoints

### 1. Generate Quiz (Existing - Enhanced)
```http
POST /api/quiz/generate
```

**Request Body:**
```json
{
  "companyId": "string",
  "deptId": "string",
  "userId": "string",
  "moduleId": "string",
  "moduleTitle": "string (optional)"
}
```

**Response:**
```json
{
  "quizId": "current",
  "moduleTitle": "JavaScript Fundamentals",
  "mcq": [...],
  "oneLiners": [...],
  "coding": [...],  // NEW: Coding questions
  "hasCoding": true  // NEW: Indicates if coding questions exist
}
```

---

### 2. Submit Quiz (Existing - Enhanced)
```http
POST /api/quiz/submit
```

**Request Body:**
```json
{
  "companyId": "string",
  "deptId": "string",
  "userId": "string",
  "moduleId": "string",
  "quizId": "current",
  "answers": {
    "mcq": [
      { "id": "mcq-1", "selectedIndex": 2 }
    ],
    "oneLiners": [
      { "id": "ol-1", "response": "Answer text" }
    ],
    "coding": [  // NEW
      { 
        "id": "code-1", 
        "code": "function solution() { ... }" 
      }
    ]
  }
}
```

**Response:**
```json
{
  "score": 75,
  "passed": true,
  "message": "Congratulations! You passed...",
  "allowRetry": false,
  "attemptNumber": 1,
  "maxAttempts": 3,
  "requiresRoadmapRegeneration": false,  // Only true if failed
  "unlockEverything": false,  // NEW: true after 3rd failed attempt
  "contactAdmin": false,  // NEW: true after 3rd failed attempt
  "mcq": [...],
  "oneLiners": [...],
  "coding": [  // NEW: Coding results with feedback
    {
      "id": "code-1",
      "isCorrect": true,
      "score": 85,
      "feedback": "Good solution...",
      "strengths": ["Clean code", "Efficient algorithm"],
      "improvements": ["Add error handling"]
    }
  ],
  "scoreBreakdown": {  // NEW
    "mcqScore": 80,
    "oneLinerScore": 70,
    "codingScore": 85
  }
}
```

---

### 3. Regenerate Roadmap (NEW)
```http
POST /api/roadmap/regenerate
```

**Request Body:**
```json
{
  "companyId": "string",
  "deptId": "string",
  "userId": "string",
  "moduleId": "string"  // Failed module ID
}
```

**Response:**
```json
{
  "success": true,
  "message": "Roadmap regenerated successfully...",
  "modules": [...],  // New modules
  "daysSpent": 25,
  "remainingDays": 65,
  "completedModules": 3,
  "newModules": 5
}
```

---

## 🎯 User Flow

### Scenario 1: Pass Quiz on First Attempt
```
1. User attempts quiz → Score 80% → PASS ✅
2. Module marked complete
3. User proceeds to next module
``` (NEW FLOW)
```
1. User attempts quiz → Score 55% (Attempt 1/3) → FAIL ❌
2. System REGENERATES roadmap immediately 🔄
3. Message: "Roadmap regenerated. Retry when you feel ready. (2 attempts remaining)"
4. User reviews new roadmap and studies
5. User retries quiz → Score 75% (Attempt 2/3) → PASS ✅
6. Module marked complete
```

### Scenario 3: Three Failed Attempts (NEW FLOW)
```
1. Attempt 1 → Score 60% → FAIL ❌
   └─ Roadmap regenerated 🔄
   └─ Message: "Retry when ready. (2 attempts remaining)"

2. Attempt 2 → Score 65% → FAIL ❌
   └─ Roadmap regenerated 🔄
   └─ Message: "Retry when ready. (1 attempt remaining)"

3. Attempt 3 → Score 62% → FAIL ❌
   └─ Roadmap regenerated 🔄
   └─ Quiz UNLOCKED 🔓
   └─ Module UNLOCKED 🔓
   └─ Chatbot UNLOCKED 🔓
   └─ Message: "All resources unlocked. Please contact your company admin for guidance." weak areas
7. Deletes incomplete modules, adds new modules
8. User receives notification with new learning path
```

---

## 🎨 Frontend Integration Guide

### 1. **Quiz Component Updates**

#### Display Coding Questions
```jsx
// In ModuleQuiz.jsx or similar
{quiz.hasCoding && quiz.coding?.map((question) => (
  <div key={question.id} className="coding-question">
    <h3>{question.question}</h3>
    <div className="code-editor">
      <textarea
        value={codingAnswers[question.id] || ""}
        onChange={(e) => handleCodingAnswer(question.id, e.target.value)}
        placeholder="Write your code here..."
        rows={10}
        className="font-mono"
      />
    </div>
    {question.hints && question.hints.length > 0 && (
      <details>
        <summary>💡 Hints</summary>
        <ul>
          {question.hints.map((hint, i) => (
            <li key={i}>{hint}</li>
          ))}
        </ul>
      </details>
    )}
  </div>
))}
```

#### Submit Quiz with Coding Answers
```javascript
const handleSubmitQuiz = async () => {
  const payload = {
    companyId,
    deptId,
    userId,
    moduleId,
    quizId: "current",
    answers: {
      mcq: mcqAnswers,
      oneLiners: oneLinerAnswers,
      coding: Object.entries(codingAnswers).map(([id, code]) => ({
        id,
        code,
      })),
    },
  };

  const response = await fetch("/api/quiz/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  
  // Handle results
  if (result.passed) {
    showSuccess(result.message);
  } else if (result.allowRetry) {
    showRetryOption(result.message, result.attemptNumber, result.maxAttempts);
  } else if (result.requiresRoadmapRegeneration) {
    showRegenerationNotice(result.message);
    // Optionally trigger regeneration automatically
    await regenerateRoadmap();
  }
};
```

### 2. **Results Display**

#### Show Score Breakdown
```jsx
<div className="score-breakdown">
  <h3>Score Breakdown</h3>
  <div className="scores">
    <div className="score-item">
      <span>MCQ Score:</span>
      <span>{result.scoreBreakdown.mcqScore}%</span>
    </div>
    <div className="score-item">
      <span>One-liner Score:</span>
      <span>{result.scoreBreakdown.oneLinerScore}%</span>
    </div>
    {result.scoreBreakdown.codingScore && (
      <div className="score-item">
        <span>Coding Score:</span>
        <span>{result.scoreBreakdown.codingScore}%</span>
      </div>
    )}
  </div>
  <div className="final-score">
    <span>Final Score:</span>
    <span className={result.passed ? "text-green-400" : "text-red-400"}>
      {result.score}%
    </span>
  </div>
</div>
```

#### Show Coding Feedback
```jsx
{result.coding?.map((codingResult) => (
  <div key={codingResult.id} className="coding-result">
    <h4>{codingResult.question}</h4>
    <div className={`score ${codingResult.isCorrect ? 'correct' : 'incorrect'}`}>
      Score: {codingResult.score}/100
    </div>
    <p className="feedback">{codingResult.feedback}</p>
    
    {codingResult.strengths.length > 0 && (
      <div className="strengths">
        <h5>✅ Strengths:</h5>
        <ul>
          {codingResult.strengths.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
    )}
    
    {codingResult.improvements.length > 0 && (
      <div className="improvements">
        <h5>💡 Areas for Improvement:</h5>
        <ul>
          {codingResult.improvements.map((imp, i) => (
            <li key={i}>{imp}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
))}
```

### 3. **Retry Modal**
```jsx
{showRetryModal && (
  <div className="retry-modal">
    <h2>Quiz Not Passed</h2>
    <p>{result.message}</p>
    <div className="attempts">
      Attempt {result.attemptNumber} of {result.maxAttempts}
    </div>
    
    {result.requiresRoadmapRegeneration && (
      <div className="regeneration-notice">
        <span className="icon">🔄</span>
        <p>Your learning roadmap has been regenerated based on your performance.</p>
      </div>
    )}
    
    <div className="actions">
      <button onClick={handleReviewRoadmap}>
        📚 Review New Roadmap
      </button>
      <button onClick={handleRetryWhenReady}>
        ✅ I'm Ready to Retry
      </button>
    </div>
  </div>
)}

{showContactAdmin && (
  <div className="admin-contact-modal">
    <h2>Additional Support Needed</h2>
    <p>{result.message}</p>
    <div className="unlock-notice">
      <p>✅ Quiz unlocked</p>
      <p>✅ Module unlocked</p>
      <p>✅ Chatbot unlocked</p>
    </div>
    <p>All learning resources are now available. Please contact your company admin for personalized guidance.</p>
    <button onClick={contactAdmin}>
      📧 Contact Admin
    </buttondleQuizSubmit = async () => {
  const response = await fetch("/api/quiz/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId, deptId, userId, moduleId, quizId: "current",
      answers: { mcq, oneLiners, coding }
    }),
  });

  const result = await response.json();
  
  if (result.passed) {
    showSuccess(result.message);
    navigate("/next-module");
  } else {
    // EVERY FAILED ATTEMPT triggers regeneration
    if (result.requiresRoadmapRegeneration) {
      showInfo("Regenerating your learning roadmap...");
      await regenerateRoadmap();
    }
    
    if (result.unlockEverything) {
      // After 3rd failed attempt
      showWarning(result.message);
      showContactAdminButton();
      // All resources are now unlocked automatically
    } else {
      // Still have retries
      showRetryModal(result.message, result.attemptNumber, result.maxAttempts);
    }
  }
};

const regenerateRoadmap = async () => {
  try {
    const response = await fetch("/api/roadmap/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, deptId, userId, moduleId }),
    });

    const result = await response.json();
    
    if (result.success) {
      showSuccess("Roadmap regenerated! Review the new materials.");
      await fetchRoadmap(); // Refresh roadmap display
    }
  } catch (error) {
    showError("Roadmap regeneration failed"dmap();
      // Navigate to new roadmap
      navigate("/roadmap");
    }
  } catch (error) {
    showError("Roadmap regeneration failed");
  } finally {
    setLoading(false);
  }
};
```

---

## 🔧 Configuration

### Department Settings (NEW)
Control quiz features per department through Firestore:
```javascript
freshers/{companyId}/departments/{deptId}
{
  quizSettings: {
    allowCodingQuestions: true|false,  // Enable/disable coding questions
    updatedAt: timestamp
  }
}
```

**API Endpoints:**
- `PUT /api/company/department/settings` - Update settings
- `GET /api/company/department/settings` - Get settings

**Example Usage:**
```bash
# Disable coding questions for HR department
curl -X PUT http://localhost:5000/api/company/department/settings \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "acme-corp",
    "deptId": "hr",
    "quizSettings": { "allowCodingQuestions": false }
  }'
```

### AI Quiz Structure (Dynamic)
AI decides optimal question counts based on:
- **Module complexity** - Simple vs. complex topics
- **Content depth** - Amount of training material
- **Department settings** - Coding allowed or not
- **Recommended ranges:**
  - MCQs: 8-20 questions
  - One-liners: 3-10 questions
  - Coding: 0-3 questions (if department allows)

### Legacy Constants (Removed)
```javascript
// ❌ OLD: Hardcoded counts
const QUIZ_COUNTS = { mcq: 15, oneLiners: 5, coding: 2 };

// ✅ NEW: AI-decided, flexible validation
const QUIZ_PASS_THRESHOLD = 70; // Percentage required to pass
const MAX_QUIZ_ATTEMPTS = 3; // Maximum retry attempts
```

---

## 📊 Firestore Structure

### Quiz Attempts
```
freshers/{companyId}/departments/{deptId}/users/{userId}/roadmap/{moduleId}/quizAttempts/
  ├─ attempt-1/
  │   ├─ attemptNumber: 1
  │   ├─ score: 65
  │   ├─ passed: false
  │   ├─ mcqScore: 70
  │   ├─ oneLinerScore: 60
  │   ├─ codingScore: 55
  │   └─ submittedAt: timestamp
  ├─ attempt-2/
  └─ attempt-3/
```

### Remediation Plans
```
freshers/{companyId}/departments/{deptId}/users/{userId}/roadmap/{moduleId}/quiz/current/remediation/
  ├─ attempt-1/
  │   ├─ summary: "Focus on async programming..."
  │   ├─ focusAreas: ["promises", "async/await"]
  │   ├─ actions: ["Review module", "Practice coding"]
  │   └─ recommendedRetryInDays: 2
```

---

## 🚀 Testing Guide

### 1. Test Quiz Generation
```bash
# Generate quiz for a coding module
curl -X POST http://localhRoadmap adjusts after every failed attempt
2. **User-Paced Retries**: "Retry when you feel ready" approach
3. **Comprehensive Assessment**: Tests knowledge, application, and coding skills
4. **Progressive Support**: More help with each failed attempt
5. **Safety Net**: After 3 failures, everything unlocks for continued learning
6. **Admin Escalation**: Clear path to get human support when needed
7. **Time Optimization**: Accounts for time spent, maximizes remaining time
8. **Personalized Feedback**: Detailed feedback on every question type
9. **Skill Gap Focus**: Each regeneration
    "moduleTitle": "JavaScript Programming"
  }'
```

### 2. Test Quiz Submission (Pass)
```bash
curl -X POST http://localhost:5000/api/quiz/submit \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "test-company",
    "deptId": "engineering",
    "userId": "user123",
    "moduleId": "module-js-basics",
    "quizId": "current",
    "answers": {
      "mcq": [{"id": "mcq-1", "selectedIndex": 0}],
      "oneLiners": [{"id": "ol-1", "response": "correct answer"}],
      "coding": [{"id": "code-1", "code": "function test() { return true; }"}]
    }
  }'Quiz structure is AI-decided** - No fixed counts, adapts to module complexity
- **Coding questions are department-controlled** - Enable/disable per department
- **Threshold is configurable** - Default 70%, can be adjusted
- **Retry limit is configurable** - Default 3 attempts
- **Roadmap regeneration is automatic** - Triggers after final failed attempt
- **Days calculation is precise** - Uses actual createdAt timestamps
- **All evaluations use AI** - Ensures accurate, context-aware scoring
- **Flexible validation** - Accepts any reasonable question counts within ranges
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "test-company",
    "deptId": "engineering",
    "userId": "user123",
    "moduleId": "failed-module-id"
  }'
```

---

## 🎓 Key Benefits

1. **Adaptive Learning**: System adjusts to user performance
2. **Comprehensive Assessment**: Tests knowledge, application, and coding skills
3. **Fair Retry System**: Gives learners multiple chances to succeed
4. **Intelligent Recovery**: Auto-regenerates optimized path after repeated failures
5. **Time Optimization**: Accounts for time spent, maximizes remaining time
6. **Personalized Feedback**: Detailed feedback on every question type
7. **Skill Gap Focus**: New roadmap targets identified weak areas

---

## 📝 Notes

- **Coding questions are optional** - System auto-detects based on module content
- **Threshold is configurable** - Default 70%, can be adjusted
- **Retry limit is configurable** - Default 3 attempts
- **Roadmap regeneration is automatic** - Triggers after final failed attempt
- **Days calculation is precise** - Uses actual createdAt timestamps
- **All evaluations use AI** - Ensures accurate, context-aware scoring

---

## 🔮 Future Enhancements

1. **Live Code Execution**: Run code in sandboxed environment
2. **Test Case Validation**: Validate code against pre-defined test cases
3. **Peer Review**: Allow mentors to manually review borderline cases
4. **Adaptive Difficulty**: Adjust quiz difficulty based on attempts
5. **Progress Visualization**: Show learning curve over time
6. **Skills Mastery Graph**: Visual representation of skill improvements

---

**Implementation Complete! 🎉**

All backend endpoints are functional and ready for frontend integration.
