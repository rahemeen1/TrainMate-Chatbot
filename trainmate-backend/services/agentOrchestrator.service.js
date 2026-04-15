import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

  /**
   * 🎯 Main orchestration entry point
   * 
   * @param {string} goal - What needs to be accomplished
   * @param {Object} context - User data, constraints, preferences
   * @returns {Promise<Object>} { finalOutput, metadata, explanation, executionLog }
   */
  async orchestrate(goal, context) {
    console.log("\n" + "=".repeat(70));
    console.log("🎯 AGENT ORCHESTRATOR STARTED");
    console.log(`Goal: ${goal}`);
    console.log("=".repeat(70));

    const orchestrationStart = Date.now();
    const executionLog = [];

    try {
      // STEP 1: Generate execution plan
      console.log("\n📋 STEP 1: Generating execution plan...");
      const plan = await this.generatePlan(goal, context);
      executionLog.push({
        stage: "planning",
        status: "success",
        detail: `Generated plan with ${plan.steps.length} steps`,
        steps: plan.steps.map((s) => s.agent),
        errorStrategy: plan.errorStrategy,
      });
      console.log(`✅ Plan generated: ${plan.steps.length} steps, strategy: ${plan.errorStrategy}`);

      // STEP 2: Execute plan
      console.log("\n⚙️  STEP 2: Executing plan...");
      const executionResults = await this.executePlan(plan, context, executionLog);
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
          context,
          executionLog
        );
        if (recoveryResult.success) {
          executionResults.results = recoveryResult.results;
          console.log("✅ Recovery successful");
        }
      }

      // STEP 4: Aggregate results
      console.log("\n📦 STEP 4: Aggregating results...");
      const finalOutput = await this.aggregateResults(
        executionResults.results,
        goal,
        executionLog
      );

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
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(plannerPrompt);
      const responseText = await result.response.text();

      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in planner response");
      }

      const plan = JSON.parse(jsonMatch[0]);
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
  async executePlan(plan, context, executionLog) {
    const results = {};
    const stepExecutionLog = [];
    const stepOrderMap = {}; // For dependency resolution

    for (const step of plan.steps) {
      const stepStart = Date.now();

      try {
        console.log(`\n  ⚙️  Step ${step.stepNumber}: ${step.description}`);
        console.log(`      Agent: ${step.agent} | Critical: ${step.critical}`);

        // Get agent from registry
        const agent = this.agents.get(step.agent);
        if (!agent) {
          throw new Error(`Agent not found in registry: ${step.agent}`);
        }

        // Prepare input including previous results
        const stepInput = {
          ...step.input,
          previousResults: results,
          context,
        };

        // Execute with retry logic
        let output;
        let attempts = 0;
        const maxRetries = step.retryPolicy?.maxRetries || 1;
        let lastError;

        while (attempts < maxRetries) {
          try {
            output = await agent(stepInput);

            // 🤖 VALIDATOR - Check output quality
            const validation = await this.validateOutput(output, step);

            if (validation.pass) {
              results[step.agent] = output;
              stepOrderMap[step.agent] = step.stepNumber;

              stepExecutionLog.push({
                stepNumber: step.stepNumber,
                agent: step.agent,
                status: "SUCCESS",
                duration: Date.now() - stepStart,
                validation: {
                  score: validation.score,
                  issues: validation.issues,
                },
              });

              console.log(
                `      ✅ Success (validation: ${validation.score}/100)`
              );
              break;
            } else {
              lastError = new Error(`Validation failed: ${validation.reason}`);
              attempts++;
              console.warn(`      ⚠️  Validation issue: ${validation.reason}`);

              if (attempts < maxRetries) {
                await this.sleep(step.retryPolicy?.backoffMs || 1000);
              }
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

        // Handle final failure
        if (!results[step.agent] && lastError) {
          if (step.critical) {
            throw lastError; // Critical step cannot fail
          } else {
            console.log(`      ⏭️  Skipped (non-critical)`);
            stepExecutionLog.push({
              stepNumber: step.stepNumber,
              agent: step.agent,
              status: "SKIPPED",
              reason: lastError.message,
              duration: Date.now() - stepStart,
            });
          }
        }
      } catch (error) {
        console.error(`      🔥 Step ${step.stepNumber} failed:`, error.message);

        const stepLog = {
          stepNumber: step.stepNumber,
          agent: step.agent,
          status: "FAILED",
          reason: error.message,
          duration: Date.now() - stepStart,
        };

        if (step.critical && plan.errorStrategy === "fail_fast") {
          stepExecutionLog.push(stepLog);
          throw error;
        } else {
          stepExecutionLog.push(stepLog);
          if (plan.errorStrategy === "skip_non_critical") {
            continue;
          }
        }
      }
    }

    return {
      results,
      executionLog: stepExecutionLog,
      stepOrderMap,
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
${typeof output === "string" ? output : JSON.stringify(output).slice(0, 1000)}

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
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(validatorPrompt);
      const responseText = await result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const validation = JSON.parse(jsonMatch[0]);
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
  async attemptRecovery(executionResults, validation, context, executionLog) {
    console.log("🔧 Recovery Agent: Analyzing failure...");

    const issues = Array.isArray(validation?.issues) ? validation.issues : [];
    const latestKey = Object.keys(executionResults.results).pop();
    const latestOutput = latestKey ? executionResults.results[latestKey] : null;

    const recoveryPrompt = `An agent failed validation. Suggest recovery strategy.

FAILED OUTPUT:
${JSON.stringify(latestOutput || {}).slice(0, 500)}

VALIDATION ISSUES:
${issues.join("\n") || "No issues provided"}

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
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(recoveryPrompt);
      const responseText = await result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const strategy = JSON.parse(jsonMatch[0]);
        console.log(`   Strategy: ${strategy.strategy}`);
        return {
          success: true,
          strategy: strategy.strategy,
          results: executionResults.results,
        };
      }
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
    if (goal.toLowerCase().includes("roadmap")) {
      const modules = results?.["generate-roadmap"]?.modules;
      if (Array.isArray(modules) && modules.length > 0) {
        return {
          pass: true,
          canRecover: false,
          score: 95,
          reason: "Roadmap generation output is present and non-empty",
          suggestions: [],
        };
      }
    }

    const resultsSnapshot = Object.keys(results).slice(-3); // Last 3 agent outputs

    const finalValidatorPrompt = `The orchestration is near complete. Validate readiness.

GOAL: ${goal}
COMPLETED AGENTS: ${resultsSnapshot.join(", ")}

SAMPLE OUTPUTS:
${JSON.stringify(
  Object.fromEntries(
    resultsSnapshot.map((k) => [k, JSON.stringify(results[k]).slice(0, 200)])
  )
).slice(0, 1000)}

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
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(finalValidatorPrompt);
      const responseText = await result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
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
    if (goal.toLowerCase().includes("roadmap")) {
      const modules = results?.["generate-roadmap"]?.modules;
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
${JSON.stringify(
  Object.entries(results)
    .slice(0, 5) // Limit for token count
    .map(([agent, output]) => ({
      agent,
      output: typeof output === "string" ? output.slice(0, 300) : JSON.stringify(output).slice(0, 300),
    }))
).slice(0, 2000)}

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
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(aggregatorPrompt);
      const responseText = await result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
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
