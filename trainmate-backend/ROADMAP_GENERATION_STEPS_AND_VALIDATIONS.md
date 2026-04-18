# TrainMate Roadmap Generation: Steps, Validations, and Agents

This document explains the exact runtime flow used to generate a roadmap in the current backend implementation.

Source flow entrypoints:
- Route: POST /api/roadmap/generate
- Controller: controllers/roadmap.controller.orchestrator.js
- Orchestrator: services/agentOrchestrator.service.js
- Policy engine: services/policy/policyEngine.service.js

## 1) API Entry and Route-Level Guard

File: routes/roadmapRoutes.js

1. Route receives POST /generate.
2. Calls generateUserRoadmap(req, res).
3. Route has try/catch; returns 500 with "Roadmap route failed" on unhandled route-level errors.

Validation at this layer:
- Route-level exception handling (ensures API does not crash process on uncaught controller error).

## 2) Controller Preconditions and Hard Validations

File: controllers/roadmap.controller.orchestrator.js

### Step 2.1 - Agent registry init
- Calls ensureAgentsInitialized() once.
- initializeAgentRegistry() triggers orchestrator.ensureCoreAgentsRegistered().

Validation:
- Ensures core agents are present before orchestration run.

### Step 2.2 - Request payload extraction
Expected fields (from req.body):
- companyId
- deptId
- userId
- trainingTime
- trainingOn (optional override)
- expertiseScore (optional override)

### Step 2.3 - User existence and onboarding validation
- Loads fresher user doc from:
  freshers/{companyId}/departments/{deptId}/users/{userId}

Hard validations:
1. If user doc missing -> 404 User not found.
2. If onboarding not completed OR cvUrl missing -> 400 Onboarding incomplete.

### Step 2.4 - Existing roadmap reuse
- Reads user roadmap subcollection.

Validation:
- If roadmap already exists, returns success with reused=true (skips regeneration).

### Step 2.5 - Concurrency lock (roadmapGenerationLock)
- Uses Firestore transaction.
- Lock TTL is 5 minutes.
- If existing lock not expired -> 409 Roadmap generation already in progress.
- If free/expired -> writes lock startedAt/expiresAt.

Validation:
- Prevents duplicate parallel roadmap generation for same user.

### Step 2.6 - Training context hydration
- Fetches latest onboarding answer set from companies/{companyId}/onboardingAnswers.
- Resolves final config:
  - trainingOn from client override -> user field -> default General
  - expertise from request -> user field -> default 1
  - level from user.trainingLevel -> default Beginner
  - trainingDuration from onboarding answer -> user saved value -> request trainingTime

### Step 2.7 - CV parse and minimum-quality gate
- Calls parseCvFromUrl(user.cvUrl).
- Extracts cvText from result.rawText.
- Calls policyEngine.decide("cvValidation", ...) with file metadata, extracted text, and structured CV signals.

Hard validation:
- If cvValidation.isValidCV is false -> return 400 with cvValidation reason/issues.
- File-size hard guards in parser:
  - too small (< 10KB) rejected
  - too large (> 5MB) rejected

### Step 2.8 - Learning profile preload
- Calls buildLearningProfile({ userRef }).

Validation:
- Non-fatal enrichment; builds context for personalization.

## 3) Orchestration Lifecycle (Main Pipeline)

File: services/agentOrchestrator.service.js

Orchestrator call in controller:
- orchestrator.orchestrate("Generate personalized learning roadmap from CV and company requirements", context)

Context includes:
- companyId, deptId, userId
- cvText
- expertise
- trainingOn
- level
- trainingDuration
- structuredCv
- learningProfile
- constraints (maxLatency, costSensitivity, guidance)

### Step 3.1 - LLM initialization
- initializeLLMs() requires GEMINI_API_KEY.

Hard validation:
- Missing GEMINI_API_KEY throws and fails orchestration.

### Step 3.2 - Long-term memory load
- Reads user agent memory doc:
  freshers/{companyId}/departments/{deptId}/users/{userId}/agentMemory/orchestrator

