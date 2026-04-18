# TrainMate Agent Decision Pipeline

## Purpose
This document explains how each TrainMate agent makes decisions, what inputs it receives, what outputs it returns, and how the full pipeline executes from roadmap generation to notifications.

## Architecture Overview
TrainMate uses three agent layers:

1. Execution Agents
These perform core tasks like extraction, planning, generation, and validation.

2. Policy Decision Agents
These decide strategy, retries, fallback behavior, and operational choices (notifications, calendar, recovery).

3. Functional Domain Agents
These support specific product functions like quiz handling and chat workflows.

The core separation is still the same:
- policy layer decides
- service layer remembers and executes
- orchestrator coordinates the workflow

---

## A. Roadmap Generation Pipeline (Main Orchestration)

### Step 1: Plan Generation Decision Agent
Decision type: planGeneration

Input:
- Goal text
- Context (training topic, expertise, constraints, memory)
- Available agents

Decision logic:
- Generates a step sequence and dependencies
- Picks error strategy (retry, fail_fast, skip_non_critical, pivot)
- Estimates execution cost

Output:
- Plan object with ordered steps

Fallback:
- If planner fails, deterministic fallback plan is used.

---

### Step 2: CV Skills Agent
Agent key: extract-cv-skills

Input:
- CV text
- Structured CV
- trainingOn
- expertise

Decision logic:
- Uses skillExtraction policy decision (source=cv)
- Strategy can be hybrid, single_source, or fallback_only
- Applies strict filtering and normalization

Output:
- cvSkills
- extractionDetails

---

### Step 3: Company Skills Agent
Agent key: extract-company-skills

Input:
- companyDocsText
- trainingOn
- expertise

Decision logic:
- Uses skillExtraction policy decision (source=company)
- If docs exist: company_docs strategy
- If docs missing: topic_inference strategy
- Applies strict filtering and domain-aware normalization

Latest update:
- company docs stay high trust
- topic inference stays available, but with lower confidence and higher exploration weight
- that keeps weak inference useful without letting it dominate gap scoring

Output:
- companySkills
- extractionDetails

---

### Step 4: Gap Analysis Agent
Agent key: analyze-skill-gaps

Input:
- cvSkills
- companySkills

Decision logic:
- Computes missing skills (company minus CV)
- Ranks and slices critical gaps

Latest update:
- gap analysis now uses calibratedConfidence instead of raw confidence
- it also returns explorationCandidates so inferred skills can still guide retrieval planning

Output:
- skillGap
- criticalGaps
- gapCount
- prioritizedGaps
- gapBuckets
- explorationCandidates

---

### Step 5: Retrieval Planning Agent
Agent key: plan-retrieval

Input:
- skillGap
- trainingOn

Decision logic:
- LLM creates retrieval queries and focus areas
- Validates structure (queries, focusAreas, priority)

Latest update:
- retrieval planning now receives exploration hints from weak or inferred skills
- it can output explorationAreas in addition to focusAreas

Output:
- queries
- focusAreas
- priority
- explorationAreas

Fallback:
- If invalid output, default query strategy is returned.

---

### Step 6: Document Retrieval Agent
Agent key: retrieve-documents

Input:
- queries
- companyId
- deptId

Decision logic:
- Retrieves content from vector store per query
- Merges and deduplicates results

Output:
- documents
- documentCount

---

### Step 7: Roadmap Generation Agent
Agent key: generate-roadmap

Input:
- cvText
- skillGap
- focusAreas
- retrieved docs
- learning profile
- training constraints

Decision logic:
- Builds final contextual prompt
- Generates module sequence with timeline

Output:
- modules
- moduleCount
- totalDays

---

### Step 8: Validation Agent
Agent key: validate-roadmap

Input:
- modules
- allowed duration

Decision logic:
- Scores completeness, realism, progression, and coverage
- Returns pass/fail with issues

Output:
- pass
- score
- issues
- improvements

Recovery behavior:
- If validation fails, critique/replan cycle updates plan and context, then re-executes.

---

## B. Policy Decision Agents (How Decisions Are Taken)

### 1) skillExtraction
Used by extractor for CV and company branches.

Rules:
- CV source:
  - hybrid if structured + text available
  - single_source if one source available
  - fallback_only if no usable source
