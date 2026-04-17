import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../../config/firebase.js";
import { applyGuardrails } from "../guardrail.service.js";

let genAI = null;
let initialized = false;

function initializeLLMs() {
  if (initialized) return;

  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  if (!hasGeminiKey) {
    throw new Error("❌ GEMINI_API_KEY is required");
  }

  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  initialized = true;
}

class PolicyEngine {
  async decide(decisionType, context = {}) {
    switch (decisionType) {
      case "planGeneration":
        return this.decidePlanGeneration(context);
      case "quizOutcome":
        return this.decideQuizOutcome(context);
      case "notification":
        return this.decideNotificationStrategy(context);
      case "chatResponse":
        return this.decideChatResponse(context);
      case "stepRecovery":
        return this.decideStepRecovery(context);
      case "recoveryStrategy":
        return this.decideRecoveryStrategy(context);
      case "replanCritique":
        return this.decideReplanCritique(context);
      default:
        throw new Error(`Unsupported policy decision type: ${decisionType}`);
    }
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
    initializeLLMs();
    const { systemInstruction = null } = options;

    const geminiModels = ["gemini-2.5-flash", "gemini-2.5-pro"];
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
      } catch {
        // Try next model.
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
    if (!memoryRef) return null;

    try {
      const snap = await memoryRef.get();
      return snap.exists ? snap.data() : null;
    } catch {
      return null;
    }
  }