Usage:
- Memory summary is fed into planning/reasoning.
- Structured memory insights are derived from recent runs and injected into retries/replanning.

### Step 3.3 - Plan generation (Planner policy)
- Calls policyEngine.decide("planGeneration", ...).
- Planner receives available agents, context, constraints, memory summary.
- Planner mode is tagged on plan output:
  - `plannerMode: "llm"` for normal planner output
  - `plannerMode: "fallback"` when fallback plan is used

Validation and fallback:
1. If planner fails/no valid JSON -> generateFallbackPlan().
2. normalizePlan() sanitizes plan shape and each step.
3. If fallback planner mode is used, final validation score is penalized before final pass gate.

normalizePlan validations:
- steps must be array, else fallback.
- unknown agents removed.
- numeric dependencies mapped to agent names.
- self dependencies removed.
- invalid dependencies removed.
- invalid errorStrategy corrected to retry.
- roadmap-specific enforcement:
  - inject dependency extract-company-skills -> extract-cv-skills for deterministic extraction order.
  - if generate-roadmap missing, inject required step.
  - mark retrieve-documents as non-critical for roadmap path.

### Step 3.4 - Reasoning loop (multi-cycle execution)
- max cycles: between 2 and 4 (default 3).
- For each cycle:
  1. executePlan(...)
  2. validateFinalOutput(...)
  3. if failed and cycles remain -> critiqueExecutionAndSuggestReplan + applyReplanFromCritique + refine context

Validation:
- Each cycle has pass/fail score and reason logged.

### Step 3.5 - Step scheduler and dependency gating
executePlan behavior:
- Maintains pending steps.
- Runs only dependency-ready steps.
- Executes ready steps in parallel batch.
- Marks blocked steps as skipped/failed if dependencies fail.
- Applies errorStrategy behaviors (fail_fast, retry, skip_non_critical, pivot-aware handling through recovery paths).

Validation:
- Enforces dependency correctness at runtime.

### Step 3.6 - Per-step retry and output validation
For each step (executeStepWithRetries):
1. Verify dependencies exist in results.
2. Resolve agent from registry.
3. Execute agent with constraints/executionPlan.
4. Run validateOutput(output, step).
5. If validation fails and retries remain:
   - policyEngine.decide("stepRecovery", ...)
   - may patch input / retry / skip / fail.

Validation:
- Deterministic validation rules for known agents (detailed in Section 5).

### Step 3.7 - Recovery phase after loop (if needed)
- If finalValidation failed but canRecover=true:
  - attemptRecovery(...)
  - policyEngine.decide("recoveryStrategy", ...)
  - may re-run a target failed/missing critical step.

Validation:
- Recovery re-checks by running validateFinalOutput again after successful retry.

### Step 3.8 - Final mandatory roadmap gate
Hard validation:
- For roadmap goals, modules must exist and be non-empty in execution results.
- If missing -> orchestration fails.

### Step 3.9 - Aggregation gate
- aggregateResults(...)
- For roadmap goals, deterministic aggregation returns modules directly from generate-roadmap output.

Hard validation:
- Aggregated output must contain non-empty modules.

### Step 3.10 - Memory write and execution record
- Saves run metadata to in-memory history.
- Persists long-term memory summary for future decisions.
- Persisted memory now includes run-level learning signals:
  - `plannerMode`
  - `plannerFallbackUsed`
  - `failedAgents`
  - `validationBand`

## 4) Core Agents Registered (Registry)

File: services/agentOrchestrator.service.js (registerCoreAgents)

Exactly 8 core agents are registered:

1. extract-cv-skills
- Purpose: extract skills from CV text/structured CV.
- Uses: extractSkillsAgentically(..., mode: cv_only)

2. extract-company-skills
- Purpose: extract required skills from company docs.
- Uses: extractSkillsAgentically(..., mode: company_only)

