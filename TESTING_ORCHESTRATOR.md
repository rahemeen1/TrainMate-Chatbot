# 🧪 Agent Orchestrator Testing Guide

## Quick Start: Test the Live Endpoint

### 1️⃣ **Direct API Test (Fastest)**

Use Postman or cURL to test the orchestrator in action:

```bash
curl -X POST http://localhost:5000/api/roadmap/generate \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "acme-corp",
    "deptId": "engineering",
    "userId": "test-user-123",
    "trainingOn": "React Development",
    "trainingTime": "4 weeks",
    "expertiseScore": 2
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "modules": [...],
  "reused": false,
  "orchestrationMetadata": {
    "agentsUsed": ["extract-cv-skills", "extract-company-skills", "analyze-skill-gaps", ...],
    "executionTime": "45000ms",
    "stepsExecuted": 7,
    "validationScore": 92,
    "strategy": "retry"
  }
}
```

---

## 2️⃣ **Unit Tests** 

Create test file: `trainmate-backend/tests/agentOrchestrator.test.js`

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentOrchestrator } from "../services/agentOrchestrator.service.js";

describe("Agent Orchestrator", () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();
  });

  // TEST 1: Registry operations
  describe("Agent Registration", () => {
    it("should register and retrieve agents", () => {
      const mockAgent = async ({ previousResults, context }) => ({
        output: "test",
      });

      orchestrator.registerAgent("test-agent", mockAgent);

      const agent = orchestrator.agents.get("test-agent");
      expect(agent).toBeDefined();
      expect(orchestrator.agents.size).toBe(1);
    });

    it("should handle duplicate agent registration", () => {
      const agent1 = async () => ({ result: 1 });
      const agent2 = async () => ({ result: 2 });

      orchestrator.registerAgent("same-name", agent1);
      orchestrator.registerAgent("same-name", agent2); // Overwrites

      const retrieved = orchestrator.agents.get("same-name");
      // Should be agent2
      expect(retrieved).toBe(agent2);
    });
  });

  // TEST 2: Plan generation
  describe("Plan Generation", () => {
    it("should generate valid execution plan", async () => {
      orchestrator.registerAgent("extract", async () => ({ skills: [] }));
      orchestrator.registerAgent("analyze", async () => ({ gaps: [] }));
      orchestrator.registerAgent("generate", async () => ({ modules: [] }));

      const plan = await orchestrator.generatePlan(
        "Generate learning roadmap",
        { expertise: 2, trainingOn: "React" }
      );

      expect(plan).toBeDefined();
      expect(plan.steps).toBeInstanceOf(Array);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps[0]).toHaveProperty("agent");
      expect(plan.steps[0]).toHaveProperty("critical");
      expect(plan.steps[0]).toHaveProperty("dependencies");
    });

    it("should use fallback plan if planner fails", async () => {
      // Mock Gemini API failure
      const plan = await orchestrator.generatePlan(
        "Generate personalized learning roadmap",
        { expertise: 1 }
      );

      // Should return fallback plan without error
      expect(plan).toBeDefined();
      expect(plan.steps).toBeInstanceOf(Array);
    });

    it("should identify dependencies correctly", async () => {
      const plan = await orchestrator.generatePlan(
        "Generate learning roadmap",
        { expertise: 2 }
      );

      // Check for dependency chains
      const stepMap = new Map(plan.steps.map(s => [s.agent, s]));
      for (const step of plan.steps) {
        if (step.dependencies && step.dependencies.length > 0) {
          for (const dep of step.dependencies) {
            expect(stepMap.has(dep)).toBe(true);
          }
        }
      }
    });
  });

  // TEST 3: Execution
  describe("Plan Execution", () => {
    it("should execute agents in order", async () => {
      const executionOrder = [];

      orchestrator.registerAgent("step-1", async () => {
        executionOrder.push("step-1");
        return { output: "1" };
      });
      orchestrator.registerAgent("step-2", async ({ previousResults }) => {
        executionOrder.push("step-2");
        expect(previousResults["step-1"]).toBeDefined();
        return { output: "2" };
      });

      const plan = {
        steps: [
          {
            stepNumber: 1,
            agent: "step-1",
            description: "Step 1",
            critical: true,
            dependencies: [],
            retryPolicy: { maxRetries: 1, backoffMs: 100 },
          },
          {
            stepNumber: 2,
            agent: "step-2",
            description: "Step 2",
            critical: true,
            dependencies: ["step-1"],
            retryPolicy: { maxRetries: 1, backoffMs: 100 },
          },
        ],
        errorStrategy: "fail_fast",
      };

      const result = await orchestrator.executePlan(plan, {}, []);

      expect(executionOrder).toEqual(["step-1", "step-2"]);
      expect(result.results["step-1"]).toBeDefined();
      expect(result.results["step-2"]).toBeDefined();
    });

    it("should retry failed agents", async () => {
      let attempts = 0;

      orchestrator.registerAgent("flaky-agent", async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("First attempt fails");
        }
        return { output: "success" };
      });

      const plan = {
        steps: [
          {
            stepNumber: 1,
            agent: "flaky-agent",
            description: "Flaky agent",
            critical: true,
            dependencies: [],
            retryPolicy: { maxRetries: 3, backoffMs: 50 },
          },
        ],
        errorStrategy: "retry",
      };

      const result = await orchestrator.executePlan(plan, {}, []);

      expect(attempts).toBe(2); // First failed, second succeeded
      expect(result.results["flaky-agent"]).toBeDefined();
    });

    it("should skip non-critical failures", async () => {
      orchestrator.registerAgent("critical-agent", async () => ({
        output: "critical",
      }));
      orchestrator.registerAgent("optional-agent", async () => {
        throw new Error("Optional step failed");
      });

      const plan = {
        steps: [
          {
            stepNumber: 1,
            agent: "critical-agent",
            description: "Critical",
            critical: true,
            dependencies: [],
            retryPolicy: { maxRetries: 1, backoffMs: 50 },
          },
          {
            stepNumber: 2,
            agent: "optional-agent",
            description: "Optional",
            critical: false,
            dependencies: [],
            retryPolicy: { maxRetries: 1, backoffMs: 50 },
          },
        ],
        errorStrategy: "skip_non_critical",
      };

      const result = await orchestrator.executePlan(plan, {}, []);

      expect(result.results["critical-agent"]).toBeDefined();
      expect(result.results["optional-agent"]).toBeUndefined(); // Skipped
    });
  });

  // TEST 4: Validation
  describe("Output Validation", () => {
    it("should validate agent output quality", async () => {
      const output = {
        modules: [
          { name: "Module 1", duration: 7 },
          { name: "Module 2", duration: 10 },
        ],
      };

      const step = {
        agent: "generate-roadmap",
        description: "Generate roadmap",
      };

      const validation = await orchestrator.validateOutput(output, step);

      expect(validation).toHaveProperty("pass");
      expect(validation).toHaveProperty("score");
      expect(validation).toHaveProperty("reason");
      expect(validation.score).toBeGreaterThanOrEqual(0);
      expect(validation.score).toBeLessThanOrEqual(100);
    });

    it("should fail validation for null output", async () => {
      const step = {
        agent: "test-agent",
        description: "Test step",
      };

      const validation = await orchestrator.validateOutput(null, step);

      expect(validation.pass).toBe(false);
      expect(validation.score).toBe(0);
    });
  });

  // TEST 5: Full orchestration
  describe("Full Orchestration", () => {
    beforeEach(() => {
      orchestrator.registerAgent("extract", async ({ context }) => ({
        skills: ["JavaScript", "React"],
        agentName: "Extract",
      }));
      orchestrator.registerAgent("analyze", async ({ previousResults }) => ({
        gaps: ["TypeScript", "Testing"],
        agentName: "Analyze",
      }));
      orchestrator.registerAgent("generate", async ({ previousResults }) => ({
        modules: [
          { name: "TypeScript Basics", days: 7 },
          { name: "Testing Patterns", days: 5 },
        ],
        agentName: "Generate",
      }));
    });

    it("should complete full orchestration pipeline", async () => {
      const result = await orchestrator.orchestrate(
        "Generate learning roadmap",
        {
          expertise: 2,
          trainingOn: "React Development",
          cvText: "Experienced in JavaScript and React",
        }
      );

      expect(result.success).toBe(true);
      expect(result.finalOutput).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.agentsUsed).toBeDefined();
      expect(result.metadata.executionTime).toBeDefined();
      expect(result.executionLog).toBeInstanceOf(Array);
    });

    it("should log execution history", async () => {
      await orchestrator.orchestrate("Test goal", {});

      const history = orchestrator.getExecutionHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty("goal");
      expect(history[0]).toHaveProperty("executionTime");
    });
  });

  // TEST 6: Error handling
  describe("Error Handling", () => {
    it("should handle missing agents gracefully", async () => {
      const plan = {
        steps: [
          {
            stepNumber: 1,
            agent: "non-existent-agent",
            description: "Missing agent",
            critical: false,
            dependencies: [],
            retryPolicy: { maxRetries: 1, backoffMs: 50 },
          },
        ],
        errorStrategy: "skip_non_critical",
      };

      // Should not throw, should skip
      const result = await orchestrator.executePlan(plan, {}, []);
      expect(result).toBeDefined();
    });

    it("should throw on missing critical agents", async () => {
      const plan = {
        steps: [
          {
            stepNumber: 1,
            agent: "non-existent-agent",
            description: "Missing critical agent",
            critical: true,
            dependencies: [],
            retryPolicy: { maxRetries: 1, backoffMs: 50 },
          },
        ],
        errorStrategy: "fail_fast",
      };

      await expect(orchestrator.executePlan(plan, {}, [])).rejects.toThrow();
    });
  });
});
```

**Run tests:**
```bash
npm install -D vitest
npm run test -- agentOrchestrator.test.js
```

---

## 3️⃣ **Integration Tests**

Create: `trainmate-backend/tests/roadmapOrchestrator.integration.test.js`

```javascript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../server.js";