- Company source:
  - company_docs if docs available
  - topic_inference if docs unavailable

---

### 2) notification
Chooses if roadmap/quiz notifications should be sent.

Input signals:
- user engagement
- training context
- constraints
- memory

Output:
- shouldSend
- sendEmail
- createCalendarEvent
- timing/tone metadata

Latest update:
- notification service now loads engagement and learning state before calling policy
- the service adds adaptive throttling on top of policy output
- repeated ignored notifications can reduce frequency for non-critical messages
- the policy layer still remains the decision brain

---

### 3) calendarDecision
Dedicated calendar scheduling decision agent.

Input:
- notification type
- user and module context
- timezone
- emailSent state
- upstream notification decision

Decision logic:
- Skips invalid email or zero-module cases
- Can approve, skip, or defer event creation
- Selects reminderTime and urgency

Latest update:
- calendar decisions are kept separate from notification decisions
- notification decides whether the flow should happen
- calendarDecision decides whether a calendar event should be created and when

Output:
- shouldCreateCalendarEvent
- reason
- reminderTime
- urgency

---

### 4) quizOutcome
Decides retry and progression strategy based on score and attempts.

Output includes:
- allowRetry
- retriesGranted
- requiresRoadmapRegeneration
- lockModule/contactAdmin flags

---

### 5) stepRecovery and recoveryStrategy
Used when an agent step fails validation or execution.

Decision logic:
- Retry with input patch
- Skip non-critical
- Fallback strategy

Latest update:
- planCorrections are now preserved and fed back into replanning
- recovery is more targeted than a generic retry

---

### 6) replanCritique
Critiques failed cycle and suggests add/remove/prioritize agent changes.

Output:
- critique reason
- addAgents/removeAgents/prioritizeAgents
- refined context hints

---

### 7) chatResponse
Creates a response plan, retrieves best context, runs multi-candidate response generation, judges best answer, and applies guardrails.

---

## C. Notification Pipeline (Roadmap Generated)

1. Notification decision agent runs.
2. Roadmap email is attempted.
3. Calendar decision agent runs.
4. Calendar event is attempted only if both are true:
   - notification policy allows calendar
   - calendarDecision says create
5. Result object records:
   - emailSent/emailError
   - calendarAttempted/calendarEventCreated/calendarError
   - decision and calendarDecision metadata

This avoids misleading logs such as "calendar failed" when it was intentionally skipped.

Latest update:
- this pipeline also records skip vs fail vs sent outcomes for notification learning
- notification frequency can now adapt using past engagement signals

---

## D. Operational Observability

Agent health dashboard tracks:
- runs
- success rate
- blended status (healthy/warning/critical/no-data)
- latency and last run
- active alerts

Data source strategy:
- Runtime data preferred
- Stored snapshot fallback when runtime unavailable
- Invalid/empty snapshots are ignored

Latest update:
- empty or invalid stored snapshots are ignored so the UI does not blank out
- runtime tables are grouped by agent type for clarity

---

## E. Quick Reference: Core Execution Agent Order

1. extract-cv-skills
2. extract-company-skills
3. analyze-skill-gaps
4. plan-retrieval
5. retrieve-documents
6. generate-roadmap
7. validate-roadmap

Code evaluation path uses evaluate-code separately when needed.

---

## G. Recent Changes At A Glance

These are the important changes added most recently:

- confidence calibration now separates raw confidence from calibrated confidence
- topic inference gets lower confidence but higher exploration weight
- notification decisions now use engagement memory and ignored-streak history
- calendar decisions remain separate from notification decisions
- agent health snapshots are validated before display
- fresher deletion now removes the user recursively from Firestore
- chat unlock intent detection was tightened to reduce false positives

---

## H. One-Line Summary

TrainMate stays modular: policy decides, services remember and execute, and the orchestrator coordinates AI workflows without turning into a hardcoded monolith.

---

## F. Why This Pipeline Is Robust

- Strategy decisions are explicit (policy agents) instead of hidden conditionals
- Failures have controlled recovery and replanning
- Outputs are validated before final response
- Notifications and calendar actions are separated and explainable
- Health telemetry gives runtime visibility for operations