3. analyze-skill-gaps
- Purpose: compute gaps between CV and company skills.
- Primary mode: weighted gap analysis using confidence, frequency, criticality, dependencies, recency.
- Fallback mode: set-difference skill gap if profile data not available.

4. plan-retrieval
- Purpose: produce retrieval queries/focus areas for company-doc grounding.
- Uses Gemini JSON planner with fallback default queries.

5. retrieve-documents
- Purpose: run Pinecone retrieval for planned queries.
- Deduplicates docs by text.

6. generate-roadmap
- Purpose: generate roadmap modules.
- Uses generateRoadmap(...) with CV, retrieved docs, skillGap, focus areas, training profile.

7. evaluate-code
- Purpose: code evaluation workflow support (general orchestrator capability, not required for roadmap generation endpoint).

8. validate-roadmap
- Purpose: LLM quality validation over generated modules.
- Note: may or may not be included in a specific plan, depending on planner output and normalization.

## 5) Explicit Validation Rules by Agent Step

File: services/agentOrchestrator.service.js (validateOutput)

Deterministic per-agent validation currently implemented:

1. extract-cv-skills
- Pass if cvSkills is non-empty array.

2. extract-company-skills
- Pass if companySkills is non-empty array.

3. analyze-skill-gaps
- Pass if skillGap exists and is an array.

4. plan-retrieval
- Pass requires:
  - queries has at least one non-empty value
  - focusAreas has at least one non-empty value
  - priority in {high, medium, low}

5. retrieve-documents
- Always pass (non-blocking by design for roadmap flow).
- Score/reason differs depending on whether docs found.

6. generate-roadmap
- Pass if modules contains at least one object.

7. validate-roadmap
- Pass if output includes pass boolean or numeric score signal.

8. Unknown/custom agents
- LLM validation prompt + guardrail scoring via applyGuardrails.
- Final pass requires score threshold and guardrail pass.

## 5.1) Scoring Model Used During Roadmap Generation

This pipeline uses a mix of deterministic scores, validation scores, and weighted gap scores.

### A. Step-level validation scores
- Every agent step gets a validation score in `validateOutput(...)`.
- Typical ranges used by the orchestrator:
  - 90-95 for strong deterministic passes
  - 65-80 for tolerated or partial outputs
  - 0-40 for failures or empty outputs

Examples:
- `extract-cv-skills`: 90 when CV skills are found, 30 when empty.
- `extract-company-skills`: 90 when company skills are found, 30 when empty.
- `analyze-skill-gaps`: 95 when a valid skill gap array exists.
- `plan-retrieval`: 92 when queries, focus areas, and priority are valid.
- `retrieve-documents`: 90 if documents are found, 65 if none are found but the run can continue.
- `generate-roadmap`: 92 when at least one roadmap module is produced, 20 when no modules are produced.

### B. Final roadmap readiness score
- `validateFinalOutput(...)` applies a roadmap-level readiness gate.
- For roadmap goals:
  - non-empty modules => pass with score 95
  - missing modules => fail with score 15

This score is what the controller surfaces in `metadata.validationScore`.

### C. Weighted skill-gap scoring
- When both CV skill profiles and company skill profiles are available, the orchestrator uses `buildWeightedGapAnalysis(...)`.
- Each company skill gets a normalized score in the 0-1 range using:
  - confidence gap
  - role criticality
  - company skill frequency
  - dependency weight
  - recency risk boost

Scoring outcome:
- Skills are sorted by score descending.
- Thresholds are derived from quantiles:
  - top tier => `must-have`
  - middle tier => `good-to-have`
  - lower tier => `optional`
- This ranking directly influences which gaps are prioritized in the roadmap.

### D. Controller-visible score fields
- The response metadata includes:
  - `validationScore`
  - `validationBand`
  - `validationState`
  - `plannerMode`
  - `plannerFallbackUsed`
  - `executionTime`
  - `agentsUsed`
  - `explanation`
- The saved user metadata also stores the orchestration result and execution log.

