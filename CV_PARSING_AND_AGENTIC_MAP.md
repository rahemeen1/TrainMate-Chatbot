# TrainMate CV Parsing and Agentic Architecture Map

## 1) CV Parsing Flow (Actual Code Path)

Primary trigger:
- Endpoint: `POST /api/roadmap/generate`
- Route file: `trainmate-backend/routes/roadmapRoutes.js`
- Controller entry: `generateUserRoadmap()` in `trainmate-backend/controllers/roadmap.controller.js`

### Step-by-step pipeline

1. Request validation and user lookup
- `generateUserRoadmap()` validates `companyId`, `deptId`, `userId` context and checks onboarding + `cvUrl`.
- Also enforces a Firestore lock (`roadmapGenerationLock`) to prevent duplicate concurrent generation.

2. CV download + text extraction
- `generateUserRoadmap()` calls `parseCvFromUrl(user.cvUrl)`.
- Implemented in `trainmate-backend/services/cvParser.service.js`.
- Inside parser:
  - Downloads CV using `axios` as `arraybuffer`.
  - Detects file type (`pdf`/`docx`) from URL.
  - Extracts text using `extractFileText()` from `trainmate-backend/utils/TextExtractor.js`.

3. PII redaction + truncation
- Parser redacts email/phone/date/id patterns (`redactPii`).
- Truncates to max size (`MAX_CV_CHARS`) before sending to LLM.

4. Structured CV extraction (LLM)
- Parser prompts Gemini (`gemini-2.5-flash`) to produce strict JSON:
  - `summary`, `skills`, `roles`, `education`, `certifications`, `projects`, `tools`
- Uses retry logic + safe JSON parsing.
- Validates minimum structure quality (`validateStructuredCv`).
- Returns:
  - `rawText`
  - `structured`
  - `redactedText`

5. Skill extraction from raw CV text
- `generateUserRoadmap()` calls `extractSkillsFromText(cvText)` in `trainmate-backend/services/skillExtractor.service.js`.
- This is currently keyword-match based (deterministic, non-LLM).

6. CV output is fed into roadmap generation context
- CV text + structured CV become part of the roadmap planning and generation context.
- `structuredCv` is included in `learningProfile` and sent into roadmap generation prompting.

## 2) Where CV Parsing Connects to the Rest of the System

After CV parsing, the roadmap flow continues in `generateUserRoadmap()`:

1. Retrieve company docs from Pinecone
- `retrieveDeptDocsFromPinecone()` in `trainmate-backend/services/pineconeService.js`
- Uses Cohere embeddings + Pinecone query (department filtered).

2. Compute base and refined skill gaps
- Compares CV skills with company-doc skills.

3. Build learner history profile
- `buildLearningProfile()` in `roadmap.controller.js`
- Pulls previous `agentMemory`, quiz attempts, wrong answers, weak concepts.

4. Run agentic planning + retrieval + generation loop
- `generateRoadmapPlan()`
- `fetchPlannedDocs()` (multi-query retrieval)
- `generateRoadmapAgentic()` (generate -> critique -> refine loop)

5. Persist result and metadata
- Saves modules to Firestore `roadmap` collection.
- Stores `roadmapAgentic` metadata (`planQueries`, `focusAreas`, critique signals, etc.).

6. Trigger AI agentic notifications
- Calls `aiAgenticSendRoadmapNotifications()` and `aiAgenticSendModuleNotifications()`.

## 3) What Is Agentic in This Project

Agentic means the system is not just doing one-shot generation; it is planning, deciding, critiquing, adapting, and using memory/context to choose next actions.

### A) CV parser (partly agentic)
File: `trainmate-backend/services/cvParser.service.js`
- Agentic aspects:
  - LLM-driven structured extraction from free-text CV.
  - Retry and validation path (tries again when output quality is weak).
- Non-agentic aspects:
  - File download, text extraction, regex redaction, truncation.

### B) Roadmap generation (strongly agentic)
File: `trainmate-backend/controllers/roadmap.controller.js`
- Agentic planner: `generateRoadmapPlan()` creates retrieval strategy queries.
- Agentic retrieval: `fetchPlannedDocs()` executes multi-query context gathering.
- Agentic loop: `generateRoadmapAgentic()` performs:
  - initial generation (`generateRoadmap`)
  - critique (`critiqueRoadmap`)
  - refinement (`refineRoadmap`)
  - pass/fail decision and fallback
- Stores agentic metadata under `roadmapAgentic`.

### C) Chat intelligence + memory (agentic)
Files:
- `trainmate-backend/controllers/chatController.js`
- `trainmate-backend/services/memoryService.js`

Agentic behaviors:
- `fetchAgenticKnowledge()` fetches external knowledge dynamically (MDN, StackOverflow, Dev.to).
- `getAgentMemory()` retrieves contextual learner memory.
- `updateMemoryAfterChat()` summarizes interactions with LLM and updates long-term module memory.

### D) Quiz decision engine (agentic)
File: `trainmate-backend/controllers/QuizController.js`
- Agentic planning and generation for quiz content.
- Agentic decision maker (`makeAgenticDecision`) controls retry, lock/unlock, regeneration, recommendations.

### E) Notification strategy (agentic)
File: `trainmate-backend/services/aiAgenticNotificationService.js`
- AI decides whether to notify, via which channels, at what urgency/tone.
- AI generates personalized content from engagement context.

## 4) What Is Not Agentic (Deterministic/Rule-Based)

Examples of non-agentic parts in the same flow:
- Express routes and request validation
- Firestore reads/writes and transaction locks
- Static keyword skill matching (`extractSkillsFromText`)
- Embedding + vector search call mechanics
- PDF generation and email/calendar send execution

These are orchestration and infrastructure components that execute fixed logic.

## 5) Quick Mental Model

Think of TrainMate as:
- Deterministic backbone: API + DB + retrieval + schedulers + delivery channels
- Agentic brain: planning, critique/refinement loops, memory summarization, adaptive decisions

In short:
- CV parsing starts as deterministic extraction of document text
- Becomes agentic when Gemini structures/interprets profile data
- Then feeds a larger agentic roadmap/quiz/chat/notification ecosystem

## 6) Minimal Flow Diagram

```text
POST /api/roadmap/generate
  -> generateUserRoadmap()
    -> parseCvFromUrl(cvUrl)
      -> download file
      -> extract raw text
      -> redact + truncate
      -> Gemini structured parse (retry + validate)
    -> extract CV skills (rule based)
    -> retrieve company docs (Pinecone)
    -> build learning profile (memory + quiz history)
    -> generateRoadmapPlan() [agentic planner]
    -> fetchPlannedDocs() [multi-query retrieval]
    -> generateRoadmapAgentic() [generate/critique/refine loop]
    -> save roadmap + roadmapAgentic metadata
    -> aiAgenticSendRoadmapNotifications() [agentic decisioning]
```