  async decidePlanGeneration({ goal, context = {}, availableAgents = [] }) {
    const normalizedConstraints = this.normalizeConstraintEnvelope(context.constraints);
    const memory = await this.loadLongTermMemory(context);
    const memorySummary = this.summarizeMemory(memory || context.orchestrationMemory || {});

    const plannerPrompt = `You are an expert orchestration planner. Analyze this goal and create an optimal execution plan.

GOAL: ${goal}

CONTEXT:
- User expertise level: ${context.expertise || "unknown"}
- Training topic: ${context.trainingOn || "general"}
- Available agents: ${availableAgents.join(", ")}
- Constraints: ${JSON.stringify(normalizedConstraints)}
- Memory insights: ${memorySummary}

Return ONLY valid JSON:
{
  "steps": [
    {
      "stepNumber": 1,
      "description": "What this step accomplishes",
      "agent": "agent_name_matching_registry",
      "critical": true,
      "dependencies": ["agent_name"],
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

    const decision = await this.generateJsonWithFallback(plannerPrompt, {
      purpose: "plan generation",
    });

    return decision;
  }

  async decideQuizOutcome(decisionInput = {}) {
    const {
      score = 0,
      attemptNumber = 1,
      mcqScore = 0,
      oneLinerScore = 0,
      codingScore = null,
      weakAreas = [],
      moduleTitle = "",
      timeRemaining = null,
      previousAttempts = [],
      maxAttempts = 3,
      quizPassThreshold = 80,
      companyId,
      deptId,
      userId,
    } = decisionInput;

    const memory = await this.loadLongTermMemory({ companyId, deptId, userId });
    const memorySummary = this.summarizeMemory(memory || decisionInput.orchestrationMemory || {});

    const attemptsHistory = (Array.isArray(previousAttempts) ? previousAttempts : [])
      .map((att, idx) => `Attempt ${idx + 1}: Score ${att?.score ?? "N/A"}%`)
      .join(", ");

    const prompt = `You are an intelligent learning assessment agent. Analyze this learner's quiz performance and make strategic decisions.

MODULE: "${moduleTitle}"
CURRENT ATTEMPT: ${attemptNumber}
CURRENT SCORE: ${score}%
PASS THRESHOLD: ${quizPassThreshold}%

SCORE BREAKDOWN:
- MCQ Score: ${mcqScore}%
- One-liner Score: ${oneLinerScore}%
${codingScore !== null ? `- Coding Score: ${codingScore}%` : ""}

${attemptsHistory ? `PREVIOUS ATTEMPTS: ${attemptsHistory}` : "This is the first attempt"}

${weakAreas.length > 0 ? `WEAK AREAS: ${weakAreas.join(", ")}` : ""}

${timeRemaining ? `TIME REMAINING IN MODULE: ${timeRemaining}` : "No time constraint"}

MEMORY SIGNALS:
${memorySummary}

Return JSON only:
{
  "allowRetry": true,
  "retriesGranted": 1,
  "requiresRoadmapRegeneration": false,
  "unlockResources": ["quiz"],
  "lockModule": false,
  "contactAdmin": false,
  "message": "Personalized message",
  "recommendations": ["specific action items"],
  "reasoning": "Brief explanation"
}`;

    try {
      const parsed = await this.generateJsonWithFallback(prompt, {
        purpose: "quiz decision",
      });

      if (parsed && typeof parsed.allowRetry === "boolean") {
        return {
          allowRetry: parsed.allowRetry,
          retriesGranted: Number(parsed.retriesGranted || 0),
          requiresRoadmapRegeneration: Boolean(parsed.requiresRoadmapRegeneration),
          unlockResources: Array.isArray(parsed.unlockResources) ? parsed.unlockResources : [],
          lockModule: Boolean(parsed.lockModule),
          contactAdmin: Boolean(parsed.contactAdmin),
          message:
            parsed.message ||
            `You scored ${score}%. Review weak areas and attempt again with a focused plan.`,
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          reasoning: parsed.reasoning || "AI decision generated",
        };
      }
    } catch {
      // Fall through to deterministic fallback.
    }

    const scoreGap = quizPassThreshold - score;
    const allowRetry = attemptNumber < maxAttempts && scoreGap < 30;
    const needsRegeneration = scoreGap > 20 && attemptNumber < maxAttempts;

    return {
      allowRetry,
      retriesGranted: allowRetry ? 1 : 0,
      requiresRoadmapRegeneration: needsRegeneration,
      unlockResources: allowRetry ? ["quiz"] : [],
      lockModule: !allowRetry && attemptNumber >= maxAttempts,
      contactAdmin: !allowRetry,
      message: allowRetry
        ? `You scored ${score}%. Review the materials and try again - you're getting closer!`
        : `After ${attemptNumber} attempts, please contact your admin for additional support.`,
      recommendations: [
        "Review weak areas identified in the results",
        "Use the chatbot for clarification",
        "Take notes on key concepts",
      ],
      reasoning: "Fallback decision logic applied",
    };
  }

  async decideNotificationStrategy(context = {}) {
    const memory = await this.loadLongTermMemory(context);
    const memorySummary = this.summarizeMemory(memory || context.orchestrationMemory || {});
    const constraints = this.normalizeConstraintEnvelope(context.constraints);

    const prompt = `You are an intelligent notification strategist for a corporate training platform called TrainMate.

Analyze this user context and make smart notification decisions:

USER PROFILE:
- Name: ${context.userName}
- Company: ${context.companyName}
- Training Topic: ${context.trainingTopic}
- Last Login: ${context.engagementData?.lastLoginAt?.toLocaleString?.() || "Unknown"}
- Learning Streak: ${context.engagementData?.learningStreak || 0} days
- Modules Completed: ${context.engagementData?.modulesCompleted || 0}
- Average Quiz Score: ${context.engagementData?.averageQuizScore || 0}%
- Email Open Rate: ${context.engagementData?.emailOpenRate || 0}%
- Time Spent Learning: ${context.engagementData?.timeSpentLearning || 0} minutes
- Current Module: ${context.activeModule?.moduleTitle || "None"}

NOTIFICATION CONTEXT:
- Notification Type: ${context.notificationType}
- Is First-time User: ${context.isNewUser}
- Current Hour: ${new Date().getHours()}
- User Timezone: ${context.timezone}
- Constraints: ${JSON.stringify(constraints)}
- Memory insights: ${memorySummary}

Return JSON only:
{
  "shouldSend": true,
  "reason": "Brief explanation",
  "sendEmail": true,
  "createCalendarEvent": true,
  "optimalTime": "15:00",
  "personalizationTip": "How to personalize content",
  "urgencyLevel": "medium",
  "estimatedEngagementScore": 50,
  "recommendedMessageTone": "motivational"
}`;

    try {
      const aiDecision = await this.generateJsonWithFallback(prompt, {
        purpose: "notification strategy decision",
      });

      if (aiDecision && typeof aiDecision.shouldSend === "boolean") {
        const normalizedDecision = {
          shouldSend: aiDecision.shouldSend,
          reason: aiDecision.reason || "AI strategy applied",
          sendEmail: aiDecision.sendEmail ?? true,
          createCalendarEvent: aiDecision.createCalendarEvent ?? true,
          optimalTime: aiDecision.optimalTime || "15:00",
          personalizationTip: aiDecision.personalizationTip || "Highlight progress milestones",
          urgencyLevel: aiDecision.urgencyLevel || "medium",
          estimatedEngagementScore: Number(aiDecision.estimatedEngagementScore ?? 50),
          recommendedMessageTone: aiDecision.recommendedMessageTone || "motivational",
        };

        const guardrail = applyGuardrails({
          output: JSON.stringify(normalizedDecision),
          userMessage: `${context.notificationType || "notification"} strategy`,
          contextText: memorySummary,
          expectedFormat: "text",
        });

        if (!guardrail.pass) {
          return {
            ...normalizedDecision,
            shouldSend: normalizedDecision.shouldSend && guardrail.score >= 55,
            reason: `Guardrail-adjusted strategy: ${normalizedDecision.reason}`,
          };
        }

        return normalizedDecision;
      }
    } catch {
      // Fall through to fallback.
    }

    return {
      shouldSend: true,
      reason: "AI unavailable, using defaults",
      sendEmail: true,
      createCalendarEvent: true,
      optimalTime: "15:00",
      personalizationTip: "Encourage consistent daily practice",
      urgencyLevel: "medium",
      estimatedEngagementScore: 50,
      recommendedMessageTone: "motivational",
    };
  }

  async decideStepRecovery(context = {}) {
    const {
      attempt = 1,
      maxRetries = 1,
      validation = {},
      error = null,
    } = context;

    if (attempt >= maxRetries) {
      return { action: "fail", inputPatch: null };
    }

    const issues = Array.isArray(validation?.issues) ? validation.issues : [];
    const severityHint = Number(validation?.score || 0) < 30;
    if (severityHint && attempt + 1 >= maxRetries) {
      return { action: "fail", inputPatch: null };
    }

    if (error && /missing dependencies|not found/i.test(String(error.message || ""))) {
      return { action: "fail", inputPatch: null };
    }

    const inputPatch = issues.length > 0
      ? { _policyRecoveryHint: `Focus on: ${issues.slice(0, 2).join("; ")}` }
      : null;

    return {
      action: "retry",
      inputPatch,
    };
  }

  async decideRecoveryStrategy(context = {}) {
    const {
      targetAgent,
      latestOutput,
      issues = [],
    } = context;

    const recoveryPrompt = `An agent failed validation. Suggest recovery strategy.

FAILED OUTPUT:
${JSON.stringify(latestOutput || {}).slice(0, 1000)}

VALIDATION ISSUES:
${issues.join("\n") || "No issues provided"}

TARGET AGENT:
${targetAgent || "unknown"}

Return JSON:
{
  "strategy": "retry|skip|fallback",
  "modifiedInput": {}
}`;

    try {
      const strategy = await this.generateJsonWithFallback(recoveryPrompt, {
        purpose: "recovery strategy",
      });

      if (strategy && ["retry", "skip", "fallback"].includes(strategy.strategy)) {
        return {
          strategy: strategy.strategy,
          modifiedInput:
            strategy.modifiedInput && typeof strategy.modifiedInput === "object"
              ? strategy.modifiedInput
              : null,
        };
      }
    } catch {
      // Fall through.
    }

    return {
      strategy: "retry",
      modifiedInput: null,
    };
  }

  async decideReplanCritique(context = {}) {
    const {
      goal,
      cycle,
      plan,
      executionResults,
      validation,
      constraints,
      availableAgents = [],
      contextSnapshot = {},
    } = context;

    const completedAgents = Object.keys(executionResults?.results || {});
    const failedAgents = Array.isArray(executionResults?.failedAgents)
      ? executionResults.failedAgents
      : [];

    const prompt = `You are a critique-and-replan policy agent inside an orchestration loop.

GOAL: ${goal}
REASONING CYCLE: ${cycle}
CURRENT PLAN AGENTS: ${(plan?.steps || []).map((s) => s.agent).join(", ")}
COMPLETED AGENTS: ${completedAgents.join(", ") || "none"}
FAILED AGENTS: ${failedAgents.join(", ") || "none"}
VALIDATION PASS: ${Boolean(validation?.pass)}
VALIDATION SCORE: ${Number(validation?.score || 0)}
VALIDATION REASON: ${validation?.reason || "unknown"}
VALIDATION ISSUES: ${JSON.stringify(validation?.suggestions || validation?.issues || [])}
CONSTRAINTS: ${JSON.stringify(constraints || {})}
AVAILABLE AGENTS: ${availableAgents.join(", ")}
CONTEXT SNAPSHOT: ${JSON.stringify(contextSnapshot || {}).slice(0, 1000)}

Return JSON only:
{
  "reason": "brief critique",
  "addAgents": ["agent_name"],
  "removeAgents": ["agent_name"],
  "prioritizeAgents": ["agent_name"],
  "errorStrategy": "fail_fast|retry|skip_non_critical|pivot",
  "refineContext": {
    "focusTopics": ["topic"],
    "hints": ["hint"]
  }
}`;

    try {
      const parsed = await this.generateJsonWithFallback(prompt, {
        purpose: "execution critique and replan",
      });

      if (parsed && typeof parsed === "object") {
        return {
          reason: parsed.reason || validation?.reason || "Critique generated",
          addAgents: Array.isArray(parsed.addAgents) ? parsed.addAgents : [],
          removeAgents: Array.isArray(parsed.removeAgents) ? parsed.removeAgents : [],
          prioritizeAgents: Array.isArray(parsed.prioritizeAgents)
            ? parsed.prioritizeAgents
            : [],
          errorStrategy: parsed.errorStrategy,
          refineContext:
            parsed.refineContext && typeof parsed.refineContext === "object"
              ? parsed.refineContext
              : {},
        };
      }
    } catch {
      // Deterministic fallback below.
    }

    return {
      reason: validation?.reason || "Validation failed; replan with stronger execution coverage",
      addAgents: failedAgents.filter((name) => availableAgents.includes(name)),
      removeAgents: [],
      prioritizeAgents: failedAgents.filter((name) => availableAgents.includes(name)),
      errorStrategy: "retry",
      refineContext: {
        focusTopics: [],
        hints: ["Increase grounding and completeness in next cycle"],
      },
    };
  }

  async decideChatResponse(input = {}) {
    initializeLLMs();

    const {
      userMessage,
      finalPrompt,
      contextCandidates = [],
      expectedFormat = "html",
      fallbackReply = "I'm here to help with your training module.",
      constraints,
    } = input;

    const normalizedConstraints = this.normalizeConstraintEnvelope(constraints);
    const memory = await this.loadLongTermMemory(input);
    const memorySummary = this.summarizeMemory(memory || input.orchestrationMemory || {});

    let plan = {
      focusKeywords: [],
      maxContextItems: 3,
      responseTone: "supportive",
    };

    try {
      const planningPrompt = `Create a chat execution plan.

USER MESSAGE: ${userMessage}
CONSTRAINTS: ${JSON.stringify(normalizedConstraints)}
MEMORY: ${memorySummary}

Return JSON only:
{
  "focusKeywords": ["keyword1", "keyword2"],
  "maxContextItems": 2,
  "responseTone": "supportive"
}`;

      const planned = await this.generateJsonWithFallback(planningPrompt, {
        purpose: "chat plan-query",
      });

      if (planned && Array.isArray(planned.focusKeywords)) {
        plan = {
          focusKeywords: planned.focusKeywords.slice(0, 8),
          maxContextItems: Math.max(1, Math.min(5, Number(planned.maxContextItems) || 3)),
          responseTone: planned.responseTone || "supportive",
        };
      }
    } catch {
      // Keep default plan.
    }

    let keywords = new Set(
      [
        ...plan.focusKeywords,
        ...this.extractKeywords(userMessage || ""),
      ].map((k) => String(k || "").toLowerCase())
    );

    const rankByKeywords = (termsSet) => {
      return (Array.isArray(contextCandidates) ? contextCandidates : [])
        .map((candidate) => {
          const text = String(candidate?.text || "");
          const terms = this.extractKeywords(text);
          const overlap = terms.filter((term) => termsSet.has(term)).length;
          const score = overlap * 10 + (Number(candidate?.score) || 0);
          return {
            ...candidate,
            text,
            overlap,
            rankScore: score,
          };
        })
        .sort((a, b) => b.rankScore - a.rankScore)
        .slice(0, plan.maxContextItems);
    };

    let rankedContext = rankByKeywords(keywords);
    const weakRanking = rankedContext.length === 0 || rankedContext[0].overlap < 2;

    if (weakRanking) {
      try {
        const retrievalPrompt = `Improve retrieval keywords for this query.

USER MESSAGE: ${userMessage}
CURRENT KEYWORDS: ${Array.from(keywords).slice(0, 12).join(", ")}
MEMORY: ${memorySummary}

Return JSON only:
{
  "additionalKeywords": ["keyword1", "keyword2", "keyword3"]
}`;

        const retrievalPlan = await this.generateJsonWithFallback(retrievalPrompt, {
          purpose: "chat retrieval ranking loop",
        });

        const extra = Array.isArray(retrievalPlan?.additionalKeywords)
          ? retrievalPlan.additionalKeywords
          : [];

        if (extra.length > 0) {
          keywords = new Set([
            ...Array.from(keywords),
            ...extra.map((k) => String(k || "").toLowerCase()),
          ]);
          rankedContext = rankByKeywords(keywords);
        }
      } catch {
        // Keep first-pass ranking.
      }
    }

    const rankedContextText = rankedContext
      .map((ctx, idx) => `[${idx + 1}] ${ctx.source || "context"}: ${ctx.text}`)
      .join("\n\n");

    const generationPromptBase = `${finalPrompt}\n\nCHAT ORCHESTRATION PLAN:\nTone: ${plan.responseTone}\nMax latency target: ${normalizedConstraints.maxLatency}ms\nCost sensitivity: ${normalizedConstraints.costSensitivity}\n\nRANKED CONTEXT:\n${rankedContextText || "No ranked context provided"}\n\nMEMORY SUMMARY:\n${memorySummary}\n`;

    const rolePrompts = [
      { role: "teacher", instruction: "Be clear and pedagogical." },
      { role: "pragmatic-coach", instruction: "Be concise and action-oriented." },
      { role: "critical-reviewer", instruction: "Prioritize correctness and caveats." },
    ];

    const candidateReplies = [];
    for (const roleSpec of rolePrompts) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const candidatePrompt = `${generationPromptBase}\nROLE MODE: ${roleSpec.role}\nROLE INSTRUCTION: ${roleSpec.instruction}\n`;
        const completion = await model.generateContent(candidatePrompt);
        const text = completion?.response?.text?.();
        if (text && text.trim()) {
          candidateReplies.push({ role: roleSpec.role, text: text.trim() });
        }
      } catch {
        // Skip this candidate.
      }
    }

    let candidateReply = candidateReplies[0]?.text || fallbackReply;

    if (candidateReplies.length > 1) {
      try {
        const judgePrompt = `Select the best response for the user based on relevance, factuality, and clarity.

USER MESSAGE: ${userMessage}
EXPECTED FORMAT: ${expectedFormat}

CANDIDATES:
${candidateReplies.map((c, i) => `Candidate ${i + 1} (${c.role}):\n${c.text}`).join("\n\n")}

Return JSON only:
{
  "winner": 1,
  "reason": "short reason",
  "improvementNote": "what to refine"
}`;

        const judge = await this.generateJsonWithFallback(judgePrompt, {
          purpose: "chat debate judge",
        });

        const winnerIdx = Math.max(1, Number(judge?.winner || 1)) - 1;
        candidateReply = candidateReplies[winnerIdx]?.text || candidateReply;
      } catch {
        // Keep fallback winner.
      }
    }

    let guardrail = applyGuardrails({
      output: candidateReply,
      userMessage,
      contextText: rankedContextText,
      expectedFormat,
    });

    let usedRecovery = false;
    let refinementRounds = 0;

    while (refinementRounds < 2 && !guardrail.pass) {
      usedRecovery = true;
      refinementRounds += 1;
      const recoveryPrompt = `Rewrite this response to pass guardrails and improve relevance.

USER MESSAGE: ${userMessage}
CONTEXT: ${rankedContextText}
FAILED RESPONSE: ${candidateReply}
GUARDRAIL SCORE: ${guardrail.score}
GUARDRAIL ISSUES: ${JSON.stringify(guardrail.checks || {})}

Rules:
- Remove unsafe or irrelevant content
- Keep directly useful learning guidance
- Maintain expected format: ${expectedFormat}`;

      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const retry = await model.generateContent(recoveryPrompt);
        const recovered = retry?.response?.text?.();
        if (recovered) {
          candidateReply = recovered;
        }
      } catch {
        // Keep current candidate reply.
      }

      guardrail = applyGuardrails({
        output: candidateReply,
        userMessage,
        contextText: rankedContextText,
        expectedFormat,
      });
    }

    return {
      reply: candidateReply,
      guardrail,
      plan,
      rankedContext,
      usedRecovery,
      debate: {
        candidates: candidateReplies.map((c) => ({ role: c.role })),
        rounds: refinementRounds,
      },
    };
  }
}

export const policyEngine = new PolicyEngine();