### E. Skill priority handoff
- The roadmap generator now receives `prioritizedSkills` with:
  - `mustHave`
  - `goodToHave`
- Generated modules are sorted so must-have skills appear first, then good-to-have, then optional skills.
- The roadmap validator now checks that module ordering follows that priority structure before accepting the output.

### F. Pinecone retrieval basis (what is retrieved and why)

Retrieval is done in two stages:

1. Query planning (`plan-retrieval` agent)
- Inputs used to build retrieval intent:
  - `skillGap` from gap analysis
  - `explorationCandidates` (top exploration hints)
  - `trainingOn`
- Planner returns:
  - `queries` (mandatory)
  - `focusAreas` (mandatory)
  - `explorationAreas` (optional)
  - `priority`

2. Vector retrieval (`retrieve-documents` agent + Pinecone service)
- For each planned query:
  - Generate embedding using Cohere `embed-english-v3.0` with `inputType: search_query`.
  - Query Pinecone index using:
    - namespace: `company-{companyId}`
    - filter: exact department match `deptName == deptId.toUpperCase()`
    - `topK: 5`
    - `includeMetadata: true`
- Returned docs are mapped as `{ text, score }`, then deduplicated by exact `text`.

Important behavior:
- There is currently no hard minimum Pinecone score cutoff at retrieval stage.
- If retrieval returns no docs, pipeline can still continue (non-blocking), but quality may be degraded.
- In step validation, retrieval typically gets:
  - stronger score when docs are found
  - degraded-but-acceptable score when no docs are found

### G. How confidence and score are computed

There are multiple score layers in this pipeline, each for a different decision:

1. Pinecone similarity score (`m.score`)
- This is vector similarity between query embedding and stored doc vectors.
- Higher score means closer semantic match.
- Used for ranking returned matches per query.

2. Weighted skill-gap score (0-1 normalized, later bucketed)
- For each company skill, orchestrator computes a composite score using:
  - confidence gap: `companyConfidence - cvConfidence`
  - role criticality
  - company skill frequency
  - dependency weight (skill graph similarity)
  - recency risk boost
- Conceptually:

$$
gapScore = w_1*confidenceGap + w_2*criticality + w_3*frequency + w_4*dependency + w_5*recencyBoost
$$

- Skills are sorted by this score and bucketed via quantiles into:
  - `must-have` (top tier)
  - `good-to-have` (middle)
  - `optional` (lower)

3. Step validation score (0-100)
- Each agent output gets a validation score from `validateOutput(...)`.
- Score bands used in control flow:
  - `< 70` => `retry`
  - `70-85` => `degraded`
  - `> 85` => `trusted`
- Retry logic is triggered for retry-band outputs on critical steps.

4. Final readiness score (0-100)
- Final orchestration output is validated (`validateFinalOutput(...)`).
- For roadmap goals, non-empty modules are mandatory.
- Planner fallback mode applies penalty before final accept/reject decision.
- Final `validationScore`, `validationBand`, and `validationState` are returned in metadata.

## 5.2) Where Scoring Can Break

Current implementation status:

- Score thresholds are now active in control flow.
- Score bands are used to classify outputs into retry/degraded/trusted.
- Planner fallback mode also affects score through a fallback penalty.

Recommended threshold behavior:

1. Score below 70
- Treat as a real weakness.
- Retry automatically if the step is still retryable.
- If retries fail, mark the step as failed or trigger recovery.

2. Score from 70 to 85
- Allow the run to continue.
- Mark the result as degraded.
- Prefer replan or enrichment if the step is important to roadmap quality.

3. Score above 85
- Treat as trusted output.
- Proceed without extra recovery pressure.

Suggested execution policy:
- Step validation score below 70 should increase retry urgency.
- Final roadmap score below 70 should block success and force recovery.
- Final roadmap score from 70 to 85 should return a roadmap, but mark metadata as degraded.
- Final roadmap score above 85 should be considered healthy.

This threshold policy is enforced in the orchestrator for step validation and final readiness checks.