describe("Roadmap Generation Orchestrator - Integration", () => {
  const testCompanyId = "test-company-123";
  const testDeptId = "engineering";
  const testUserId = "user-456";

  let user = null;

  beforeAll(async () => {
    // Setup test user in Firestore
    // Mock CV upload
  });

  afterAll(async () => {
    // Cleanup test data
  });

  it("should generate roadmap using orchestrator", async () => {
    const res = await request(app)
      .post("/api/roadmap/generate")
      .send({
        companyId: testCompanyId,
        deptId: testDeptId,
        userId: testUserId,
        trainingOn: "React Development",
        trainingTime: "4 weeks",
        expertiseScore: 2,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.modules).toBeInstanceOf(Array);
    expect(res.body.modules.length).toBeGreaterThan(0);
    expect(res.body.orchestrationMetadata).toBeDefined();
  });

  it("should return validation scores", async () => {
    const res = await request(app)
      .post("/api/roadmap/generate")
      .send({
        companyId: testCompanyId,
        deptId: testDeptId,
        userId: testUserId,
        trainingOn: "System Design",
        trainingTime: "6 weeks",
        expertiseScore: 3,
      });

    expect(res.body.orchestrationMetadata.validationScore).toBeGreaterThanOrEqual(0);
    expect(res.body.orchestrationMetadata.validationScore).toBeLessThanOrEqual(100);
  });

  it("should log orchestration execution", async () => {
    // Generate roadmap
    await request(app)
      .post("/api/roadmap/generate")
      .send({
        companyId: testCompanyId,
        deptId: testDeptId,
        userId: testUserId,
        trainingOn: "Cloud Architecture",
        trainingTime: "8 weeks",
        expertiseScore: 4,
      });

    // Check execution history
    const histRes = await request(app)
      .get("/api/roadmap/orchestration-history")
      .query({ userId: testUserId });

    expect(histRes.status).toBe(200);
    expect(histRes.body.history).toBeInstanceOf(Array);
    expect(histRes.body.history.length).toBeGreaterThan(0);
  });

  it("should handle concurrent requests", async () => {
    const promises = Array(3)
      .fill(null)
      .map((_, i) =>
        request(app)
          .post("/api/roadmap/generate")
          .send({
            companyId: testCompanyId,
            deptId: testDeptId,
            userId: `user-${i}`,
            trainingOn: "React",
            trainingTime: "4 weeks",
            expertiseScore: 2,
          })
      );

    const results = await Promise.all(promises);

    results.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  it("should reuse existing roadmap", async () => {
    // First generation
    const res1 = await request(app)
      .post("/api/roadmap/generate")
      .send({
        companyId: testCompanyId,
        deptId: testDeptId,
        userId: "user-reuse",
        trainingOn: "React",
        trainingTime: "4 weeks",
        expertiseScore: 2,
      });

    // Second request for same user
    const res2 = await request(app)
      .post("/api/roadmap/generate")
      .send({
        companyId: testCompanyId,
        deptId: testDeptId,
        userId: "user-reuse",
        trainingOn: "React",
        trainingTime: "4 weeks",
        expertiseScore: 2,
      });

    expect(res2.body.reused).toBe(true);
  });
});
```

---

## 4️⃣ **Manual Testing Checklist**

### ✅ Smoke Test (2 minutes)

- [ ] Backend server starts without errors
- [ ] Planner Agent can generate execution plan
- [ ] Agent registry initializes with 8 agents
- [ ] Generate roadmap endpoint responds

### ✅ Functional Test (5 minutes)

```bash
# Test 1: Happy path
POST /api/roadmap/generate
Body: { companyId, deptId, userId, trainingOn, ... }
Expected: 200 OK with modules

# Test 2: Agent retry
# (Add console logs to test flaky agent behavior)

# Test 3: Validation scoring
# Check metadata.validationScore in response

# Test 4: Execution history
GET /api/roadmap/orchestration-history?userId=...
Expected: Array of past executions with timestamps
```

### ✅ Performance Test

```bash
# Time single orchestration
time curl -X POST http://localhost:5000/api/roadmap/generate ...

# Expected: 30-60 seconds (includes Gemini API latency)

# Load test (5 concurrent)
ab -n 5 -c 5 -p data.json http://localhost:5000/api/roadmap/generate
```

### ✅ Error Scenario Test

Test these error cases:

```javascript
// 1. Missing user
POST /api/roadmap/generate
Body: { userId: "non-existent", ... }
Expected: 404 User not found

// 2. Missing CV
Body: { userId: "user-without-cv", ... }
Expected: 400 Onboarding incomplete

// 3. Concurrent generation
POST /generate (twice rapidly, same user)
Expected: 2nd request returns 409 (lock)

// 4. Agent failure (mock Gemini timeout)
Expected: Recovery agent triggers, fallback plan used
```

---

## 5️⃣ **Monitor Orchest Execution**

### View Execution History

```javascript
// In backend console or via debug endpoint
import { orchestrator } from './services/agentOrchestrator.service.js';

const history = orchestrator.getExecutionHistory(10);
history.forEach(exec => {
  console.log(`Goal: ${exec.goal}`);
  console.log(`Time: ${exec.executionTime}ms`);
  console.log(`Agents: ${exec.plan.steps.map(s => s.agent).join(' → ')}`);
  console.log(`Status: ${exec.executionResults ? '✅ Success' : '❌ Failed'}`);
  console.log('---');
});
```

### Real-time Monitoring

Add logging endpoint:

```javascript
// In roadmap.controller.orchestrator.js
export const getOrchestrationHistory = async (req, res) => {
  const { limit = 10 } = req.query;
  const history = orchestrator.getExecutionHistory(limit);
  
  return res.json({
    success: true,
    count: history.length,
    history: history.map(exec => ({
      goal: exec.goal,
      executionTime: exec.executionTime,
      agents: exec.plan.steps.map(s => s.agent),
      status: exec.executionResults ? 'success' : 'failed',
      validationScore: exec.validation?.score,
      timestamp: exec.timestamp,
    }))
  });
};

// Route: GET /api/roadmap/orchestration-history
```

---

## 6️⃣ **Metrics to Track**

| Metric | Target | Monitoring |
|--------|--------|-----------|
| **Execution Time** | 30-60s | Log each run |
| **Success Rate** | >95% | Count successes/failures |
| **Validation Score** | >80 | Average per execution |
| **Agent Performance** | All <15s | Individual agent timing |
| **Retry Count** | 0-2 per exec | Track retry triggers |
| **Error Recovery** | >90% | Recovery successes |

---

## 7️⃣ **Debug Commands**

```bash
# Check agent registry
GET /api/agents/registry

# Get last 5 executions
GET /api/roadmap/orchestration-history?limit=5

# View execution detail
GET /api/roadmap/execution/execution-id-123

# Clear history (testing)
POST /api/roadmap/clear-history (admin only)

# Test agent individually
POST /api/agents/test/extract-cv-skills
Body: { cvText: "...", context: {...} }
```

---

## 8️⃣ **Expected Results**

### ✅ Successful Orchestration
```
📋 Generating execution plan... ✅
   Plan: 7 steps (extract → analyze → retrieve → generate → validate)
   
⚙️  Executing agents...
   Step 1: extract-cv-skills ✅ (2.3s, score: 85)
   Step 2: extract-company-skills ✅ (1.8s, score: 80)
   Step 3: analyze-skill-gaps ✅ (0.5s, score: 92)
   Step 4: plan-retrieval ✅ (0.3s, score: 78)
   Step 5: retrieve-documents ✅ (3.2s, score: 88)
   Step 6: generate-roadmap ✅ (8.1s, score: 95)
   Step 7: validate-roadmap ✅ (1.2s, score: 90)

🔍 Final validation... ✅ (score: 92)
📦 Aggregating results... ✅
✅ ORCHESTRATION COMPLETE (45,200ms)

Response:
{
  "success": true,
  "modules": [
    { "name": "React Fundamentals", "days": 7, "skills": [...] },
    { "name": "Advanced Patterns", "days": 10, "skills": [...] },
    ...
  ],
  "metadata": {
    "agentsUsed": 7,
    "executionTime": "45.2s",
    "validationScore": 92,
    "strategy": "retry"
  }
}
```

### ⚠️ With Recovery
```
Step 5: retrieve-documents ⚠️ (error on attempt 1)
   Retrying... (backoff 1000ms)
   Attempt 2 ✅ (2.1s, score: 85)

🔄 RECOVERY TRIGGERED
   Issue: "Low document quality"
   Strategy: "retry with expanded search"
   Result: Recovered ✅
```

---

## Summary

| Test Type | Time | Effort | Coverage |
|-----------|------|--------|----------|
| **Smoke Test** | 2 min | Low | System startup |
| **Functional** | 10 min | Low | Happy paths |
| **Unit Tests** | 20 min | High | Code logic |
| **Integration** | 15 min | High | End-to-end |
| **Performance** | 5 min | Low | Speed/load |
| **Error Scenarios** | 10 min | Medium | Failure modes |

**✅ Start with Smoke + Functional, then expand to Unit + Integration**
