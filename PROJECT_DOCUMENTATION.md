# TrainMate - Complete Project Documentation

**Last Updated:** April 15, 2026  
**Version:** 1.0  
**Status:** Production Ready

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [AI Agents Summary](#ai-agents-summary)
4. [Agent Orchestrator Pattern](#agent-orchestrator-pattern) ⭐ **NEW**
5. [System Flows](#system-flows)
6. [Data Models](#data-models)
7. [API Endpoints](#api-endpoints)
8. [Key Features](#key-features)
9. [Agentic vs Generative AI](#agentic-vs-generative-ai)

---

## 🎯 Project Overview

**TrainMate** is a corporate training platform that uses AI-powered agents to create personalized learning roadmaps for freshers joining companies.

### Core Purpose
- Generate personalized learning roadmaps based on CV, company requirements, and expertise level
- Create dynamic quizzes with AI-driven evaluation
- Provide intelligent notifications and reminders
- Track learning progress and provide AI insights
- Support multiple departments and training topics

### Tech Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** Firebase (Firestore)
- **AI Models:** Gemini 2.5-Flash
- **Embeddings:** Cohere
- **Vector DB:** Pinecone
- **Calendar Integration:** Google Calendar API
- **Email:** SMTP

---

## 🏗️ Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        TRAINMATE PLATFORM                        │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  FRONTEND (UI)   │         │  BACKEND (API)   │         │  EXTERNAL APIS   │
├──────────────────┤         ├──────────────────┤         ├──────────────────┤
│ React Components │────────▶│ Express Routes   │────────▶│ Gemini AI        │
│ Landing Page     │         │ Controllers      │         │ Google Calendar  │
│ Onboarding      │         │                  │         │ Google Auth      │
│ Dashboard       │         │ 22+ AI Agents    │         │ Cohere Embed     │
│ Roadmap View    │         │                  │         │ Pinecone VectorDB│
│ Quiz Interface  │         │ Services         │         │ SMTP Email       │
│ Chat Module     │         │ - llmService     │         └──────────────────┘
│ Analytics       │         │ - agenticSE      │
└──────────────────┘         │ - aiNotifications│
                             │ - skillExtractor│
                             │ - cvParser       │
                             │ - pineconeService
                             │ - codeEvaluator │
                             │ - calendarService
                             │ - emailService   │
                             └──────────────────┘
                                     │
                                     ▼
                             ┌──────────────────┐
                             │    FIRESTORE     │
                             ├──────────────────┤
                             │ Companies        │
                             │ Departments      │
                             │ Users/Freshers   │
                             │ Roadmaps         │
                             │ Quizzes          │
                             │ Progress         │
                             │ Learning History │
                             └──────────────────┘
```

### Microservices Architecture

```
CONTROLLERS (Request Handlers)
├─ roadmap.controller.js      → Roadmap generation flow
├─ chatController.js           → Chat & learning assistance
├─ QuizController.js           → Quiz generation & evaluation
├─ aiInsightsController.js     → AI-powered learner insights
├─ companyFresherChatController.js → Company analytics dashboard
└─ googleAuthController.js     → OAuth authentication

SERVICES (Business Logic)
├─ AGENTIC SERVICES (Decision Making)
│  ├─ agenticSkillExtractor.service.js    → 3 agentic agents
│  ├─ aiAgenticNotificationService.js     → 7 notification agents
│  └─ (Embedded in controllers)            → Roadmap, Quiz agents
│
├─ GENERATIVE SERVICES (Content Creation)
│  ├─ llmService.js                       → Roadmap generation
│  ├─ gemini.service.js                   → Accomplishment text
│  └─ codeEvaluator.service.js            → Code evaluation
│
├─ SUPPORT SERVICES
│  ├─ pineconeService.js                  → Vector search
│  ├─ cvParser.service.js                 → CV parsing
│  ├─ calendarService.js                  → Google Calendar
│  ├─ emailService.js                     → Email notifications
│  ├─ memoryService.js                    → Agent memory tracking
│  ├─ confidenceService.js                → Confidence scoring
│  ├─ skillExtractor.service.js           → Regex-based skill extraction
│  └─ notificationService.js              → Notification orchestration
│
└─ KNOWLEDGE SERVICES (External Learning)
   ├─ devto.js
   ├─ stackoverflow.js
   ├─ mdn.js
   └─ knowledgeAggregator.js
```

---

## 🤖 AI Agents Summary

### Total Agents: 22+

#### **Agentic AI Agents (12 agents)** 
*Make intelligent decisions based on data analysis*

1. **CV Skills Agent** - Analyzes CV for technical skills
2. **Company Skills Agent** - Extracts company documentation requirements
3. **Skill Gap Analysis Agent** - Prioritizes critical skill gaps
4. **Roadmap Planning Agent** - Decides retrieval strategy (2-4 queries)
5. **Roadmap Critique Agent** - Validates roadmap quality (0-100 score)
6. **Roadmap Refinement Agent** - Fixes roadmap issues iteratively
7. **Notification Strategy Agent** - Decides when/how to send notifications
8. **User Engagement Analysis Agent** - Analyzes learning patterns
9. **Learner Insights Agent** - Provides personalized recommendations
10. **Code Evaluation Agent** - Evaluates coding solutions
11. **One-Liner Evaluation Agent** - Grades short-form answers
12. **Quiz Generation Decision Agent** - Decides quiz difficulty & question types

#### **Generative AI Agents (10 agents)**
*Create new content based on prompts*

1. **Roadmap Generation Agent** - Creates learning modules with descriptions
2. **Roadmap Refinement Agent** - Rewrites modules based on feedback
3. **Quiz Question Generation Agent** - Generates MCQ, one-liners, coding questions
4. **Remediation Plan Agent** - Creates recovery strategies for failed concepts
5. **Certificate Title Agent** - Generates personalized certificate titles
6. **Daily Agenda Agent** - Creates daily learning plans
7. **Personalized Email Content Agent** - Generates subject lines & preview text
8. **Module Explanation Agent** - Generates detailed module content
9. **Accomplishment Text Agent** - Generates achievement descriptions
10. **CV Parser Agent** - Structures CV data extraction

### Agent Specialization Matrix

```
┌─────────────────────┬──────────────┬──────────────┐
│ Agent Type          │ Count        │ Purpose      │
├─────────────────────┼──────────────┼──────────────┤
│ Extraction (Agentic)│ 3            │ Analyze      │
│ Planning (Agentic)  │ 4            │ Strategy     │
│ Decision (Agentic)  │ 5            │ Decide       │
│ Generation          │ 10           │ Create       │
│ Evaluation (Agentic)│ 2            │ Assess       │
└─────────────────────┴──────────────┴──────────────┘
```

---

## 🎯 Agent Orchestrator Pattern

### What is Agent Orchestrator?

**Agent Orchestrator** is a meta-agent controller that intelligently plans and executes multi-agent workflows. Instead of hardcoded sequences, it:

1. **Receives a goal** - "Generate personalized learning roadmap"
2. **Plans execution** - Decides which agents to call and in what order (Planner Agent)
3. **Executes dynamically** - Calls agents, validates outputs, handles failures
4. **Validates quality** - Checks each output independently (Validator Agent)
5. **Aggregates results** - Combines outputs into final response (Aggregator Agent)
6. **Logs decisions** - Creates audit trail of all agent decisions

### Architecture: Scripted vs Orchestrator

#### ❌ **Current: Scripted Workflow**

```javascript
// Direct calls - hardcoded sequence
const cvSkills = await extractCVSkills(cvText);
const companySkills = await extractCompanySkills(docs);
const gaps = await analyzeGaps(cvSkills, companySkills);
const queries = await planRetrieval(gaps);
const docs = await retrieveDocuments(queries);
const roadmap = await generateRoadmap(docs);
// If Step 3 fails, entire flow fails
// No adaptation, error handling is manual
```

#### ✅ **Proposed: Agent Orchestrator**

```javascript
// Single orchestrator call - AI plans execution
const result = await orchestrator.orchestrate(
  'Generate personalized learning roadmap',
  { cvText, expertise, trainingOn, ... }
);

/* Orchestrator:
   1. Planner Agent: Decision → Need agents [CV Skills, Company Skills, Gap Analysis, Retrieval, Generation, Validation]
   2. CV Skills Agent: Extract → Returns skills
   3. Company Skills Agent: Extract → Returns requirements
   4. Gap Analysis Agent: Analyze → Returns gaps + priorities
   5. Retrieval Agent: Fetch → Returns documents
   6. Validator Agent: Check → Is company skills output high quality? (No → Agent retries)
   7. Generation Agent: Create → Returns roadmap
   8. Validator Agent: Check → Is roadmap valid? (No → Recovery Agent fixes)
   9. Aggregator Agent: Combine → Returns final output
*/
```

### Key Advantages

| Feature | Scripted | Orchestrator |
|---------|----------|--------------|
| **Execution** | Hardcoded sequence | Intelligent planning |
| **Error Handling** | Fail fast | Auto-retry + pivot |
| **Observability** | Code trace | Decision tree log |
| **Cost** | All agents called | Only needed agents |
| **Extensibility** | Change code | Register agent + done |
| **Resilience** | Manual handling | Inherent error recovery |
| **Learning** | None | Track agent decisions |

### Core Components

#### 1. **AgentOrchestrator Service**

```javascript
// services/agentOrchestrator.service.js
class AgentOrchestrator {
  async orchestrate(goal, context) {
    // 1. Generate plan
    const plan = await this.generatePlan(goal, context);
    
    // 2. Execute with validation
    const results = await this.executePlan(plan, context);
    
    // 3. Aggregate
    const output = await this.aggregateResults(results);
    
    return output;
  }
  
  registerAgent(name, agentFn) { ... }
}
```

#### 2. **Agent Registry**

```javascript
// services/agentRegistry.js
initializeAgentRegistry() {
  orchestrator.registerAgent('extract-cv-skills', cvSkillsAgent);
  orchestrator.registerAgent('extract-company-skills', companySkillsAgent);
  orchestrator.registerAgent('generate-roadmap', roadmapAgent);
  // ... register all agents
}
```

#### 3. **Simplified Controller**

```javascript
// controllers/roadmap.controller.orchestrator.js
export const generateUserRoadmap = async (req, res) => {
  // 1. Validate & prepare context
  // 2. Call orchestrator (replaces 200+ lines of logic!)
  const result = await orchestrator.orchestrate(goal, context);
  // 3. Save & notify
};
```

### Agent Orchestrator Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  REQUEST: "Generate personalized learning roadmap"              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  🤖 PLANNER AGENT (Agentic Decision-Making)                     │
├─────────────────────────────────────────────────────────────────┤
│  Analyzes: Goal, available agents, user context                 │
│  Decides: Which agents needed + order + dependencies            │
│  Output: Execution Plan                                          │
│  {                                                               │
│    steps: [                                                      │
│      {agent: "extract-cv-skills", critical: true},             │
│      {agent: "retrieve-company-docs", critical: true},         │
│      {agent: "analyze-gaps", critical: true},                  │
│      {agent: "generate-roadmap", critical: true},              │
│      {agent: "validate-roadmap", critical: false}              │
│    ],                                                            │
│    errorStrategy: "retry|skip_non_critical|pivot"              │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  EXECUTION LOOP (For each step in plan)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: extract-cv-skills                                      │
│  ├─ Call Agent                                                  │
│  ├─ 🔍 Validator: Check output quality (score > 60?)           │
│  │   ✅ Pass → Continue                                         │
│  │   ❌ Fail → Retry (max 2x) OR skip if non-critical         │
│  └─ Result: { cvSkills: [...] }                                │
│                                                                  │
│  Step 2: retrieve-company-docs                                  │
│  ├─ Call Agent                                                  │
│  ├─ 🔍 Validator: Check relevance                              │
│  │   ✅ Pass → Continue                                         │
│  │   ❌ Fail → 🔧 Recovery Agent: Pivot strategy              │
│  └─ Result: { documents: [...] }                               │
│                                                                  │
│  [... repeat for all steps ...]                                │
│                                                                  │
│  Step 5: validate-roadmap                                       │
│  └─ Final quality gate before return                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  🤖 AGGREGATOR AGENT (Synthesis)                                │
├─────────────────────────────────────────────────────────────────┤
│  Combines: All agent outputs                                    │
│  Validates: Consistency across results                          │
│  Output: {                                                       │
│    finalOutput: { modules: [...], skills: [...] },             │
│    metadata: {                                                   │
│      agentsUsed: 5,                                             │
│      executionTime: "45s",                                      │
│      validationScore: 92,                                       │
│      explanation: "Roadmap balances..."                         │
│    }                                                             │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  RESPONSE: { modules, metadata, explanation }                   │
└─────────────────────────────────────────────────────────────────┘
```

### Roadmap Generation Orchestrated (NEW FLOW)

```
Goal: "Generate personalized learning roadmap"
   ↓ (Planner decides execution)
Plan: [extract-cv, retrieve-docs, analyze-gaps, generate, validate]
   ↓
Step 1: 🤖 Extract CV Skills
   ├─ Input: CV text
   ├─ Output: 15 skills identified
   └─ ✅ Validation: Score 95/100 → Continue
   ↓
Step 2: 🤖 Retrieve Company Docs
   ├─ Input: company + dept ID
   ├─ Output: 8 relevant documents
   └─ ✅ Validation: Sufficient context → Continue
   ↓
Step 3: 🤖 Analyze Gaps
   ├─ Input: [cv skills] vs [company requirements]
   ├─ Output: 6 skill gaps, 3 critical
   └─ ✅ Validation: Consistent analysis → Continue
   ↓
Step 4: 🤖 Generate Roadmap
   ├─ Input: gaps + company docs + learning profile
   ├─ Output: 5 learning modules
   └─ ⚠️  Validation: Quality score 72/100 (below threshold 85)
      └─ 🔧 Recovery: Retry with different prompt
         ├─ 2nd attempt: Quality score 88/100
         └─ ✅ Pass → Continue
   ↓
Step 5: 🤖 Validate Roadmap
   ├─ Input: Generated modules
   ├─ Output: { pass: true, score: 88, issues: [] }
   └─ ✅ Final validation passed
   ↓
🤖 AGGREGATOR: Combine all results
   ├─ CV Skills: 15 found
   ├─ Company Requirements: 20 found
   ├─ Skill Gaps: 6 (3 critical)
   ├─ Roadmap Generated: 5 modules
   ├─ Quality Score: 88
   └─ Final Output: ✅ Ready for user
```

### Meta-Agents (Built-in)

**Planner Agent** (Agentic)
- Analyzes goal + context
- Decides which agents to invoke
- Creates execution schedule
- Chooses error strategy

**Validator Agent** (Agentic)
- Checks output quality (0-100 score)
- Identifies issues
- Decides if retry needed
- Suggests improvements

**Recovery Agent** (Agentic)
- Analyzes failures
- Suggests alternative strategies
- Can pivot execution path
- Provides fallback options

**Aggregator Agent** (Agentic)
- Combines multi-agent outputs
- Resolves conflicts
- Creates final response
- Adds explanations

### Implementation Files

**New Files:**
- `services/agentOrchestrator.service.js` (700+ lines)
- `services/agentRegistry.js` (400+ lines)
- `controllers/roadmap.controller.orchestrator.js` (300+ lines)

**Files Simplified:**
- Removes 200+ lines from original roadmap.controller.js
- No more manual agent orchestration
- No more error handling spaghetti code

---

## 🔄 System Flows

### FLOW 1: Complete Roadmap Generation Flow (Orchestrated)

```
┌─────────────────────────────────────────────────────────────────┐
│           USER INITIATES ROADMAP GENERATION REQUEST              │
│                    (Onboarding → Generate)                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: VALIDATE USER & FETCH PREREQUISITES                    │
├─────────────────────────────────────────────────────────────────┤
│ • Check user exists in Firestore                                │
│ • Verify onboarding complete (CV + training duration)           │
│ • Acquire generation lock (prevent duplicate generation)        │
│ • Fetch company onboarding training duration                    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: DOWNLOAD & PARSE CV                                    │
├─────────────────────────────────────────────────────────────────┤
│ • Fetch CV from URL (user.cvUrl)                                │
│ • 🎨 GENERATIVE: CV Parser Agent structures CV data            │
│   Output: {                                                      │
│     rawText: "full CV text",                                    │
│     structured: { name, skills, experience, education }        │
│   }                                                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: 🤖 AGENTIC SKILL EXTRACTION (NEW!)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ A) Fetch Pinecone Context (Company Docs)                       │
│    └─ Query: user's CV text                                    │
│    └─ Result: Top 5 company documents matching CV              │
│                                                                  │
│ B) Agent 1️⃣ - CV Skills Agent                                 │
│    └─ Analyzes: Raw CV text                                    │
│    └─ Decides: What skills user possesses                      │
│    └─ Returns: [React, Node.js, Python, AWS, ...]            │
│                                                                  │
│ C) Agent 2️⃣ - Company Skills Agent                            │
│    └─ Analyzes: Company documentation                           │
│    └─ Decides: What skills company requires                    │
│    └─ Returns: [Docker, Kubernetes, React, Node, K8s, ...]   │
│                                                                  │
│ D) Agent 3️⃣ - Skill Gap Analysis Agent                        │
│    ├─ Compares: CV skills vs Company skills                    │
│    ├─ Decides: Which gaps are critical (50% split)            │
│    └─ Returns: {                                                │
│         skillGap: [Docker, Kubernetes],                        │
│         criticalGaps: [Docker, Kubernetes],                    │
│         extractionDetails: { analysis }                        │
│       }                                                          │
│                                                                  │
│ Store in Firestore:                                             │
│   user.roadmapAgentic.extractedSkills = {                      │
│     cvSkills, companySkills, skillGap, criticalGaps            │
│   }                                                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: BUILD LEARNING PROFILE                                 │
├─────────────────────────────────────────────────────────────────┤
│ • Query past roadmaps (last 5)                                  │
│ • Fetch agent memory summaries                                  │
│ • Extract weak concepts from quiz failures                      │
│ • Analyze struggling areas vs mastered topics                   │
│ • Calculate average quiz score                                  │
│ OUTPUT: {                                                        │
│   summary: "User struggled with...",                           │
│   strugglingAreas: [async/await, closures],                   │
│   masteredTopics: [variables, loops],                          │
│   avgScore: 75,                                                 │
│   weakConcepts: [{concept: "async", frequency: 3}]            │
│ }                                                                │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: 🤖 AGENTIC ROADMAP PLANNING                           │
├─────────────────────────────────────────────────────────────────┤
│ • Agent: Roadmap Planning Agent                                 │
│ • Input: training_topic, CV, skillGap, learningProfile         │
│ • Decision: Generate 2-4 targeted retrieval queries            │
│ • Output: {                                                      │
│     queries: [                                                   │
│       "Docker containerization best practices",                │
│       "Kubernetes deployment in production",                    │
│       "AWS infrastructure fundamentals"                         │
│     ],                                                           │
│     focusAreas: ["containers", "orchestration", "cloud"],      │
│     priority: "high"                                            │
│   }                                                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: MULTI-QUERY RETRIEVAL FROM PINECONE                   │
├─────────────────────────────────────────────────────────────────┤
│ For each planned query:                                          │
│  1. Embed query using Cohere                                    │
│  2. Search Pinecone vector DB                                   │
│  3. Filter by company + department                              │
│  4. Return top 5 documents per query                            │
│                                                                  │
│ Merge all documents (remove duplicates, sort by relevance)     │
│ Truncate to MAX_CONTEXT_CHARS (8000)                           │
│                                                                  │
│ OUTPUT: companyDocsText (consolidated company context)         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 7: 🎨 AGENTIC ROADMAP GENERATION (RETRY LOOP)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ For attempt = 0 to ROADMAP_MAX_RETRIES (2):                    │
│                                                                  │
│   A) Agent: Roadmap Generation Agent (GENERATIVE)              │
│      ├─ Input: CV, skill gaps, company context, learning hist │
│      ├─ Prompt: "Create 4-6 learning modules..."              │
│      └─ Output: [                                               │
│            {                                                     │
│              moduleTitle: "Docker Essentials",                 │
│              description: "Learn containerization...",         │
│              estimatedDays: 5,                                 │
│              skillsCovered: [containers, Docker, images]      │
│            },                                                    │
│            { ... 3-5 more modules ... }                        │
│          ]                                                       │
│                                                                  │
│   B) Agent: Roadmap Critique Agent (AGENTIC)                   │
│      ├─ Input: Generated modules + constraints                │
│      ├─ Decision: Does it meet quality threshold?             │
│      └─ Output: { pass: bool, issues: [], score: 0-100 }     │
│                                                                  │
│   C) If PASS → Return modules + critique                       │
│      If FAIL → Agent: Roadmap Refinement Agent (GENERATIVE)   │
│               └─ Rewrites modules based on issues             │
│               └─ Returns refined modules for next iteration    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 8: ENFORCE TRAINING DURATION                              │
├─────────────────────────────────────────────────────────────────┤
│ • Parse training duration from onboarding (e.g., "4 weeks")    │
│ • Calculate total module days vs allowed duration              │
│ • Adjust module days to fit constraint (compress or extend)    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 9: STORE ROADMAP IN FIRESTORE                            │
├─────────────────────────────────────────────────────────────────┤
│ For each module, create document:                               │
│   /freshers/{companyId}/departments/{deptId}/users/{userId}   │
│             /roadmap/{moduleId}                                 │
│                                                                  │
│   Document fields:                                               │
│   {                                                              │
│     moduleTitle,                                                │
│     description,                                                │
│     estimatedDays,                                              │
│     skillsCovered,                                              │
│     skillExtractionContext: {                                   │
│       cvSkillsCount,                                            │
│       companySkillsCount,                                       │
│       skillGapCount                                             │
│     },                                                           │
│     order,                                                       │
│     completed: false,                                           │
│     status: "pending",                                          │
│     createdAt,                                                  │
│     FirstTimeCreatedAt                                          │
│   }                                                              │
│                                                                  │
│ Also store metadata in user doc:                                │
│   user.roadmapAgentic = {                                       │
│     planQueries,                                                │
│     planFocusAreas,                                             │
│     critiqueScore,                                              │
│     extractedSkills: {...},                                     │
│     learningProfile: {...},                                     │
│     generatedAt                                                 │
│   }                                                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 10: 🤖 SEND NOTIFICATIONS (AGENTIC)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Agent: Notification Strategy Agent                              │
│ ├─ Analyzes: User engagement, preferences, timezone            │
│ ├─ Decides:                                                     │
│ │  • shouldSend: true/false                                    │
│ │  • sendEmail: true/false                                     │
│ │  • optimalTime: "10:00"                                      │
│ │  • recommendedTone: "motivational"                           │
│ │  • urgencyLevel: "high/medium/low"                           │
│ └─ Score: estimatedEngagementScore (0-100)                    │
│                                                                  │
│ If decision is SEND:                                            │
│   1. Agent: Personalized Email Content Agent (GENERATIVE)      │
│      └─ Generates: subject, preview, call-to-action, message   │
│                                                                  │
│   2. Send Email with roadmap overview                          │
│                                                                  │
│   3. Create Google Calendar Events for modules                 │
│      └─ Schedule: Start of each module                         │
│      └─ Reminder: 1 day before                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 11: GENERATE ROADMAP PDF                                  │
├─────────────────────────────────────────────────────────────────┤
│ • Create professional PDF with:                                 │
│   - User name, company, training topic                         │
│   - All modules with descriptions                              │
│   - Timeline visualization                                      │
│   - Skills to master                                            │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  RETURN SUCCESS RESPONSE                                        │
├─────────────────────────────────────────────────────────────────┤
│ {                                                                │
│   success: true,                                                │
│   modules: [ ... ],                                             │
│   roadmapUrl: "/user/roadmap",                                 │
│   message: "Roadmap generated successfully"                    │
│ }                                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

### FLOW 2: Chat Learning Assistance Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              USER SENDS CHAT MESSAGE (Learning Help)             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: PREPARE CONTEXT                                        │
├─────────────────────────────────────────────────────────────────┤
│ • Get current module details                                    │
│ • Fetch user's learning history                                │
│ • Get saved memory (previous learnings)                         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: RETRIEVE RELEVANT KNOWLEDGE                            │
├─────────────────────────────────────────────────────────────────┤
│ • Embed user query using Cohere                                │
│ • Search Pinecone for matching documents                       │
│ • Query external knowledge (MDN, StackOverflow, Dev.to)       │
│ • Aggregate results                                             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: BUILD CHAT CONTEXT                                     │
├─────────────────────────────────────────────────────────────────┤
│ Combine:                                                         │
│ • User's learning profile                                       │
│ • Retrieved documents                                            │
│ • Saved agent memory                                            │
│ • Training topic context                                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: 🎨 GENERATIVE - Chat Response Agent                   │
├─────────────────────────────────────────────────────────────────┤
│ • Model: Gemini 2.5-Flash                                      │
│ • Prompt: "Answer this learning question based on context..."  │
│ • Output: Helpful, personalized response                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: UPDATE AGENT MEMORY                                    │
├─────────────────────────────────────────────────────────────────┤
│ • Store conversation in Firestore                              │
│ • Update user's learning memory                                │
│ • Track topics discussed                                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  RETURN RESPONSE TO USER                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

### FLOW 3: Quiz Generation & Evaluation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│           USER CLICKS "START QUIZ" ON MODULE                    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: VALIDATE MODULE & UNLOCK STATUS                        │
├─────────────────────────────────────────────────────────────────┤
│ • Check if module exists                                        │
│ • Verify training time lock (70% of estimated days passed)     │
│ • Check previous quiz attempts (max 3)                         │
│ • Verify user hasn't surpassed max attempts                    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: 🤖 AGENTIC - Determine Quiz Configuration              │
├─────────────────────────────────────────────────────────────────┤
│ Agent: Quiz Configuration Decision Agent                        │
│ • Analyzes: Module difficulty, user expertise, past scores     │
│ • Decides:                                                      │
│   - Number of questions (6-12)                                 │
│   - Time limit (30-45 mins)                                    │
│   - Include coding questions? (expert users)                   │
│   - Pass threshold (70-80%)                                    │
│   - Difficulty distribution                                     │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: 🎨 GENERATIVE - Generate Quiz Questions               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Input: Module context, difficulty level, question types        │
│                                                                  │
│ Agent: Quiz Generation Agent (GENERATIVE)                      │
│ ├─ Question Set 1: MCQ Questions (4-6 questions)              │
│ │  └─ Each: {                                                   │
│ │      question: "...",                                        │
│ │      options: ["A", "B", "C", "D"],                         │
│ │      correctAnswer: "B",                                     │
│ │      explanation: "..."                                      │
│ │    }                                                          │
│ │                                                               │
│ ├─ Question Set 2: One-Liner Questions (2-3 questions)        │
│ │  └─ Each: {                                                   │
│ │      question: "...",                                        │
│ │      expectedKeywords: ["keyword1", "keyword2"],            │
│ │      correctAnswer: "..."                                    │
│ │    }                                                          │
│ │                                                               │
│ └─ Question Set 3: Coding Questions (optional, 1-2)           │
│    └─ Each: {                                                   │
│        question: "...",                                        │
│        boilerplate: "function solution() { ... }",            │
│        testCases: { input: "...", expected: "..." }           │
│        timeLimit: "10 mins"                                    │
│      }                                                          │
│                                                                  │
│ Output: Complete quiz JSON                                     │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: STORE QUIZ & SEND TO USER                             │
├─────────────────────────────────────────────────────────────────┤
│ • Save quiz in Firestore                                        │
│ • Send quiz to frontend                                         │
│ • Start timer                                                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  [USER ANSWERS QUIZ]                                            │
│  (Time passes, user submits answers)                            │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: EVALUATE ANSWERS                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ For MCQ Questions:                                              │
│  └─ Simple string comparison                                    │
│     isCorrect = userAnswer === correctAnswer                   │
│                                                                  │
│ For One-Liner Questions:                                        │
│  └─ Agent: One-Liner Evaluation Agent (AGENTIC)               │
│     • Input: question, user response, expected keywords       │
│     • Decision: is response conceptually correct?             │
│     • Output: { isCorrect, score, feedback }                  │
│                                                                  │
│ For Coding Questions:                                           │
│  └─ Agent: Code Evaluation Agent (AGENTIC)                    │
│     • Run user code against test cases                        │
│     • Check code quality (efficiency, style)                  │
│     • Decision: Does it solve the problem correctly?          │
│     • Output: { isCorrect, score: 0-100 }                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: CALCULATE QUIZ SCORE                                   │
├─────────────────────────────────────────────────────────────────┤
│ • Sum all correct answers                                       │
│ • Calculate percentage (correct / total * 100)                 │
│ • Compare against pass threshold (70-80%)                      │
│ • Determine: PASS or FAIL                                      │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────┴────────┐
                    │                │
                ✅ PASS             ❌ FAIL
                    │                │
                    ▼                ▼
        ┌──────────────────┐    ┌──────────────────┐
        │ UNLOCK NEXT MODULE│    │ QUIZ FAILED      │
        └──────────────────┘    └──────────────────┘
        • Mark module complete     • Check attempt count
        • Update progress          • If attempts < 3:
        • Store memory               └─ Show failed message
        • Success response            └─ Offer retake
                                   • If attempts >= 3:
                    │                 └─ 🤖 Agentic Decision:
                    │                    Generate Remediation Plan
                    │                    (GENERATIVE AGENT)
                    │                 └─ Create recovery roadmap
                    │                    with reinforcement modules
                    │                 └─ Notify user & admin
                    │
        ┌───────────┴────────────────┐
        │                            │
        ▼                            ▼
    CONTINUE TO               REMEDIATION FLOW
    NEXT MODULE           (If repeated failures)
```

---

### FLOW 4: Notification & Reminder Flow (Agentic)

```
┌─────────────────────────────────────────────────────────────────┐
│  CRON JOB TRIGGERS: "Send daily reminders" (scheduled)          │
│  OR: Module/Roadmap milestone reached                            │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: FETCH USER ENGAGEMENT DATA                             │
├─────────────────────────────────────────────────────────────────┤
│ 🤖 Agent: User Engagement Analysis Agent (AGENTIC)             │
│ • Analyzes:                                                     │
│   - Last login time                                             │
│   - Learning streak                                             │
│   - Module completion status                                    │
│   - Quiz scores (trending)                                      │
│   - Email open rate                                             │
│   - Time spent learning                                         │
│   - Preferred learning hours                                    │
│ • Output: engagementData object                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: 🤖 AGENTIC - Make Notification Decision               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Agent: Notification Strategy Agent (AGENTIC)                    │
│ • Analyzes:                                                     │
│   - User engagement patterns                                    │
│   - Notification fatigue risk                                   │
│   - Optimal send time (based on activity)                      │
│   - User timezone                                               │
│   - Message tone preferences                                    │
│ • Decision Output: {                                            │
│     shouldSend: true/false,                                     │
│     sendEmail: true/false,                                      │
│     createCalendarEvent: true/false,                            │
│     optimalTime: "10:00",                                       │
│     personalizationTip: "mention learning streak",             │
│     urgencyLevel: "high/medium/low",                            │
│     recommendedMessageTone: "motivational"                      │
│   }                                                              │
│                                                                  │
│ If shouldSend = FALSE:                                          │
│   └─ SKIP notification, return early                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: 🎨 GENERATIVE - Personalize Email Content              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Agent: Personalized Email Content Agent (GENERATIVE)            │
│ • Generates:                                                    │
│   - Email subject (compelling, personalized)                    │
│   - Email preview (under 50 chars)                              │
│   - Call-to-action text                                         │
│   - Motivational message (tailored to progress)                 │
│   - Personalization elements (name, streak, %)                 │
│ • Output: {                                                      │
│     emailSubject: "Keep your 7-day learning streak going!",    │
│     emailPreview: "Your next module awaits...",               │
│     callToActionText: "Resume Learning",                       │
│     motivationalMessage: "You're doing great!",                │
│     personalizationElements: ["name", "streak", "nextModule"]  │
│   }                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: SEND NOTIFICATIONS                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ A) SEND EMAIL (if sendEmail = true)                            │
│    • Load email template                                        │
│    • Replace with personalized content                          │
│    • Send via SMTP                                              │
│    • Log open/click tracking                                    │
│                                                                  │
│ B) CREATE CALENDAR EVENT (if createCalendarEvent = true)       │
│    • Schedule: Module start or quiz unlock time                │
│    • Title: "Start [Module Name]"                              │
│    • Reminder: 1 day before + 30 mins before                   │
│    • Add to user's Google Calendar                             │
│                                                                  │
│ C) 🎨 GENERATIVE - Generate Daily Agenda (for daily reminder)  │
│    Agent: Daily Agenda Agent (GENERATIVE)                       │
│    • Generates encouraging daily learning plan                  │
│    • Specific tasks for the day                                 │
│    • Time estimates                                             │
│                                                                  │
│ D) LOG NOTIFICATION EVENT                                       │
│    • Store in Firestore                                         │
│    • Track engagement metrics                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: RETURN NOTIFICATION STATUS                             │
├─────────────────────────────────────────────────────────────────┤
│ {                                                                │
│   sent: true,                                                   │
│   emailSent: true,                                              │
│   calendarEventCreated: true,                                   │
│   scheduledTime: "2026-04-15T10:00:00Z"                         │
│ }                                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Models

### User Document Structure

```javascript
/freshers/{companyId}/departments/{deptId}/users/{userId}
{
  // Basic Info
  userId: "string",
  email: "string",
  name: "string",
  cvUrl: "string",
  
  // Training Configuration
  trainingOn: "string",
  trainingLevel: "Beginner|Intermediate|Advanced",
  expertise: 1-4,
  trainingDurationFromOnboarding: 30, // days
  
  // Onboarding Status
  onboarding: {
    onboardingCompleted: boolean,
    completedAt: timestamp
  },
  
  // Roadmap Generation (Agentic Results)
  roadmapAgentic: {
    planQueries: ["query1", "query2"],
    planFocusAreas: ["area1", "area2"],
    extractedSkills: {
      cvSkills: ["skill1", "skill2"],
      companySkills: ["skill3", "skill4"],
      skillGap: ["gap1", "gap2"],
      criticalGaps: ["critical1"],
      extractionDetails: { ... }
    },
    learningProfile: { ... },
    critiqueScore: 85,
    critiquePass: true,
    generatedAt: timestamp
  },
  
  // Progress Tracking
  progress: 0-100,
  modulesCompleted: number,
  totalQuizzesAttempted: number,
  averageQuizScore: number,
  learningStreak: number,
  
  // Engagement
  lastLoginAt: timestamp,
  totalTimeSpentLearning: number, // minutes
  emailOpenRate: number,
  
  // Lock Status
  roadmapGenerationLock: {
    startedAt: timestamp,
    expiresAt: timestamp
  }
}
```

### Roadmap Module Document

```javascript
/freshers/{companyId}/departments/{deptId}/users/{userId}/roadmap/{moduleId}
{
  moduleTitle: "Docker Essentials",
  description: "Learn containerization using Docker...",
  estimatedDays: 5,
  skillsCovered: ["Docker", "containers", "images"],
  
  // Skill Extraction Context
  skillExtractionContext: {
    cvSkillsCount: 15,
    companySkillsCount: 20,
    skillGapCount: 8,
    criticalGapsCount: 3
  },
  
  // Status Tracking
  order: 1,
  completed: false,
  status: "pending|in_progress|completed",
  
  // Timestamps
  createdAt: timestamp,
  FirstTimeCreatedAt: timestamp,
  startedAt: timestamp,
  completedAt: timestamp,
  
  // Quiz Info
  quiz: {
    quizId: "string",
    attempts: number,
    highestScore: number,
    lastAttemptAt: timestamp
  }
}
```

### Quiz Document

```javascript
/freshers/{companyId}/departments/{deptId}/users/{userId}/roadmap/{moduleId}/quiz/current
{
  moduleId: "string",
  moduleTitle: "string",
  
  configuration: {
    questionCount: number,
    timeLimit: number, // minutes
    passThreshold: 70,
    allowCoding: boolean
  },
  
  // Questions
  questions: {
    mcq: [
      {
        id: "q1",
        question: "What is Docker?",
        options: ["A", "B", "C", "D"],
        correctAnswer: "A",
        explanation: "..."
      }
    ],
    oneLiners: [
      {
        id: "q2",
        question: "Define containerization",
        expectedKeywords: ["isolation", "lightweight"],
        correctAnswer: "..."
      }
    ],
    coding: [
      {
        id: "q3",
        question: "Write a function...",
        boilerplate: "function solution() { }",
        testCases: [
          { input: "...", expected: "..." }
        ]
      }
    ]
  },
  
  createdAt: timestamp
}
```

### Agent Memory Document

```javascript
/freshers/{companyId}/departments/{deptId}/users/{userId}/roadmap/{moduleId}/agentMemory/summary
{
  summary: "User struggled with async concepts, mastered basic loops",
  strugglingAreas: ["async/await", "promises"],
  masteredTopics: ["variables", "loops"],
  lastQuizScore: 75,
  totalAttempts: 2,
  
  // Learning insights
  avgScore: 75,
  learningPace: "moderate",
  recommendedNextSteps: "Focus on async patterns",
  
  // Weak Concepts (from quiz failures)
  weakConcepts: [
    { concept: "async/await", frequency: 3 },
    { concept: "promise.all", frequency: 2 }
  ],
  
  // Regeneration Context (if quiz failed multiple times)
  regenerationContext: "Previous roadmap failed to address async/await...",
  balancedApproach: true, // 50/50 weak vs company skills
  
  updatedAt: timestamp
}
```

---

## 🔌 API Endpoints

### Roadmap Routes

```
POST /roadmap/generate
  Request: {
    companyId: "string",
    deptId: "string",
    userId: "string",
    trainingTime: "4 weeks",
    trainingOn: "React Development",
    expertiseScore: 2
  }
  Response: {
    success: true,
    modules: [{ moduleTitle, description, estimatedDays, skillsCovered }],
    reused: false,
    timestamp: "2026-04-15T10:00:00Z"
  }
```

### Chat Routes

```
POST /chat/send
  Request: {
    userId: "string",
    companyId: "string",
    deptId: "string",
    moduleId: "string",
    message: "How do I use Docker?"
  }
  Response: {
    reply: "AI generated response...",
    sources: ["pinecone_doc_1", "mdn_article"],
    timestamp: "..."
  }
```

### Quiz Routes

```
POST /quiz/generate
  Request: {
    companyId: "string",
    deptId: "string",
    userId: "string",
    moduleId: "string"
  }
  Response: {
    quiz: { questions: [...] },
    configuration: { timeLimit, passThreshold }
  }

POST /quiz/submit
  Request: {
    companyId: "string",
    moduleId: "string",
    answers: { q1: "A", q2: "answer text", ... }
  }
  Response: {
    score: 85,
    passed: true,
    feedback: "Good job!",
    results: { mcq: [...], oneLiners: [...] }
  }
```

### Notifications Routes

```
POST /notifications/preferences
  Request: {
    userId: "string",
    emailNotifications: true,
    calendarEvents: true,
    optimalTime: "10:00"
  }
  Response: {
    success: true
  }

GET /notifications/insights
  Response: {
    insights: {
      strengths: ["Docker", "Containers"],
      areasForImprovement: ["Kubernetes", "Orchestration"],
      recommendedPace: "moderate",
      motivationalMessage: "..."
    }
  }
```

---

## ✨ Key Features

### 1. **Agentic Skill Extraction**
- 3 AI agents analyze CV + company docs simultaneously
- Intelligent gap identification with prioritization
- Semantic understanding of skills vs regex patterns

### 2. **Adaptive Roadmap Generation**
- 4-step agentic planning + generative creation
- Quality critique with 2x retry loop
- Handles quiz failures with balanced remediation (50/50 weak vs company skills)

### 3. **Dynamic Quiz System**
- AI-driven quiz configuration based on expertise
- Multiple question types (MCQ, one-liners, coding)
- Intelligent evaluation with feedback

### 4. **Smart Notifications**
- Agentic decision-making (when/how to send)
- Personalized email content generation
- Calendar integration with smart scheduling

### 5. **Learning Progress Tracking**
- Agent memory system (persistent learning history)
- Weak concept identification from quiz failures
- Personalized recommendations

### 6. **Multi-Source Knowledge Retrieval**
- Pinecone vector search (company docs)
- External sources (MDN, StackOverflow, Dev.to)
- Cohere embeddings for semantic search

---

## 🎯 Agentic vs Generative AI Usage

### Decision Tree

```
┌─── Is Agent DECIDING something? ───────→ AGENTIC
│    (What to do, when, how, whether)
│
├─ Examples:
│  - Decide skill priority
│  - Decide notification send time
│  - Decide if answer is correct
│  - Decide roadmap quality
│
└─── Is Agent CREATING something? ────────→ GENERATIVE
     (Content, text, questions, plans)

     ├─ Examples:
     │  - Create quiz questions
     │  - Create email subject
     │  - Create learning modules
     │  - Create daily agenda
```

### Integration Pattern

```
Request → Agentic (DECIDE) → Generative (CREATE) → Response

Example:
User asks "Start Quiz"
  ↓
Agent 1: (Agentic) Decide quiz configuration
  ↓
Agent 2: (Generative) Create quiz based on config
  ↓
Agent 3: (Agentic) Evaluate user answers
  ↓
Agent 4: (Agentic) Decide if passed/failed
  ↓
If Failed:
  Agent 5: (Generative) Create remediation plan
```

---

## 📈 Scaling & Performance

### Current Limits
- Max 3 roadmap generation retries
- Max 3 quiz attempts per module
- Max 60 skills extracted per analysis
- Max 8000 chars company context
- Pinecone top-5 results per query

### Optimization Techniques
1. **Caching**: Reuse generated roadmaps if exists
2. **Merging**: De-duplicate documents from multi-query retrieval
3. **Truncation**: Limit context to prevent token overflow
4. **Rate Limiting**: Respect API quotas
5. **Async Processing**: Send notifications asynchronously
6. **Index Optimization**: Organize Pinecone by company/dept

---

## 🔐 Security & Validation

### Validation Layers
1. User authentication (Firebase Auth)
2. Permission checks (company/dept access)
3. Roadmap generation locks (prevent duplicates)
4. Quiz attempt limits
5. Training time locks (70% module complete before quiz)

### Error Handling
- Graceful fallbacks for AI failures
- Structured logging for debugging
- Email notifications for critical errors
- Admin dashboards for monitoring

---

## 📞 Support & Debugging

### Key Logs to Check
```
[AGENTIC SKILL EXTRACTION START]
[AGENTIC SKILL EXTRACTION END]
[GEMINI ROADMAP START]
[GEMINI ROADMAP END]
[QUIZ GENERATION START]
🤖 Agent: ...
✅ ...
❌ ...
```

### Common Issues
1. **Gemini Quota Exceeded** → Check rate limits, use fallback model
2. **CV Parsing Failed** → Ensure PDF/image upload working
3. **Pinecone No Results** → Check document indexing in Pinecone
4. **Email Not Sent** → Verify SMTP credentials
5. **Calendar Integration Fails** → Check Google OAuth tokens

---

**End of Documentation**

Generated on April 15, 2026