## 5.3) Planner Fallback Monitoring and Quality Impact

- Every orchestration run is tagged with `plannerMode` (`llm` or `fallback`).
- Fallback mode usage is exposed in response metadata via `plannerMode` and `plannerFallbackUsed`.
- Fallback mode applies a score penalty before final acceptance.
- Agent Health Center tracks fallback usage percentage and shows planner fallback KPI/alert.

Operational recommendation:
- Monitor fallback rate continuously.
- Treat sustained fallback rate as a quality risk signal.

## 6) Final Output Validation (Goal-Level)

File: services/agentOrchestrator.service.js (validateFinalOutput)

Roadmap goal specific validation:
- If modules array exists and non-empty -> pass=true, high score.
- Else -> fail with canRecover=true and recommendation to ensure generate-roadmap returns modules.

Non-roadmap goals:
- Uses LLM-based readiness validation + guardrails.

## 7) Controller Post-Orchestration Validations and Persistence

File: controllers/roadmap.controller.orchestrator.js

After orchestration returns success:

1. roadmapModules extraction gate
- Must be array and non-empty.
- If empty -> throw error.

2. Firestore persistence
- Writes each module with:
  - order
  - completed=false
  - status=pending
  - createdAt timestamps

3. Metadata persistence
- Stores roadmapAgentic block on user:
  - orchestrationMetadata
  - agentExplanation
  - last execution log entries
  - generatedAt

4. Notification flow (non-critical)
- Generates roadmap PDF.
- Calls handleRoadmapGenerated(...).
- Notification failures are logged but do not fail roadmap generation response.

5. Lock release in finally
- roadmapGenerationLock fields set to null.
- Silent failure allowed during lock release.

## 8) Error Handling and Failure Semantics

1. Controller catch
- Returns 500 with message and orchestration log.

2. Orchestrator catch
- Returns success=false with error and executionLog.
- Saves failed run to long-term memory.

3. Critical blockers
- Missing GEMINI_API_KEY
- CV validation agent rejects document as non-CV or low-confidence CV
- Missing roadmap modules at final validation
- Aggregation without modules for roadmap goal

4. Non-blocking behaviors
- Empty retrieval docs (allowed)
- Notification failures (allowed)
- Planner LLM failure (fallback plan)
- Validation LLM failure (deterministic fallback checks)

## 11) CV Validation Decision Agent

Policy decision type: `cvValidation` in policy engine.

Validation layers applied:
1. File/type/size checks.
2. Extraction and minimum text quality checks.
3. Keyword and structural heuristics (sections, bullets, date signals, structured fields).
4. Semantic LLM classification (`isCV`, `confidence`, `reason`, `score`).

Decision output shape:
- `isValidCV`
- `confidence`
- `score`
- `reason`
- `issues`
- `classificationSource` (`heuristic` or `llm`)
- `recommendedAction`

Hard gate:
- Controllers reject with 400 when `isValidCV` is false and return validation reasons/issues.

## 9) End-to-End Roadmap Flow Summary (Condensed)

1. Route receives POST /api/roadmap/generate.
2. Controller validates user, onboarding, CV URL, and acquires lock.
3. CV is parsed and quality checked.
4. Learning profile and context are assembled.
5. Orchestrator builds/sanitizes plan using planner policy + fallbacks.
6. Agents execute with dependency gating, retries, and per-step validations.
7. Final roadmap output is validated (modules required).
8. Results are aggregated and returned.
9. Roadmap modules + metadata are persisted.
10. Notifications attempted (non-critical).
11. Lock is released.

## 10) Agents Involved in Roadmap Generation (Practical Run Set)

Typical roadmap-generation run uses this subset:
- extract-cv-skills
- extract-company-skills
- analyze-skill-gaps
- plan-retrieval
- retrieve-documents (non-critical)
- generate-roadmap
- optionally validate-roadmap (planner-dependent)

Agent available in registry but generally outside roadmap generation path:
- evaluate-code
