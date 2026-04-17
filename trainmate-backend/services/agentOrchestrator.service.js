//trainmate-backend/services/agentOrchestrator.service.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { db } from "../config/firebase.js";
import { extractSkillsAgentically } from "./agenticSkillExtractor.service.js";
import { generateRoadmap } from "./llmService.js";
import { evaluateCode } from "./codeEvaluator.service.js";
import { retrieveDeptDocsFromPinecone } from "./pineconeService.js";
import { applyGuardrails } from "./guardrail.service.js";
import { policyEngine } from "./policy/policyEngine.service.js";

dotenv.config();

let genAI = null;
let initialized = false;

function initializeLLMs() {
  if (initialized) return;
  
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

  if (!hasGeminiKey) {
    throw new Error("❌ GEMINI_API_KEY is required");
  }
  
  if (hasGeminiKey) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  
  initialized = true;
}

/**
 * AGENT ORCHESTRATOR SERVICE
 * 
 * Provides intelligent orchestration of multi-agent workflows
 * - Planner Agent: Decides execution plan
 * - Validator Agent: Checks output quality
 * - Aggregator Agent: Combines results
 * - Pivot Agent: Handles failures with alternatives
 */
export class AgentOrchestrator {
  constructor() {
    this.agents = new Map(); // Registry: { name: agent function }
    this.executionHistory = []; // Audit log
    this.maxHistorySize = 100;
    this.coreAgentsRegistered = false;
    this.registerCoreAgents();
  }

