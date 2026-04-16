# TrainMate Backend: Easy Guide

This file explains the backend in simple words:
- how it starts
- what agents do
- how data moves from request to response

## 1) Big Picture

TrainMate backend is an Express server that:
- receives API requests from frontend
- reads and writes data in Firebase Firestore
- uses AI services (Gemini, Cohere, Pinecone) to generate learning results
- sends emails and calendar reminders
- runs scheduled background jobs

Main start file: `trainmate-backend/server.js`

## 2) Startup Flow (What happens when server starts)

When you run the backend:
1. Environment variables are loaded.
2. Express app is created with JSON + CORS middleware.
3. Pinecone initialization is attempted.
4. Scheduled jobs are started (daily checks/reminders).
5. Autonomous runtime loop is started (background AI goal processor).
6. All API route groups are mounted.
7. Server starts listening on `PORT` (default 5000).

## 3) Main Route Groups

The backend mounts many route files under `/api` and `/api/roadmap`.
Common ones:
- roadmap generation and regeneration
- chat and module explain
- auth and Google OAuth
- quiz
- notifications
- AI insights
- company and super admin features

## 4) Core Data Sources

- Firestore: users, roadmap modules, progress, notifications, billing, agent memory
- Pinecone: semantic document retrieval
- Gemini: planning, generation, validation, chat reasoning
- Cohere embeddings: query/document vectors for retrieval

## 5) Agent System (Detailed + Easy)

Main file: `services/agentOrchestrator.service.js`

Think of this like a smart project manager:
- It understands the goal.
- It picks which specialist agents should run.
- It checks quality.
- It retries or changes path when needed.

### 5.1 Core Agents and Their Jobs

- `extract-cv-skills`: Reads CV text and pulls skills the learner already has.
- `extract-company-skills`: Reads company docs and pulls expected skills.
- `analyze-skill-gaps`: Compares both lists and finds missing skills.
- `plan-retrieval`: Creates better search queries for context retrieval.
- `retrieve-documents`: Fetches relevant knowledge from Pinecone.
- `generate-roadmap`: Produces learning modules and sequencing.
- `evaluate-code`: Scores coding submissions and gives feedback.
- `validate-roadmap`: Checks roadmap quality and returns pass/score/issues.

### 5.2 Agent Execution Flow (What happens internally)

For each orchestrated goal, the flow is:
1. `Understand goal + constraints`: Goal text and context are prepared.
2. `Load memory`: Past runs (if available) are loaded from Firestore memory doc.
3. `Plan`: Planner proposes steps and dependencies.
4. `Normalize plan`: Invalid/missing steps are fixed; fallback plan used if needed.
5. `Execute steps`: Agents run in dependency order.
6. `Validate output`: Validator scores quality and can flag issues.
7. `Recover if needed`: Retry, pivot, or fallback strategy is used when failures happen.
8. `Store history`: Execution log + metadata are saved.
9. `Suggest follow-up goals`: Optional next goals can be auto-queued.

### 5.3 Why this is Agentic

This system is considered agentic because it has behavior beyond a fixed pipeline:
- dynamic planning (not hardcoded one-path execution)
- adaptive execution (retry/pivot/fallback)
- memory of previous runs
- autonomous follow-up goal creation
- multi-agent collaboration with dependencies

### 5.4 What Is Truly Agentic vs Not Agentic

`Truly agentic`
- `AgentOrchestrator.orchestrate(...)` goal-driven execution
- plan generation + plan repair/normalization
- validator-driven quality loop
- autonomous runtime loop that claims and executes pending goals

`Hybrid (agent-assisted but partially fixed)`
- chat pipeline: retrieval + memory + model response are mostly deterministic steps, but can use agentic reasoning components
- roadmap controller: fixed endpoint sequence, but core generation is delegated to agentic orchestrator

`Not agentic (standard backend automation)`
- Express route mounting and request parsing
- CRUD reads/writes to Firestore
- cron scheduling (`node-cron`) and time-based checks
- email/calendar sending logic
- lock handling and standard error responses

In simple words:
- If logic can choose strategy at runtime and self-correct, it is agentic.
- If logic always follows the same fixed code path, it is automation.

## 6) Roadmap Generation Flow (Main Product Flow)

Endpoint: `POST /api/roadmap/generate`

High-level flow:
1. Validate input and find the learner in Firestore.
2. Check onboarding + CV availability.
3. Reuse existing roadmap if already generated.
4. Set a short lock so duplicate generation does not run at same time.
5. Parse CV from URL.
6. Build learner profile.
7. Call orchestrator with roadmap goal + context.
8. Receive generated modules.
9. Save modules in Firestore roadmap collection.
10. Save orchestration metadata for debugging/audit.
11. Send notification email and create calendar reminder flow.
12. Return modules to frontend.

If something fails, API returns an error and lock handling prevents duplicate collisions.

## 7) Chat Flow (Learning Assistant)

Chat is exposed through routes like:
- `POST /api/chat/init`
- `POST /api/chat`

Chat pipeline (simplified):
1. Identify learner + active module.
2. Fetch relevant context (roadmap, progress, company docs, memory).
3. Retrieve extra knowledge from Pinecone and optional sources (MDN, StackOverflow, Dev.to).
4. Build a safe prompt (with relevance guardrails).
5. Generate response with Gemini.
6. Save chat memory and progress signals.

This is why chat feels personalized to learner module and company context.

## 8) Notifications and Scheduling

Notification service handles:
- roadmap generated emails
- daily reminder support
- quiz unlock emails
- Google Calendar event management with token fallback strategy

Scheduled jobs run periodically to:
- send reminders
- enforce timing rules (example: quiz unlock windows, expiration checks)
- send company license renewal alerts

## 9) Autonomous Runtime (Background AI Worker)

Autonomous runtime service runs a loop:
1. look for pending goals in `autonomousAgentGoals`
2. safely claim one goal
3. execute goal through orchestrator
4. mark completed/failed
5. retry with backoff when needed

This enables backend-side self-driven improvement tasks without direct user request.

## 10) Safety and Reliability Features

Important protections in backend design:
- lock to prevent duplicate roadmap generation
- retries and fallback plans in orchestration
- validation step before accepting generated roadmap
- stale in-progress autonomous goal recovery
- OAuth fallback chain for calendar operations
- non-critical notification failures do not block roadmap creation

## 11) In One Line

TrainMate backend is an API + AI orchestration system: it turns learner data, company needs, and retrieved knowledge into a structured roadmap, then supports day-to-day learning with chat, notifications, and automated background agents.
