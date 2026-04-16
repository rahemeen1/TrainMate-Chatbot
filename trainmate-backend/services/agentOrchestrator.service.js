import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import dotenv from "dotenv";
import { db } from "../config/firebase.js";

dotenv.config();

let genAI = null;
let openAI = null;
let initialized = false;

function initializeLLMs() {
  if (initialized) return;
  
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  
  if (!hasGeminiKey && !hasOpenAIKey) {
    throw new Error("❌ At least one LLM key is required (GEMINI_API_KEY or OPENAI_API_KEY)");
  }
  
  if (hasGeminiKey) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  if (hasOpenAIKey) {
    openAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

    if (openAI) {
      try {
        const completion = await openAI.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
        });

        const responseText = completion.choices?.[0]?.message?.content || "";
        const jsonText = this.extractJsonFromText(responseText);
        if (!jsonText) {
          throw new Error("No JSON found in OpenAI response");
        }

        return JSON.parse(jsonText);
      } catch (error) {
        console.warn(`⚠️  OpenAI fallback failed for ${purpose}:`, error.message);
      }
    }

    return null;
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

      // STEP 1: Generate execution plan
      console.log("\n📋 STEP 1: Generating execution plan...");
      const rawPlan = await this.generatePlan(goal, runContext);
      const { plan, warnings } = this.normalizePlan(rawPlan, goal);

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

      // STEP 2: Execute plan
      console.log("\n⚙️  STEP 2: Executing plan...");
      const executionResults = await this.executePlan(plan, runContext, executionLog);
      console.log(`✅ Execution complete: ${Object.keys(executionResults.results).length} results`);

      // STEP 3: Validate final output
      console.log("\n🔍 STEP 3: Validating output...");
      const validation = await this.validateFinalOutput(
        executionResults.results,
        goal,
        executionLog
      );

      if (!validation.pass && validation.canRecover) {
        console.log(`⚠️  Validation warning: ${validation.reason}`);
        console.log("🔄 Attempting recovery...");
        const recoveryResult = await this.attemptRecovery(
          executionResults,
          validation,
          runContext,
          executionLog,
          plan
        );
        if (recoveryResult.success) {
          executionResults.results = recoveryResult.results;
          console.log("✅ Recovery successful");
        }
      }

      if (this.isRoadmapGoal(goal)) {
        const generatedModules = this.getRoadmapModulesFromResults(executionResults.results);
        if (!Array.isArray(generatedModules) || generatedModules.length === 0) {
          throw new Error("Roadmap generation step did not produce modules");
        }
      }

      // STEP 4: Aggregate results
      console.log("\n📦 STEP 4: Aggregating results...");
      const finalOutput = await this.aggregateResults(
        executionResults.results,
        goal,
        executionLog
      );

      if (this.isRoadmapGoal(goal)) {
        const outputModules = finalOutput?.finalOutput?.modules;
        if (!Array.isArray(outputModules) || outputModules.length === 0) {
          throw new Error("Aggregation produced no roadmap modules");
        }
      }

      // STEP 5: Log execution
      const executionTime = Date.now() - orchestrationStart;
      this.logExecution({
        goal,
        plan,
        executionResults,
        finalOutput,
        validation,
        executionTime,
        executionLog,
      });

      await this.saveLongTermMemory(context, {
        goal,
        success: true,
        agentsUsed: plan.steps.map((s) => s.agent),
        validationScore: validation.score,
        executionTimeMs: executionTime,
      });

      console.log("\n" + "=".repeat(70));
      console.log(`✅ ORCHESTRATION COMPLETE (${executionTime}ms)`);
      console.log("=".repeat(70) + "\n");

      return {
        success: true,
        finalOutput: finalOutput.finalOutput,
        metadata: {
          agentsUsed: plan.steps.map((s) => s.agent),
          executionTime: `${executionTime}ms`,
          stepsExecuted: executionResults.executionLog.length,
          validationScore: validation.score,
          strategy: plan.errorStrategy,
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

    const plannerPrompt = `You are an expert orchestration planner. Analyze this goal and create an optimal execution plan.

GOAL: ${goal}

CONTEXT:
- User expertise level: ${context.expertise || "unknown"}
- Training topic: ${context.trainingOn || "general"}
- Available agents: ${availableAgents.join(", ")}
- Constraints: ${context.constraints?.join(", ") || "none"}

PLANNING TASK:
1. Determine which agents are ESSENTIAL for this goal
2. Identify dependencies between agents
3. Determine optimal execution order
4. Identify which steps are critical vs optional
5. Choose error handling strategy

Return ONLY valid JSON (no markdown, no explanation):
{
  "steps": [
    {
      "stepNumber": 1,
      "description": "What this step accomplishes",
      "agent": "agent_name_matching_registry",
      "critical": true/false,
      "dependencies": ["previous_agent_name or null"],
      "retryPolicy": {
        "maxRetries": 2,
        "backoffMs": 1000
      }
    }
  ],
  "reasoning": "Why this plan is optimal",
  "errorStrategy": "fail_fast|retry|skip_non_critical|pivot",
  "estimatedCost": "low|medium|high"
}`;

    try {
      const plan = await this.generateJsonWithFallback(plannerPrompt, {
        purpose: "plan generation",
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

      const agent = this.agents.get(step.agent);
      if (!agent) {
        throw new Error(`Agent not found in registry: ${step.agent}`);
      }

      const stepInput = {
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
          output = await agent(stepInput);
          const validation = await this.validateOutput(output, step);

          if (validation.pass) {
            results[step.agent] = output;
            stepOrderMap[step.agent] = step.stepNumber;

            const stepLog = {
              stepNumber: step.stepNumber,
              agent: step.agent,
              status: "SUCCESS",
              duration: Date.now() - stepStart,
              validation: {
                score: validation.score,
                issues: validation.issues,
              },
            };

            console.log(`      ✅ Success (validation: ${validation.score}/100)`);
            return { success: true, log: stepLog, output };
          }

          lastError = new Error(`Validation failed: ${validation.reason}`);
          attempts++;
          console.warn(`      ⚠️  Validation issue: ${validation.reason}`);

          if (attempts < maxRetries) {
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
        return {
          pass: validation.score >= 60,
          ...validation,
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

    const recoveryPrompt = `An agent failed validation. Suggest recovery strategy.

FAILED OUTPUT:
${this.compactForPrompt(latestOutput || {}, 700)}

VALIDATION ISSUES:
${issues.join("\n") || "No issues provided"}

TARGET AGENT:
${targetAgent || "unknown"}

AVAILABLE OPTIONS:
1. Retry the agent with modified input
2. Skip this step and continue
3. Use fallback/default value

DECISION: Which option is best?

Return JSON:
{
  "strategy": "retry|skip|fallback",
  "explanation": "why",
  "modifiedInput": {} or null
}`;

    try {
      const strategy = await this.generateJsonWithFallback(recoveryPrompt, {
        purpose: "recovery strategy",
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
        return finalValidation;
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

  /**
   * Register an agent function
   * @param {string} name - Agent name (must be unique)
   * @param {Function} agentFn - Async function that takes {previousResults, context}
   */
  registerAgent(name, agentFn) {
    if (this.agents.has(name)) {
      console.warn(`⚠️  Agent already registered: ${name}, overwriting...`);
    }
    this.agents.set(name, agentFn);
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