  registerCoreAgents() {
    if (this.coreAgentsRegistered) {
      return;
    }

    console.log('\n📋 Initializing Agent Registry...');

    // ==================== EXTRACTION AGENTS ====================

    this.registerAgent('extract-cv-skills', async ({ previousResults, context }) => {
      console.log('    🤖 CV Skills Agent: Analyzing CV...');
      const { cvText, expertise, trainingOn, structuredCv } = context;

      const { cvSkills, extractionDetails } = await extractSkillsAgentically({
        cvText,
        companyDocsText: '', // Will be filled after company doc fetching
        expertise,
        trainingOn,
        structuredCv,
      });

      return {
        cvSkills,
        extractionDetails,
        agentName: 'CV Skills Agent'
      };
    });

    this.registerAgent('extract-company-skills', async ({ previousResults, context }) => {
      console.log('    🤖 Company Skills Agent: Analyzing company docs...');
      const { companyDocsText, expertise, trainingOn } = context;

      const { companySkills, extractionDetails } = await extractSkillsAgentically({
        cvText: '',
        companyDocsText,
        expertise,
        trainingOn,
      });

      return {
        companySkills,
        extractionDetails,
        agentName: 'Company Skills Agent'
      };
    });

    this.registerAgent('analyze-skill-gaps', async ({ previousResults }) => {
      console.log('    🤖 Gap Analysis Agent: Identifying skill gaps...');
      const cvSkills = previousResults['extract-cv-skills']?.cvSkills || [];
      const companySkills = previousResults['extract-company-skills']?.companySkills || [];

      const skillGapMap = new Map();
      companySkills.forEach((skill) => {
        if (!cvSkills.includes(skill)) {
          skillGapMap.set(skill, skillGapMap.has(skill) ? skillGapMap.get(skill) + 1 : 1);
        }
      });

      const skillGap = Array.from(skillGapMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([skill]) => skill);

      const criticalGaps = skillGap.slice(0, Math.ceil(skillGap.length * 0.3));

      return {
        skillGap,
        criticalGaps,
        gapCount: skillGap.length,
        agentName: 'Gap Analysis Agent'
      };
    });

    // ==================== PLANNING AGENTS ====================

    this.registerAgent('plan-retrieval', async ({ previousResults, context }) => {
      console.log('    🤖 Planning Agent: Creating retrieval strategy...');
      const skillGap = previousResults['analyze-skill-gaps']?.skillGap || [];
      const { trainingOn } = context;

      const plannerPrompt = `Create a retrieval plan for skill gaps.

SKILL GAPS: ${skillGap.slice(0, 10).join(", ")}
TRAINING TOPIC: ${trainingOn}

Return JSON:
{
  "queries": ["query1", "query2", "query3"],
  "focusAreas": ["area1", "area2"],
  "priority": "high|medium|low"
}`;

      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } });
        const result = await model.generateContent(plannerPrompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const plan = JSON.parse(jsonMatch[0]);
          const queries = Array.isArray(plan?.queries)
            ? plan.queries.map((q) => String(q || '').trim()).filter(Boolean)
            : [];
          const focusAreas = Array.isArray(plan?.focusAreas)
            ? plan.focusAreas.map((f) => String(f || '').trim()).filter(Boolean)
            : [];
          const priority = ['high', 'medium', 'low'].includes(String(plan?.priority || '').toLowerCase())
            ? String(plan.priority).toLowerCase()
            : 'high';

          if (queries.length === 0 || focusAreas.length === 0) {
            throw new Error('Planner returned incomplete retrieval strategy');
          }

          return {
            ...plan,
            queries,
            focusAreas,
            priority,
            agentName: 'Planning Agent'
          };
        }
      } catch (error) {
        console.warn('    ⚠️  Planner failed, using default');
      }

      return {
        queries: [`${trainingOn} fundamentals`, `${trainingOn} best practices`],
        focusAreas: ['fundamentals', 'practices'],
        priority: 'high',
        agentName: 'Planning Agent'
      };
    });

    this.registerAgent('retrieve-documents', async ({ previousResults, context }) => {
      console.log('    🤖 Retrieval Agent: Fetching company documents...');
      const queries = previousResults['plan-retrieval']?.queries || [];
      const { companyId, deptId } = context;

      const allDocs = [];
      for (const query of queries) {
        try {
          const docs = await retrieveDeptDocsFromPinecone({
            queryText: query,
            companyId,
            deptName: deptId,
          });
          allDocs.push(...docs);
        } catch (error) {
          console.warn(`    ⚠️  Retrieval failed for query: ${query}`);
        }
      }

      const uniqueDocs = Array.from(new Map(allDocs.map((d) => [d.text, d])).values());

      return {
        documentCount: uniqueDocs.length,
        documents: uniqueDocs,
        agentName: 'Retrieval Agent'
      };
    });

    // ==================== GENERATION AGENTS ====================

    this.registerAgent('generate-roadmap', async ({ previousResults, context }) => {
      console.log('    🤖 Roadmap Generation Agent: Creating learning roadmap...');

      const skillGap = previousResults['analyze-skill-gaps']?.skillGap || [];
      const focusAreas = previousResults['plan-retrieval']?.focusAreas || [];
      const docs = previousResults['retrieve-documents']?.documents || [];

      const {
        cvText,
        expertise,
        trainingOn,
        level,
        trainingDuration,
        learningProfile,
      } = context;

      const docsText = docs.map((d) => d.text || '').join('\n').slice(0, 8000);
      const companyContext = `COMPANY DOCUMENTS:\n${docsText || 'No company documents available.'}`;

      const modules = await generateRoadmap({
        cvText,
        pineconeContext: docs,
        companyContext,
        expertise,
        trainingOn,
        trainingLevel: level,
        trainingDuration,
        skillGap,
        learningProfile,
        planFocusAreas: focusAreas,
      });

      return {
        modules,
        moduleCount: modules.length,
        totalDays: modules.reduce((sum, m) => sum + (m.estimatedDays || 1), 0),
        agentName: 'Roadmap Generation Agent'
      };
    });

    // ==================== EVALUATION AGENTS ====================

    this.registerAgent('evaluate-code', async ({ context }) => {
      console.log('    🤖 Code Evaluation Agent: Evaluating code submission...');
      const { userCode, testCases, question, language } = context;

      try {
        const expectedApproach = Array.isArray(testCases)
          ? testCases.map((tc) => `${tc?.input ?? ''} => ${tc?.expectedOutput ?? ''}`).join('\n')
          : String(testCases || 'Not provided');

        const evaluation = await evaluateCode({
          question: String(question || 'Coding problem not provided'),
          code: String(userCode || ''),
          expectedApproach,
          language: String(language || 'JavaScript'),
        });
        return {
          ...evaluation,
          agentName: 'Code Evaluation Agent'
        };
      } catch (error) {
        return {
          isCorrect: false,
          score: 0,
          feedback: 'Code evaluation failed',
          agentName: 'Code Evaluation Agent'
        };
      }
    });

    this.registerAgent('validate-roadmap', async ({ previousResults, context }) => {
      console.log('    🤖 Validation Agent: Checking roadmap quality...');
      const modules = previousResults['generate-roadmap']?.modules || [];
      const { trainingDuration } = context;

      const validatorPrompt = `Validate this roadmap quality.

MODULES: ${modules.length}
TOTAL DAYS: ${modules.reduce((sum, m) => sum + (m.estimatedDays || 1), 0)}
ALLOWED DURATION: ${trainingDuration}

CRITERIA:
1. Modules complete?
2. Estimated days realistic?
3. Skills covered adequate?
4. Logical progression?

Return JSON:
{
  "pass": true/false,
  "score": 0-100,
  "issues": ["issue1"],
  "improvements": ["suggestion1"]
}`;

      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } });
        const result = await model.generateContent(validatorPrompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const validation = JSON.parse(jsonMatch[0]);
          return {
            ...validation,
            agentName: 'Validation Agent'
          };
        }
      } catch (error) {
        console.warn('    ⚠️  Validation check skipped');
      }

      return {
        pass: modules.length > 0,
        score: 80,
        issues: [],
        agentName: 'Validation Agent'
      };
    });

    this.coreAgentsRegistered = true;
    console.log('✅ Agent Registry initialized (8 agents registered)\n');
  }

  ensureCoreAgentsRegistered() {
    if (!this.coreAgentsRegistered || this.agents.size === 0) {
      this.registerCoreAgents();
    }
  }

  isRoadmapGoal(goal) {
    return typeof goal === "string" && goal.toLowerCase().includes("roadmap");
  }

  getRoadmapModulesFromResults(results = {}) {
    if (!results || typeof results !== "object") return [];

    const direct = results?.["generate-roadmap"]?.modules;
    if (Array.isArray(direct)) return direct;

    const candidate = Object.values(results).find(
      (value) => Array.isArray(value?.modules) && value.modules.length > 0
    );
    return Array.isArray(candidate?.modules) ? candidate.modules : [];
  }

  compactForPrompt(value, maxChars = 1200) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (!text) return "";
    if (text.length <= maxChars) return text;

    const headChars = Math.floor(maxChars * 0.65);
    const tailChars = Math.max(0, maxChars - headChars - 32);
    const head = text.substring(0, headChars);
    const tail = tailChars > 0 ? text.substring(text.length - tailChars) : "";
    const removed = text.length - (head.length + tail.length);

    return `${head}\n... [${removed} chars omitted] ...\n${tail}`;
  }

  extractJsonFromText(text) {
    if (!text || typeof text !== "string") return null;

    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) return objectMatch[0];

    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) return arrayMatch[0];

    return null;
  }

  async generateJsonWithFallback(prompt, options = {}) {
    const { systemInstruction = null, purpose = "orchestration task" } = options;

    const geminiModels = ["gemini-2.5-flash", "gemini-2.5-pro"];
    if (genAI) {
      for (const modelName of geminiModels) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" },
            ...(systemInstruction ? { systemInstruction } : {}),
          });

          const result = await model.generateContent(prompt);
          const responseText = await result.response.text();
          const jsonText = this.extractJsonFromText(responseText);

          if (!jsonText) {
            throw new Error(`No JSON found in ${modelName} response`);
          }

          return JSON.parse(jsonText);
        } catch (error) {
          console.warn(`⚠️  ${modelName} failed for ${purpose}:`, error.message);
        }
      }
    }

    return null;
  }

  normalizeConstraintEnvelope(rawConstraints) {
    if (rawConstraints && typeof rawConstraints === "object" && !Array.isArray(rawConstraints)) {
      return {
        maxLatency: Number(rawConstraints.maxLatency) || 2000,
        costSensitivity: ["low", "medium", "high"].includes(rawConstraints.costSensitivity)
          ? rawConstraints.costSensitivity
          : "medium",
      };
    }

    return {
      maxLatency: 2000,
      costSensitivity: "medium",
    };
  }

  summarizeMemory(memory = {}) {
    if (!memory || typeof memory !== "object") {
      return "No historical memory available.";
    }

    const recentRuns = Array.isArray(memory.recentRuns) ? memory.recentRuns.slice(-5) : [];
    const failCount = recentRuns.filter((r) => r && r.success === false).length;
    const successCount = recentRuns.filter((r) => r && r.success === true).length;
    const avgValidation = recentRuns
      .map((r) => Number(r?.validationScore))
      .filter((v) => Number.isFinite(v));

    const avgValidationScore = avgValidation.length
      ? Math.round(avgValidation.reduce((sum, v) => sum + v, 0) / avgValidation.length)
      : null;

    return [
      `Last goal: ${memory.lastGoal || "unknown"}`,
      `Recent successes: ${successCount}`,
      `Recent failures: ${failCount}`,
      `Average validation score: ${avgValidationScore ?? "n/a"}`,
    ].join(" | ");
  }

  extractKeywords(text) {
    return String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2);
  }

  getMemoryDocRef(context = {}) {
    const { companyId, deptId, userId } = context;
    if (!companyId || !deptId || !userId) {
      return null;
    }

    return db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("agentMemory")
      .doc("orchestrator");
  }

  async loadLongTermMemory(context = {}) {
    const memoryRef = this.getMemoryDocRef(context);
    if (!memoryRef) {
      return null;
    }

    try {
      const snap = await memoryRef.get();
      return snap.exists ? snap.data() : null;
    } catch (error) {
      console.warn("⚠️  Failed to load orchestrator memory:", error.message);
      return null;
    }
  }

  async saveLongTermMemory(context = {}, update = {}) {
    const memoryRef = this.getMemoryDocRef(context);
    if (!memoryRef) {
      return;
    }

    try {
      const snap = await memoryRef.get();
      const existing = snap.exists ? snap.data() : {};
      const recentRuns = Array.isArray(existing.recentRuns) ? existing.recentRuns : [];

      const nextRecentRuns = [
        ...recentRuns,
        {
          goal: update.goal || "unknown",
          success: Boolean(update.success),
          error: update.error || null,
          agentsUsed: update.agentsUsed || [],
          validationScore: update.validationScore ?? null,
          executionTimeMs: update.executionTimeMs ?? null,
          timestamp: new Date(),
        },
      ].slice(-10);

      await memoryRef.set(
        {
          lastGoal: update.goal || existing.lastGoal || null,
          lastSuccess: Boolean(update.success),
          lastError: update.error || null,
          lastAgentsUsed: update.agentsUsed || [],
          lastValidationScore: update.validationScore ?? null,
          lastExecutionTimeMs: update.executionTimeMs ?? null,
          lastUpdatedAt: new Date(),
          recentRuns: nextRecentRuns,
        },
        { merge: true }
      );
    } catch (error) {
      console.warn("⚠️  Failed to save orchestrator memory:", error.message);
    }
  }

  getAutonomyGoalsCollection() {
    return db.collection("autonomousAgentGoals");
  }

  sanitizeAutonomousContextPatch(patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return {};
    }

    const forbiddenKeys = new Set([
      "GEMINI_API_KEY",
      "OPENAI_API_KEY",
      "COHERE_API_KEY",
      "serviceAccountKey",
      "admin",
    ]);

    const sanitized = {};
    for (const [key, value] of Object.entries(patch)) {
      if (forbiddenKeys.has(key)) continue;
      if (typeof value === "function") continue;
      sanitized[key] = value;
    }

    return sanitized;
  }

  async suggestFollowUpGoals({
    goal,
    context,
    finalOutput,
    validation,
    executionLog,
  }) {
    const autonomyDepth = Number(context?.autonomyDepth || 0);
    if (autonomyDepth >= 2) {
      return [];
    }

    const prompt = `You are an autonomous goal expansion agent.

PRIMARY GOAL: ${goal}
VALIDATION SCORE: ${Number(validation?.score || 0)}
VALIDATION REASON: ${validation?.reason || "n/a"}

EXECUTION SUMMARY:
${this.compactForPrompt(executionLog || [], 900)}

FINAL OUTPUT SUMMARY:
${this.compactForPrompt(finalOutput || {}, 1200)}

Suggest up to 2 useful follow-up goals only if they clearly improve learner outcomes.
Do not suggest duplicate or overly broad goals.

Return JSON only:
{
  "followUpGoals": [
    {
      "goal": "specific autonomous goal",
      "reason": "why this helps",
      "priority": 1,
      "contextPatch": {
        "focus": "..."
      }
    }
  ]
}`;

    try {
      const parsed = await this.generateJsonWithFallback(prompt, {
        purpose: "autonomous follow-up goal suggestion",
      });

      const rawGoals = Array.isArray(parsed?.followUpGoals) ? parsed.followUpGoals : [];

      return rawGoals
        .map((item) => ({
          goal: String(item?.goal || "").trim(),
          reason: String(item?.reason || "").trim(),
          priority: Math.max(0, Math.min(10, Number(item?.priority || 5))),
          contextPatch: this.sanitizeAutonomousContextPatch(item?.contextPatch || {}),
        }))
        .filter((item) => item.goal.length >= 12)
        .slice(0, 2);
    } catch {
      return [];
    }
  }

  async enqueueAutonomousGoals(goals = [], options = {}) {
    const autonomyGoalsRef = this.getAutonomyGoalsCollection();
    const createdIds = [];

    for (const goalItem of goals) {
      const goalText = String(goalItem?.goal || "").trim();
      if (!goalText) continue;

      const payload = {
        goal: goalText,
        reason: goalItem?.reason || null,
        status: "pending",
        priority: Math.max(0, Math.min(10, Number(goalItem?.priority || 5))),
        attempts: 0,
        maxAttempts: Math.max(1, Math.min(5, Number(options.maxAttempts || 3))),
        createdBy: options.createdBy || "agent",
        parentGoal: options.parentGoal || null,
        parentGoalId: options.parentGoalId || null,
        context: {
          ...(options.baseContext || {}),
          ...(goalItem?.contextPatch || {}),
          autonomyMode: true,
          allowAutonomousFollowUps: true,
          autonomyDepth: Math.min(3, Number(options.autonomyDepth || 0) + 1),
        },
        nextRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ref = await autonomyGoalsRef.add(payload);
      createdIds.push(ref.id);
    }

    return createdIds;
  }

  normalizePlan(plan, goal) {
    const availableAgents = new Set(this.agents.keys());
    const fallbackPlan = this.generateFallbackPlan(goal, Array.from(availableAgents));

    if (!plan || !Array.isArray(plan.steps)) {
      return {
        plan: fallbackPlan,
        warnings: ["Planner returned an invalid plan shape; using fallback."],
      };
    }

    const warnings = [];
    const normalizedSteps = [];

    for (const rawStep of plan.steps) {
      const rawAgent = typeof rawStep?.agent === "string" ? rawStep.agent.trim() : "";
      if (!rawAgent || !availableAgents.has(rawAgent)) {
        warnings.push(`Planner proposed unknown agent: ${rawAgent || "<empty>"}`);
        continue;
      }

      normalizedSteps.push({
        stepNumber: normalizedSteps.length + 1,
        description: rawStep?.description || `Execute ${rawAgent}`,
        agent: rawAgent,
        critical: rawStep?.critical !== false,
        dependencies: Array.isArray(rawStep?.dependencies)
          ? rawStep.dependencies.filter((d) => typeof d === "string" && d.trim())
          : [],
        retryPolicy: {
          maxRetries: Math.max(1, Number(rawStep?.retryPolicy?.maxRetries) || 1),
          backoffMs: Math.max(0, Number(rawStep?.retryPolicy?.backoffMs) || 1000),
        },
      });
    }

    if (normalizedSteps.length === 0) {
      return {
        plan: fallbackPlan,
        warnings: [...warnings, "No valid planned steps remained; using fallback."],
      };
    }

    const plannedAgentSet = new Set(normalizedSteps.map((s) => s.agent));
    for (const step of normalizedSteps) {
      step.dependencies = step.dependencies.filter((dep) => {
        const exists = plannedAgentSet.has(dep);
        if (!exists) {
          warnings.push(`Removed invalid dependency '${dep}' from agent '${step.agent}'.`);
        }
        return exists;
      });
    }

    const allowedStrategies = new Set(["fail_fast", "retry", "skip_non_critical", "pivot"]);
    const errorStrategy = allowedStrategies.has(plan.errorStrategy)
      ? plan.errorStrategy
      : "retry";

    if (this.isRoadmapGoal(goal) && availableAgents.has("generate-roadmap")) {
      const hasRoadmapGenerator = normalizedSteps.some((s) => s.agent === "generate-roadmap");
      if (!hasRoadmapGenerator) {
        const deps = [];
        if (normalizedSteps.some((s) => s.agent === "analyze-skill-gaps")) {
          deps.push("analyze-skill-gaps");
        }

        normalizedSteps.push({
          stepNumber: normalizedSteps.length + 1,
          description: "Generate roadmap",
          agent: "generate-roadmap",
          critical: true,
          dependencies: deps,
          retryPolicy: {
            maxRetries: 2,
            backoffMs: 1000,
          },
        });
        warnings.push("Planner omitted generate-roadmap; injected required roadmap step.");
      }

      // Company document retrieval is useful but optional in early data phases.
      // Keep the agent in the plan, but do not allow it to block roadmap generation.
      for (const step of normalizedSteps) {
        if (step.agent === "retrieve-documents") {
          step.critical = false;
        }
      }
    }

    return {
      plan: {
        ...plan,
        steps: normalizedSteps,
        errorStrategy,
      },
      warnings,
    };
  }

  resolveAgentDefinition(agentEntry) {
    if (typeof agentEntry === "function") {
      return {
        execute: agentEntry,
      };
    }

    if (agentEntry && typeof agentEntry === "object" && typeof agentEntry.execute === "function") {
      return agentEntry;
    }

    return null;
  }

  /**
   * 🎯 Main orchestration entry point
   * 
   * @param {string} goal - What needs to be accomplished
   * @param {Object} context - User data, constraints, preferences
   * @returns {Promise<Object>} { finalOutput, metadata, explanation, executionLog }
   */
  async orchestrate(goal, context) {
    initializeLLMs();
    
    console.log("\n" + "=".repeat(70));
    console.log("🎯 AGENT ORCHESTRATOR STARTED");
    console.log(`Goal: ${goal}`);
    console.log("=".repeat(70));

    const orchestrationStart = Date.now();
    const executionLog = [];

    try {
      const longTermMemory = await this.loadLongTermMemory(context);
      const runContext = {
        ...context,
        orchestrationMemory: longTermMemory,
      };
      const constraints = this.normalizeConstraintEnvelope(runContext.constraints);
      const maxIterations = Math.max(2, Math.min(4, Number(runContext.maxReasoningIterations) || 3));

      let activeContext = runContext;
      let activePlan = null;
      let activeWarnings = [];
      let finalExecutionResults = null;
      let finalValidation = null;
      let successfulCycle = null;

      // STEP 1: Generate initial execution plan
      console.log("\n📋 STEP 1: Generating execution plan...");
      const rawPlan = await this.generatePlan(goal, runContext);
      const { plan, warnings } = this.normalizePlan(rawPlan, goal);
      activePlan = plan;
      activeWarnings = warnings;

      if (warnings.length > 0) {
        console.warn("⚠️  Plan sanitization warnings:", warnings);
      }

      executionLog.push({
        stage: "planning",
        status: "success",
        detail: `Generated plan with ${plan.steps.length} steps`,
        steps: plan.steps.map((s) => s.agent),
        errorStrategy: plan.errorStrategy,
        warnings,
      });
      console.log(`✅ Plan generated: ${plan.steps.length} steps, strategy: ${plan.errorStrategy}`);

      for (let cycle = 1; cycle <= maxIterations; cycle++) {
        console.log(`\n🔁 REASONING CYCLE ${cycle}/${maxIterations}`);
        console.log("⚙️  Execute...");
        const executionResults = await this.executePlan(activePlan, activeContext, executionLog);
        console.log(`✅ Execution complete: ${Object.keys(executionResults.results).length} results`);

        console.log("🔍 Critique (validation)...");
        const validation = await this.validateFinalOutput(
          executionResults.results,
          goal,
          executionLog
        );

        finalExecutionResults = executionResults;
        finalValidation = validation;

        executionLog.push({
          stage: "cycle-validation",
          cycle,
          status: validation.pass ? "pass" : "fail",
          reason: validation.reason || "No reason provided",
          score: validation.score,
        });

        if (validation.pass) {
          successfulCycle = cycle;
          break;
        }

        console.log(`⚠️  Cycle ${cycle} failed validation: ${validation.reason}`);
        if (cycle >= maxIterations) {
          break;
        }

        console.log("🧠 Replan + refine...");
        const critique = await this.critiqueExecutionAndSuggestReplan({
          goal,
          cycle,
          plan: activePlan,
          executionResults,
          validation,
          context: activeContext,
          constraints,
        });

        const replanned = this.applyReplanFromCritique(activePlan, critique);
        const normalizedReplan = this.normalizePlan(replanned, goal);
        activePlan = normalizedReplan.plan;
        activeWarnings = normalizedReplan.warnings;
        activeContext = this.refineContextForNextIteration(activeContext, critique, cycle);

        executionLog.push({
          stage: "replan",
          cycle,
          status: "updated",
          critique,
          warnings: activeWarnings,
          nextSteps: activePlan.steps.map((s) => s.agent),
        });

        if (activeWarnings.length > 0) {
          console.warn("⚠️  Replan sanitization warnings:", activeWarnings);
        }
      }

      if (!finalExecutionResults || !finalValidation) {
        throw new Error("No execution results available after reasoning loop");
      }

      if (!finalValidation.pass && finalValidation.canRecover) {
        console.log("🔄 Attempting final recovery...");
        const recoveryResult = await this.attemptRecovery(
          finalExecutionResults,
          finalValidation,
          activeContext,
          executionLog,
          activePlan
        );
        if (recoveryResult.success) {
          finalExecutionResults.results = recoveryResult.results;
          finalValidation = await this.validateFinalOutput(
            finalExecutionResults.results,
            goal,
            executionLog
          );
        }
      }

      if (!finalValidation.pass) {
        throw new Error(`Final validation failed after ${maxIterations} cycles: ${finalValidation.reason}`);
      }

      if (this.isRoadmapGoal(goal)) {
        const generatedModules = this.getRoadmapModulesFromResults(finalExecutionResults.results);
        if (!Array.isArray(generatedModules) || generatedModules.length === 0) {
          throw new Error("Roadmap generation step did not produce modules");
        }
      }

      // STEP 4: Aggregate results
      console.log("\n📦 STEP 4: Aggregating results...");
      const finalOutput = await this.aggregateResults(
        finalExecutionResults.results,
        goal,
        executionLog
      );

      if (this.isRoadmapGoal(goal)) {
        const outputModules = finalOutput?.finalOutput?.modules;
        if (!Array.isArray(outputModules) || outputModules.length === 0) {
          throw new Error("Aggregation produced no roadmap modules");
        }
      }

      let queuedFollowUpGoalIds = [];
      if (context?.autonomyMode === true || context?.allowAutonomousFollowUps === true) {
        const followUpGoals = await this.suggestFollowUpGoals({
          goal,
          context,
          finalOutput: finalOutput.finalOutput,
          validation: finalValidation,
          executionLog,
        });

        if (followUpGoals.length > 0) {
          queuedFollowUpGoalIds = await this.enqueueAutonomousGoals(followUpGoals, {
            createdBy: "agent",
            parentGoal: goal,
            parentGoalId: context?.autonomyGoalId || null,
            baseContext: {
              companyId: context?.companyId,
              deptId: context?.deptId,
              userId: context?.userId,
              constraints: context?.constraints,
            },
            autonomyDepth: Number(context?.autonomyDepth || 0),
            maxAttempts: 2,
          });
        }
      }

      // STEP 5: Log execution
      const executionTime = Date.now() - orchestrationStart;
      this.logExecution({
        goal,
        plan: activePlan,
        executionResults: finalExecutionResults,
        finalOutput,
        validation: finalValidation,
        successfulCycle,
        maxIterations,
        queuedFollowUpGoalIds,
        executionTime,
        executionLog,
      });

      await this.saveLongTermMemory(context, {
        goal,
        success: true,
        agentsUsed: activePlan.steps.map((s) => s.agent),
        validationScore: finalValidation.score,
        executionTimeMs: executionTime,
      });

      console.log("\n" + "=".repeat(70));
      console.log(`✅ ORCHESTRATION COMPLETE (${executionTime}ms)`);
      console.log("=".repeat(70) + "\n");

      return {
        success: true,
        finalOutput: finalOutput.finalOutput,
        metadata: {
          agentsUsed: activePlan.steps.map((s) => s.agent),
          executionTime: `${executionTime}ms`,
          stepsExecuted: finalExecutionResults.executionLog.length,
          validationScore: finalValidation.score,
          strategy: activePlan.errorStrategy,
          reasoningCycles: successfulCycle || maxIterations,
          queuedFollowUpGoals: queuedFollowUpGoalIds.length,
        },
        explanation: finalOutput.explanation,
        executionLog: executionLog,
      };
    } catch (error) {
      console.error("\n🔥 ORCHESTRATION FAILED:", error.message);
      this.logExecution({
        goal,
        error: error.message,
        executionLog,
        timestamp: new Date(),
      });

      await this.saveLongTermMemory(context, {
        goal,
        success: false,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        executionLog: executionLog,
      };
    }
  }

  /**
   * 🤖 PLANNER AGENT - Agentic decision-making
   * Analyzes goal and decides which agents to call and in what order
   */
  async generatePlan(goal, context) {
    const availableAgents = Array.from(this.agents.keys());

    try {
      const plan = await policyEngine.decide("planGeneration", {
        goal,
        context,
        availableAgents,
      });
      if (!plan) {
        throw new Error("No valid planner JSON from any LLM");
      }
      return plan;
    } catch (error) {
      console.warn("⚠️  Planner agent failed:", error.message);
      // Return fallback plan
      return this.generateFallbackPlan(goal, availableAgents);
    }
  }

  /**
   * Generate fallback plan if planner fails
   */
  generateFallbackPlan(goal, availableAgents) {
    console.log("🔄 Using fallback plan");

    // Simple heuristic-based planning
    const steps = [];

    if (goal.includes("roadmap") && availableAgents.includes("extract-cv-skills")) {
      steps.push({
        stepNumber: 1,
        description: "Extract CV skills",
        agent: "extract-cv-skills",
        critical: true,
        dependencies: [],
      });
      steps.push({
        stepNumber: 2,
        description: "Extract company skills",
        agent: "extract-company-skills",
        critical: true,
        dependencies: [],
      });
      steps.push({
        stepNumber: 3,
        description: "Analyze skill gaps",
        agent: "analyze-skill-gaps",
        critical: true,
        dependencies: ["extract-cv-skills", "extract-company-skills"],
      });
      steps.push({
        stepNumber: 4,
        description: "Generate roadmap",
        agent: "generate-roadmap",
        critical: true,
        dependencies: ["analyze-skill-gaps"],
      });
    }

    return {
      steps,
      reasoning: "Fallback plan based on goal keywords",
      errorStrategy: "retry",
      estimatedCost: "medium",
    };
  }

  async critiqueExecutionAndSuggestReplan({
    goal,
    cycle,
    plan,
    executionResults,
    validation,
    context,
    constraints,
  }) {
    const availableAgents = Array.from(this.agents.keys());
    const critique = await policyEngine.decide("replanCritique", {
      goal,
      cycle,
      plan,
      executionResults,
      validation,
      constraints,
      availableAgents,
      contextSnapshot: context,
    });

    return critique || {
      reason: validation?.reason || "Validation failed; replan with stronger execution coverage",
      addAgents: [],
      removeAgents: [],
      prioritizeAgents: [],
      errorStrategy: "retry",
      refineContext: {
        focusTopics: [],
        hints: ["Increase grounding and completeness in next cycle"],
      },
    };
  }

  applyReplanFromCritique(plan, critique = {}) {
    const baseSteps = Array.isArray(plan?.steps)
      ? plan.steps.map((step) => ({
          ...step,
          dependencies: Array.isArray(step.dependencies) ? [...step.dependencies] : [],
          retryPolicy: {
            maxRetries: Math.max(1, Number(step?.retryPolicy?.maxRetries) || 1),
            backoffMs: Math.max(0, Number(step?.retryPolicy?.backoffMs) || 1000),
          },
        }))
      : [];

    const availableAgents = new Set(this.agents.keys());
    const removeSet = new Set(
      (Array.isArray(critique.removeAgents) ? critique.removeAgents : []).filter((a) =>
        availableAgents.has(a)
      )
    );

    let steps = baseSteps.filter((step) => !removeSet.has(step.agent));
    const existingAgents = new Set(steps.map((s) => s.agent));

    const addAgents = (Array.isArray(critique.addAgents) ? critique.addAgents : []).filter(
      (name) => availableAgents.has(name) && !existingAgents.has(name)
    );

    for (const agentName of addAgents) {
      steps.push({
        stepNumber: steps.length + 1,
        description: `Refinement pass: execute ${agentName}`,
        agent: agentName,
        critical: true,
        dependencies: [],
        retryPolicy: {
          maxRetries: 2,
          backoffMs: 1000,
        },
      });
      existingAgents.add(agentName);
    }

    const priority = Array.isArray(critique.prioritizeAgents) ? critique.prioritizeAgents : [];
    if (priority.length > 0) {
      const prioritySet = new Set(priority);
      steps.sort((a, b) => {
        const aPriority = prioritySet.has(a.agent) ? 0 : 1;
        const bPriority = prioritySet.has(b.agent) ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return (a.stepNumber || 0) - (b.stepNumber || 0);
      });
    }

    const plannedAgents = new Set(steps.map((s) => s.agent));
    steps = steps.map((step, idx) => ({
      ...step,
      stepNumber: idx + 1,
      dependencies: (Array.isArray(step.dependencies) ? step.dependencies : []).filter((dep) =>
        plannedAgents.has(dep)
      ),
    }));

    const allowedStrategies = new Set(["fail_fast", "retry", "skip_non_critical", "pivot"]);
    const errorStrategy = allowedStrategies.has(critique.errorStrategy)
      ? critique.errorStrategy
      : plan?.errorStrategy || "retry";

    return {
      ...plan,
      steps,
      errorStrategy,
      reasoning: `${plan?.reasoning || ""} | Replan: ${critique.reason || "n/a"}`,
    };
  }

  refineContextForNextIteration(context, critique = {}, cycle = 1) {
    const refineContext =
      critique.refineContext && typeof critique.refineContext === "object"
        ? critique.refineContext
        : {};

    const previousHints = Array.isArray(context?.orchestrationHints)
      ? context.orchestrationHints
      : [];
    const newHints = Array.isArray(refineContext.hints) ? refineContext.hints : [];

    return {
      ...context,
      orchestrationHints: [...previousHints, ...newHints].slice(-10),
      orchestrationFocusTopics: Array.isArray(refineContext.focusTopics)
        ? refineContext.focusTopics
        : context?.orchestrationFocusTopics || [],
      orchestrationLoop: {
        iteration: cycle + 1,
        critiqueReason: critique.reason || null,
      },
    };
  }

  /**
   * Centralized quiz decision policy.
   */
  async decideQuizOutcome(decisionInput = {}) {
    return policyEngine.decide("quizOutcome", decisionInput);
  }

  /**
   * Centralized notification decision policy.
   */
  async decideNotificationStrategy(context = {}) {
    return policyEngine.decide("notification", context);
  }

  /**
   * ⚙️ Execute the generated plan with monitoring
   */
  async executeStepWithRetries(step, context, results, stepOrderMap) {
    const stepStart = Date.now();

    try {
      console.log(`\n  ⚙️  Step ${step.stepNumber}: ${step.description}`);
      console.log(`      Agent: ${step.agent} | Critical: ${step.critical}`);

      const missingDependencies = (step.dependencies || []).filter(
        (dep) => !results[dep]
      );
      if (missingDependencies.length > 0) {
        throw new Error(
          `Missing dependencies for ${step.agent}: ${missingDependencies.join(", ")}`
        );
      }

      const agentEntry = this.agents.get(step.agent);
      if (!agentEntry) {
        throw new Error(`Agent not found in registry: ${step.agent}`);
      }

      const agentDefinition = this.resolveAgentDefinition(agentEntry);
      if (!agentDefinition) {
        throw new Error(`Agent definition is invalid for: ${step.agent}`);
      }

      let stepInput = {
        ...step.input,
        previousResults: { ...results },
        context,
      };

      let output;
      let attempts = 0;
      const maxRetries = step.retryPolicy?.maxRetries || 1;
      let lastError;

      while (attempts < maxRetries) {
        try {
          const constraints = this.normalizeConstraintEnvelope(context?.constraints);
          const executionPlan = {
            strategy: "single_pass",
            retrievalDepth: "standard",
            notes: "control-plane execution",
          };

          output = await agentDefinition.execute({
            ...stepInput,
            executionPlan,
            constraints,
          });

          const validation = await this.validateOutput(output, step);
          const pass = Boolean(validation.pass);
          const mergedScore = Number(validation.score || 0);
          const mergedIssues = Array.isArray(validation.issues) ? validation.issues : [];
          const mergedReason = validation.reason || "Validation result unavailable";

          if (pass) {
            results[step.agent] = output;
            stepOrderMap[step.agent] = step.stepNumber;

            const stepLog = {
              stepNumber: step.stepNumber,
              agent: step.agent,
              status: "SUCCESS",
              duration: Date.now() - stepStart,
              executionPlan,
              validation: {
                score: mergedScore,
                reason: mergedReason,
                issues: mergedIssues,
              },
            };

            console.log(`      ✅ Success (validation: ${mergedScore}/100)`);
            return { success: true, log: stepLog, output };
          }

          lastError = new Error(`Validation failed: ${mergedReason}`);
          attempts++;
          console.warn(`      ⚠️  Validation issue: ${mergedReason}`);

          if (attempts < maxRetries) {
            const recoveryDecision = await policyEngine.decide("stepRecovery", {
              step,
              attempt: attempts,
              maxRetries,
              stepInput,
              validation: {
                pass,
                score: mergedScore,
                reason: mergedReason,
                issues: mergedIssues,
              },
              output,
              error: lastError,
            });

            if (recoveryDecision.action === "fail") {
              throw lastError;
            }

            if (recoveryDecision.action === "skip") {
              return {
                success: false,
                error: new Error(`Agent requested skip after self-recovery analysis: ${step.agent}`),
                log: {
                  stepNumber: step.stepNumber,
                  agent: step.agent,
                  status: "SKIPPED",
                  reason: "Policy engine requested skip",
                  duration: Date.now() - stepStart,
                  executionPlan,
                },
              };
            }

            if (recoveryDecision.inputPatch) {
              stepInput = {
                ...stepInput,
                ...recoveryDecision.inputPatch,
              };
            }

            await this.sleep(step.retryPolicy?.backoffMs || 1000);
          }
        } catch (error) {
          lastError = error;
          attempts++;
          console.warn(`      ⚠️  Attempt ${attempts}/${maxRetries} failed:`, error.message);

          if (attempts < maxRetries) {
            await this.sleep(step.retryPolicy?.backoffMs || 1000);
          }
        }
      }

      if (lastError) {
        throw lastError;
      }

      throw new Error(`Step ${step.agent} failed without explicit error`);
    } catch (error) {
      console.error(`      🔥 Step ${step.stepNumber} failed:`, error.message);
      return {
        success: false,
        error,
        log: {
          stepNumber: step.stepNumber,
          agent: step.agent,
          status: "FAILED",
          reason: error.message,
          duration: Date.now() - stepStart,
        },
      };
    }
  }

  async executePlan(plan, context, executionLog) {
    const results = {};
    const stepExecutionLog = [];
    const stepOrderMap = {}; // For dependency resolution
    const pendingSteps = new Map(plan.steps.map((step) => [step.agent, step]));
    const failedAgents = new Set();

    while (pendingSteps.size > 0) {
      const readySteps = [];
      const blockedAgents = [];

      for (const step of pendingSteps.values()) {
        const deps = step.dependencies || [];
        const blockedByFailed = deps.some((dep) => failedAgents.has(dep));
        if (blockedByFailed) {
          blockedAgents.push(step.agent);
          continue;
        }

        const depsSatisfied = deps.every((dep) => results[dep]);
        if (depsSatisfied) {
          readySteps.push(step);
        }
      }

      if (readySteps.length === 0) {
        for (const step of pendingSteps.values()) {
          const deps = step.dependencies || [];
          const unresolvedDeps = deps.filter((dep) => !results[dep]);
          const reason = `Unresolvable dependencies for ${step.agent}: ${unresolvedDeps.join(", ")}`;
          const stepLog = {
            stepNumber: step.stepNumber,
            agent: step.agent,
            status: "FAILED",
            reason,
            duration: 0,
          };
          stepExecutionLog.push(stepLog);
          failedAgents.add(step.agent);

          if (step.critical && plan.errorStrategy === "fail_fast") {
            throw new Error(reason);
          }
        }
        break;
      }

      const batchOutcomes = await Promise.all(
        readySteps.map((step) => this.executeStepWithRetries(step, context, results, stepOrderMap))
      );

      for (let i = 0; i < batchOutcomes.length; i++) {
        const step = readySteps[i];
        const outcome = batchOutcomes[i];
        pendingSteps.delete(step.agent);

        if (outcome.success) {
          stepExecutionLog.push(outcome.log);
          continue;
        }

        failedAgents.add(step.agent);
        stepExecutionLog.push(outcome.log);

        if (step.critical && plan.errorStrategy === "fail_fast") {
          throw outcome.error;
        }

        if (plan.errorStrategy === "skip_non_critical") {
          continue;
        }
      }

      for (const blockedAgent of blockedAgents) {
        const step = pendingSteps.get(blockedAgent);
        if (!step) continue;

        const deps = step.dependencies || [];
        if (!deps.some((dep) => failedAgents.has(dep))) continue;

        const reason = `Skipped due to failed dependency for ${step.agent}`;
        stepExecutionLog.push({
          stepNumber: step.stepNumber,
          agent: step.agent,
          status: "SKIPPED",
          reason,
          duration: 0,
        });
        pendingSteps.delete(step.agent);
      }
    }

    return {
      results,
      executionLog: stepExecutionLog,
      stepOrderMap,
      failedAgents: Array.from(failedAgents),
    };
  }

  /**
   * 🤖 VALIDATOR AGENT - Assess output quality
   */
  async validateOutput(output, step) {
    if (!output) {
      return {
        pass: false,
        score: 0,
        reason: "No output returned",
        issues: ["Output is null or undefined"],
        canRecover: true,
      };
    }

    // Deterministic validation for known agents (avoid LLM false negatives)
    if (step.agent === "extract-cv-skills") {
      const count = Array.isArray(output.cvSkills) ? output.cvSkills.length : 0;
      return {
        pass: count > 0,
        score: count > 0 ? 90 : 30,
        reason: count > 0 ? "CV skills extracted" : "No CV skills extracted",
        issues: count > 0 ? [] : ["cvSkills is empty"],
        canRecover: true,
      };
    }

    if (step.agent === "extract-company-skills") {
      const count = Array.isArray(output.companySkills) ? output.companySkills.length : 0;
      return {
        pass: count > 0,
        score: count > 0 ? 90 : 30,
        reason: count > 0 ? "Company skills extracted" : "No company skills extracted",
        issues: count > 0 ? [] : ["companySkills is empty"],
        canRecover: true,
      };
    }

    if (step.agent === "analyze-skill-gaps") {
      const hasArray = Array.isArray(output.skillGap);
      return {
        pass: hasArray,
        score: hasArray ? 95 : 40,
        reason: hasArray ? "Skill gap analysis available" : "Missing skillGap array",
        issues: hasArray ? [] : ["skillGap missing or invalid"],
        canRecover: true,
      };
    }

    if (step.agent === "plan-retrieval") {
      const queries = Array.isArray(output.queries) ? output.queries.filter((q) => String(q || "").trim()) : [];
      const focusAreas = Array.isArray(output.focusAreas)
        ? output.focusAreas.filter((a) => String(a || "").trim())
        : [];
      const priority = String(output.priority || "").toLowerCase();
      const validPriority = ["high", "medium", "low"].includes(priority);
      const pass = queries.length > 0 && focusAreas.length > 0 && validPriority;

      const issues = [];
      if (queries.length === 0) issues.push("queries must contain at least one non-empty value");
      if (focusAreas.length === 0) issues.push("focusAreas must contain at least one non-empty value");
      if (!validPriority) issues.push("priority must be one of: high, medium, low");

      return {
        pass,
        score: pass ? 92 : 35,
        reason: pass ? "Retrieval plan structure is valid" : "Retrieval plan is incomplete or malformed",
        issues,
        canRecover: true,
      };
    }

    if (step.agent === "retrieve-documents") {
      const docs = Array.isArray(output.documents) ? output.documents : [];
      const declaredCount = Number.isFinite(output.documentCount)
        ? output.documentCount
        : docs.length;
      const countMatches = declaredCount === docs.length;

      return {
        pass: true,
        score: docs.length > 0 ? 90 : 65,
        reason:
          docs.length > 0
            ? countMatches
              ? "Documents retrieved successfully"
              : "Documents retrieved (count normalized by actual array length)"
            : "No documents retrieved; continuing with CV-driven roadmap generation",
        issues:
          docs.length > 0
            ? countMatches
              ? []
              : ["documentCount did not match documents.length in raw output"]
            : ["documents array is empty"],
        canRecover: false,
      };
    }

    if (step.agent === "generate-roadmap") {
      const modules = Array.isArray(output.modules) ? output.modules : [];
      const validModules = modules.filter((m) => m && typeof m === "object").length;
      return {
        pass: validModules > 0,
        score: validModules > 0 ? 92 : 20,
        reason: validModules > 0 ? "Roadmap modules generated" : "No roadmap modules generated",
        issues: validModules > 0 ? [] : ["modules array is empty or invalid"],
        canRecover: true,
      };
    }

    if (step.agent === "validate-roadmap") {
      const hasSignal = typeof output.pass === "boolean" || typeof output.score === "number";
      return {
        pass: hasSignal,
        score: hasSignal ? 90 : 50,
        reason: hasSignal ? "Validation output present" : "Validation output incomplete",
        issues: hasSignal ? [] : ["validate-roadmap output missing pass/score"],
        canRecover: false,
      };
    }

    const validatorPrompt = `Validate this agent output.

STEP: ${step.description}
AGENT: ${step.agent}

OUTPUT:
${this.compactForPrompt(output, 1400)}

VALIDATION CRITERIA:
1. Is the output in expected format?
2. Is the content complete and meaningful?
3. Are there any obvious errors or inconsistencies?
4. Quality score (0-100)?

Return ONLY valid JSON:
{
  "pass": true/false,
  "score": 0-100,
  "reason": "Brief explanation",
  "issues": ["issue1", "issue2"],
  "canRecover": true/false
}`;

    try {
      const validation = await this.generateJsonWithFallback(validatorPrompt, {
        purpose: "step output validation",
      });
      if (validation) {
        const guardrail = applyGuardrails({
          output: typeof output === "string" ? output : JSON.stringify(output),
          userMessage: step.description || step.agent,
          contextText: JSON.stringify(step.input || {}),
          expectedFormat: "text",
        });

        return {
          ...validation,
          pass: validation.score >= 60 && guardrail.pass,
          score: Math.round((Number(validation.score || 0) + guardrail.score) / 2),
          guardrail,
        };
      }
    } catch {
      // Silently fail validation check
    }

    return {
      pass: true,
      score: 75,
      reason: "Validation check skipped",
      issues: [],
      canRecover: false,
    };
  }

  /**
   * 🤖 RECOVERY AGENT - Attempt to fix failures
   */
  async attemptRecovery(executionResults, validation, context, executionLog, plan) {
    console.log("🔧 Recovery Agent: Analyzing failure...");

    const issues = Array.isArray(validation?.issues) ? validation.issues : [];
    const latestKey = Object.keys(executionResults.results || {}).pop();
    const latestOutput = latestKey ? executionResults.results[latestKey] : null;
    const failedSteps = (executionResults.executionLog || []).filter(
      (s) => s.status === "FAILED" || s.status === "SKIPPED"
    );
    const lastFailedStep = failedSteps[failedSteps.length - 1] || null;
    const criticalMissingStep = (plan?.steps || []).find(
      (s) => s.critical && !executionResults.results?.[s.agent]
    );
    const targetAgent =
      criticalMissingStep?.agent ||
      lastFailedStep?.agent ||
      latestKey ||
      null;
    const targetStep = (plan?.steps || []).find((s) => s.agent === targetAgent) || null;

    try {
      const strategy = await policyEngine.decide("recoveryStrategy", {
        targetAgent,
        latestOutput,
        issues,
        validation,
        executionResults,
      });

      if (!strategy) {
        return { success: false };
      }

      console.log(`   Strategy: ${strategy.strategy}`);

      if (strategy.strategy === "retry" && targetStep) {
        const retriedStep = {
          ...targetStep,
          input: {
            ...(targetStep.input || {}),
            ...(strategy.modifiedInput || {}),
          },
        };

        const retryResult = await this.executeStepWithRetries(
          retriedStep,
          context,
          executionResults.results,
          executionResults.stepOrderMap || {}
        );

        executionResults.executionLog.push(retryResult.log);
        executionLog.push({
          stage: "recovery",
          status: retryResult.success ? "success" : "failed",
          targetAgent: retriedStep.agent,
          strategy: strategy.strategy,
          reason: retryResult.success ? "Step re-run succeeded" : retryResult.log.reason,
        });

        return {
          success: retryResult.success,
          strategy: strategy.strategy,
          results: executionResults.results,
        };
      }

      executionLog.push({
        stage: "recovery",
        status: "skipped",
        targetAgent,
        strategy: strategy.strategy || "unknown",
        reason: "Recovery strategy did not execute step re-run",
      });

      return {
        success: strategy.strategy === "skip" || strategy.strategy === "fallback",
        strategy: strategy.strategy,
        results: executionResults.results,
      };
    } catch (error) {
      console.warn("   Recovery failed:", error.message);
    }

    return { success: false };
  }

  /**
   * 🔍 Validate final output before aggregation
   */
  async validateFinalOutput(results, goal, executionLog) {
    // Deterministic readiness gate for roadmap goals
    if (this.isRoadmapGoal(goal)) {
      const modules = this.getRoadmapModulesFromResults(results);
      if (Array.isArray(modules) && modules.length > 0) {
        return {
          pass: true,
          canRecover: false,
          score: 95,
          reason: "Roadmap generation output is present and non-empty",
          suggestions: [],
        };
      }

      return {
        pass: false,
        canRecover: true,
        score: 15,
        reason: "Roadmap generation output is missing modules",
        suggestions: ["Ensure generate-roadmap executes and returns a non-empty modules array"],
      };
    }

    const resultsSnapshot = Object.keys(results).slice(-3); // Last 3 agent outputs

    const finalValidatorPrompt = `The orchestration is near complete. Validate readiness.

GOAL: ${goal}
COMPLETED AGENTS: ${resultsSnapshot.join(", ")}

SAMPLE OUTPUTS:
${this.compactForPrompt(
  Object.fromEntries(resultsSnapshot.map((k) => [k, results[k]])),
  1200
)}

READINESS CHECK:
1. Do outputs align with goal?
2. Are critical steps complete?
3. Any show-stoppers?
4. Confidence score (0-100)?

Return JSON:
{
  "pass": true/false,
  "canRecover": true/false,
  "score": 0-100,
  "reason": "Explanation",
  "suggestions": ["suggestion1"]
}`;

    try {
      const finalValidation = await this.generateJsonWithFallback(finalValidatorPrompt, {
        purpose: "final output validation",
      });
      if (finalValidation) {
        const guardrail = applyGuardrails({
          output: JSON.stringify(results || {}),
          userMessage: goal,
          contextText: JSON.stringify(executionLog || []),
          expectedFormat: "text",
        });

        return {
          ...finalValidation,
          pass: Boolean(finalValidation.pass) && guardrail.pass,
          score: Math.round((Number(finalValidation.score || 0) + guardrail.score) / 2),
          guardrail,
        };
      }
    } catch {
      // Fallback validation
    }

    return {
      pass: Object.keys(results).length > 0,
      score: 70,
      reason: "Basic validation passed",
      canRecover: false,
    };
  }

  /**
   * 🤖 AGGREGATOR AGENT - Synthesize results
   */
  async aggregateResults(results, goal, executionLog) {
    // Deterministic aggregation for roadmap goals
    if (this.isRoadmapGoal(goal)) {
      const modules = this.getRoadmapModulesFromResults(results);
      if (Array.isArray(modules) && modules.length > 0) {
        return {
          finalOutput: {
            modules,
            metadata: {
              moduleCount: modules.length,
            },
          },
          quality: 92,
          explanation: "Aggregated directly from generate-roadmap agent output",
          confidence: 92,
        };
      }
    }

    const aggregatorPrompt = `Synthesize agent outputs into final result.

GOAL: ${goal}

AGENT OUTPUTS:
${this.compactForPrompt(
  Object.entries(results)
    .slice(0, 8)
    .map(([agent, output]) => ({ agent, output })),
  2400
)}

AGGREGATION TASK:
1. Combine outputs intelligently
2. Ensure consistency
3. Create cohesive final output
4. Add quality assessment

Return JSON:
{
  "finalOutput": { ... structured result ... },
  "quality": 0-100,
  "explanation": "Why this is the right output",
  "confidence": 0-100
}`;

    try {
      const aggregated = await this.generateJsonWithFallback(aggregatorPrompt, {
        purpose: "result aggregation",
      });
      if (aggregated) {
        return aggregated;
      }
    } catch (error) {
      console.warn("⚠️  Aggregator failed:", error.message);
    }

    // Fallback aggregation
    return {
      finalOutput: results,
      quality: 60,
      explanation: "Results aggregated without AI synthesis",
      confidence: 50,
    };
  }

  async executeWorkflow(workflowType, workflowContext = {}) {
    if (workflowType === "chatPipeline") {
      return policyEngine.decide("chatResponse", workflowContext);
    }

    throw new Error(`Unsupported workflow type: ${workflowType}`);
  }

  async orchestrateChatResponse(input = {}) {
    return this.executeWorkflow("chatPipeline", input);
  }

  /**
   * Register an agent function
   * @param {string} name - Agent name (must be unique)
   * @param {Function|Object} agentDefinition - Async execute function or autonomous agent definition
   */
  registerAgent(name, agentDefinition) {
    if (this.agents.has(name)) {
      console.warn(`⚠️  Agent already registered: ${name}, overwriting...`);
    }

    const normalized =
      typeof agentDefinition === "function"
        ? {
            execute: agentDefinition,
          }
        : {
            execute: agentDefinition?.execute,
          };

    if (!normalized || typeof normalized.execute !== "function") {
      throw new Error(`Invalid agent registration for '${name}': missing execute function`);
    }

    this.agents.set(name, normalized);
    console.log(`✅ Agent registered: ${name}`);
  }

  /**
   * Log execution for debugging & auditing
   */
  logExecution(executionRecord) {
    this.executionHistory.push({
      ...executionRecord,
      timestamp: new Date(),
    });

    // Keep history size manageable
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get execution history for debugging
   */
  getExecutionHistory(limit = 10) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Get last execution details
   */
  getLastExecution() {
    return this.executionHistory[this.executionHistory.length - 1] || null;
  }

  /**
   * Utility: Sleep
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const orchestrator = new AgentOrchestrator();