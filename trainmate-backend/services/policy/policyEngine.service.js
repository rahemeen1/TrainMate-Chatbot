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
      case "skillExtraction":
        return this.decideSkillExtraction(context);
      case "cvValidation":
        return this.decideCvValidation(context);
      case "quizOutcome":
        return this.decideQuizOutcome(context);
      case "notification":
        return this.decideNotificationStrategy(context);
      case "calendarDecision":
        return this.decideCalendarDecision(context);
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

  async decideSkillExtraction(context = {}) {
    const source = String(context.source || "cv").toLowerCase();
    const trainingOn = String(context.trainingOn || "General").trim();
    const cvTextLength = Number(context.cvTextLength || 0);
    const companyDocsLength = Number(context.companyDocsLength || 0);
    const structuredCvSkillsCount = Number(context.structuredCvSkillsCount || 0);

    const hasCvText = cvTextLength >= 50;
    const hasCompanyDocs = companyDocsLength >= 50;
    const isNonTechnical =
      /accounting|finance|hr|human\s*resources|management|sales|marketing|business/i.test(
        trainingOn
      );

    if (source === "cv") {
      const useStructuredCv = structuredCvSkillsCount > 0;
      const useTextExtraction = hasCvText;

      if (!useStructuredCv && !useTextExtraction) {
        return {
          source,
          strategy: "fallback_only",
          useStructuredCv: false,
          useTextExtraction: false,
          useTopicInference: false,
          strictFiltering: true,
          reason: "No CV text and no structured CV skills available",
        };
      }

      return {
        source,
        strategy: useStructuredCv && useTextExtraction ? "hybrid" : "single_source",
        useStructuredCv,
        useTextExtraction,
        useTopicInference: false,
        strictFiltering: true,
        reason: useStructuredCv && useTextExtraction
          ? "Using both structured CV and free-text extraction"
          : "Using available CV source only",
      };
    }

    if (source === "company") {
      if (hasCompanyDocs) {
        return {
          source,
          strategy: "company_docs",
          useStructuredCv: false,
          useTextExtraction: true,
          useTopicInference: false,
          strictFiltering: true,
          reason: "Company docs available, extract required skills from docs",
        };
      }

      return {
        source,
        strategy: "topic_inference",
        useStructuredCv: false,
        useTextExtraction: false,
        useTopicInference: true,
        strictFiltering: true,
        domain: isNonTechnical ? "non-technical" : "technical",
        reason: "Company docs unavailable, infer skills from training topic",
      };
    }

    return {
      source,
      strategy: "fallback_only",
      useStructuredCv: false,
      useTextExtraction: false,
      useTopicInference: false,
      strictFiltering: true,
      reason: "Unknown extraction source",
    };
  }

  async decideCvValidation(context = {}) {
    const cvUrl = String(context.cvUrl || "");
    const rawText = String(context.rawText || "");
    const structuredCv = context.structuredCv && typeof context.structuredCv === "object"
      ? context.structuredCv
      : null;
    const fileMeta = context.fileMeta && typeof context.fileMeta === "object"
      ? context.fileMeta
      : {};

    const normalizedFileType = String(
      fileMeta.fileType || cvUrl.split("?")[0].split(".").pop() || ""
    ).toLowerCase();
    const supportedTypes = new Set(["pdf", "docx"]);
    const downloadedBytes = Number(
      fileMeta.downloadedBytes ?? fileMeta.contentLength ?? fileMeta.sizeBytes ?? 0
    );
    const wordCount = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const sectionKeywords = [
      "education",
      "experience",
      "skills",
      "projects",
      "internship",
      "certifications",
      "summary",
      "profile",
      "work experience",
    ];

    const matchedSections = sectionKeywords.filter((keyword) => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(rawText);
    }).length;

    const bulletLines = lines.filter((line) => /^([\-*•]|\d+[.)])\s+/.test(line)).length;
    const dateSignals = (rawText.match(/\b(?:19|20)\d{2}\b/g) || []).length +
      (rawText.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/gi) || []).length;
    const structuredSignals = [
      Array.isArray(structuredCv?.skills) ? structuredCv.skills.length : 0,
      Array.isArray(structuredCv?.roles) ? structuredCv.roles.length : 0,
      Array.isArray(structuredCv?.education) ? structuredCv.education.length : 0,
      Array.isArray(structuredCv?.projects) ? structuredCv.projects.length : 0,
      Array.isArray(structuredCv?.certifications) ? structuredCv.certifications.length : 0,
    ].reduce((sum, value) => sum + value, 0);

    const avgLineLength = lines.length > 0
      ? lines.reduce((sum, line) => sum + line.length, 0) / lines.length
      : 0;

    console.log("[POLICY][CV] Starting CV validation", {
      fileType: normalizedFileType || "unknown",
      downloadedBytes: downloadedBytes || null,
      wordCount,
      structuredSignals,
    });

    const issues = [];
    if (!supportedTypes.has(normalizedFileType)) {
      issues.push("Unsupported file type. Expected PDF or DOCX.");
    }
    if (downloadedBytes && downloadedBytes < 10 * 1024) {
      issues.push("File is too small to be a real CV.");
    }
    if (downloadedBytes && downloadedBytes > 5 * 1024 * 1024) {
      issues.push("File is too large to be a typical CV.");
    }
    if (wordCount < 100) {
      issues.push("Extracted text is too short for a real CV.");
    }

    const hardFailure = issues.length > 0;
    const keywordScore = Math.min(30, matchedSections * 10);
    const structureScore = Math.min(30, bulletLines >= 3 ? 15 : bulletLines * 4) + Math.min(20, structuredSignals * 4);
    const lengthScore = wordCount >= 400 ? 30 : wordCount >= 250 ? 24 : wordCount >= 200 ? 18 : wordCount >= 120 ? 10 : 0;
    const dateScore = Math.min(10, dateSignals * 2);
    const paragraphPenalty = avgLineLength > 160 && bulletLines < 3 ? 15 : 0;

    const heuristicScore = Math.max(0, Math.min(100, lengthScore + keywordScore + structureScore + dateScore - paragraphPenalty));
    const heuristicConfidence = Math.max(0, Math.min(1, heuristicScore / 100));
    const heuristicValid = heuristicScore >= 55 && wordCount >= 120 && matchedSections >= 1 && structuredSignals >= 1;

    console.log("[POLICY][CV] Heuristic summary", {
      heuristicScore,
      heuristicValid,
      matchedSections,
      bulletLines,
      dateSignals,
      structuredSignals,
      issues: issues.length,
    });

    if (hardFailure) {
      const reason = issues[0];
      console.warn("[POLICY][CV] Rejected by hard checks", {
        reason,
        issues,
      });
      return {
        isValidCV: false,
        confidence: 0,
        score: Math.max(0, Math.min(45, heuristicScore)),
        reason,
        issues,
        evidence: {
          fileType: normalizedFileType || "unknown",
          wordCount,
          matchedSections,
          bulletLines,
          dateSignals,
          structuredSignals,
        },
        classificationSource: "heuristic",
        recommendedAction: "reject",
      };
    }

    const sanitizedDocumentText = this.sanitizePromptText(rawText).slice(0, 5000);

    const classifierPrompt = `You are a document validation agent for a training platform.

Decide whether this document is a real resume/CV or not.

Return JSON only:
{
  "isCV": true/false,
  "confidence": 0-1,
  "reason": "short explanation",
  "missingSignals": ["signal1"],
  "observedSignals": ["signal1"],
  "score": 0-100
}

DOCUMENT METADATA:
- fileType: ${normalizedFileType || "unknown"}
- downloadedBytes: ${downloadedBytes || "unknown"}
- wordCount: ${wordCount}
- matchedSections: ${matchedSections}
- bulletLines: ${bulletLines}
- dateSignals: ${dateSignals}
- structuredSignals: ${structuredSignals}

DOCUMENT TEXT (TRUNCATED):
${sanitizedDocumentText}
`;

    let semantic = null;
    try {
      semantic = await this.generateJsonWithFallback(classifierPrompt, {
        purpose: "cv validation",
      });
    } catch {
      semantic = null;
    }

    const llmConfidence = semantic && Number.isFinite(Number(semantic.confidence))
      ? Math.max(0, Math.min(1, Number(semantic.confidence)))
      : null;
    const llmScore = semantic && Number.isFinite(Number(semantic.score))
      ? Math.max(0, Math.min(100, Number(semantic.score)))
      : null;

    const hasSemantic = semantic && typeof semantic.isCV === "boolean";
    const finalConfidence = hasSemantic && llmConfidence != null ? llmConfidence : heuristicConfidence;
    const combinedScore = hasSemantic && llmScore != null
      ? Math.round(llmScore * 0.6 + heuristicScore * 0.4)
      : heuristicScore;
    const finalIsValid = hasSemantic ? Boolean(semantic.isCV) : heuristicValid;
    const reason = hasSemantic && semantic?.reason
      ? semantic.reason
      : heuristicValid
        ? "Heuristic CV validation passed"
        : "Heuristic CV validation failed";

    const finalIssues = [
      ...(issues || []),
      ...(heuristicValid ? [] : ["Document structure and content do not look like a CV"]),
      ...(hasSemantic && Array.isArray(semantic?.missingSignals) ? semantic.missingSignals : []),
    ];

    const isAccepted =
      finalIsValid &&
      finalConfidence >= 0.6 &&
      combinedScore >= 65;

    console.log("[POLICY][CV] Final decision", {
      accepted: isAccepted,
      classificationSource: hasSemantic ? "llm" : "heuristic",
      confidence: Number(finalConfidence.toFixed(2)),
      score: combinedScore,
      finalIsValid,
      issues: finalIssues.length,
      reason,
    });

    return {
      isValidCV: isAccepted,
      confidence: Number(finalConfidence.toFixed(2)),
      score: combinedScore,
      reason,
      issues: Array.from(new Set(finalIssues.filter(Boolean))),
      evidence: {
        fileType: normalizedFileType || "unknown",
        downloadedBytes: downloadedBytes || null,
        wordCount,
        matchedSections,
        bulletLines,
        dateSignals,
        structuredSignals,
      },
      classificationSource: hasSemantic ? "llm" : "heuristic",
      recommendedAction: isAccepted ? "accept" : "reject",
    };
  }

  sanitizePromptText(text) {
    return String(text || "")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
      .replace(/\+?\d[\d\s().-]{7,}\d/g, "[REDACTED_PHONE]")
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "[REDACTED_DATE]")
      .replace(/\b\d{5,6}\b/g, "[REDACTED_ID]");
  }

  maskEmail(email) {
    const value = String(email || "").trim();
    if (!value.includes("@")) return "[REDACTED_EMAIL]";
    const [localPart, domain] = value.split("@");
    const safeLocal = localPart.length > 2
      ? `${localPart[0]}***${localPart[localPart.length - 1]}`
      : "***";
    return `${safeLocal}@${domain}`;
  }

  anonymizeName(name) {
    const value = String(name || "").trim();
    if (!value) return "Learner";
    return `${value.charAt(0)}***`;
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

  buildMemoryInsights(memory = {}) {
    if (!memory || typeof memory !== "object") {
      return {
        totalRuns: 0,
        successRuns: 0,
        failedRuns: 0,
        avgValidationScore: null,
        plannerFallbackRuns: 0,
        plannerFallbackRate: null,
        repeatedFailedAgents: [],
        retryPolicyHint: "normal",
      };
    }

    const recentRuns = Array.isArray(memory.recentRuns) ? memory.recentRuns.slice(-10) : [];
    const totalRuns = recentRuns.length;
    const successRuns = recentRuns.filter((run) => run && run.success === true).length;
    const failedRuns = recentRuns.filter((run) => run && run.success === false).length;
    const validationScores = recentRuns
      .map((run) => Number(run?.validationScore))
      .filter((value) => Number.isFinite(value));

    const agentFailureCounts = new Map();
    let plannerFallbackRuns = 0;

    for (const run of recentRuns) {
      const plannerMode = String(run?.plannerMode || "").toLowerCase();
      if (plannerMode === "fallback" || run?.plannerFallbackUsed === true) {
        plannerFallbackRuns += 1;
      }

      const failedAgents = Array.isArray(run?.failedAgents) ? run.failedAgents : [];
      for (const agent of failedAgents) {
        const key = String(agent || "").trim();
        if (!key) continue;
        agentFailureCounts.set(key, (agentFailureCounts.get(key) || 0) + 1);
      }
    }

    const repeatedFailedAgents = Array.from(agentFailureCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([agent]) => agent);

    const plannerFallbackRate = totalRuns > 0 ? Math.round((plannerFallbackRuns / totalRuns) * 100) : null;
    const avgValidationScore = validationScores.length
      ? Math.round(validationScores.reduce((sum, value) => sum + value, 0) / validationScores.length)
      : null;

    const retryPolicyHint = plannerFallbackRate != null && plannerFallbackRate >= 30
      ? "conservative"
      : repeatedFailedAgents.length > 0
        ? "targeted"
        : "normal";

    return {
      totalRuns,
      successRuns,
      failedRuns,
      avgValidationScore,
      plannerFallbackRuns,
      plannerFallbackRate,
      repeatedFailedAgents,
      retryPolicyHint,
      recentFailureRate: totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 100) : null,
    };
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
    const memoryInsights = this.buildMemoryInsights(memory || context.orchestrationMemory || {});

    console.log("[POLICY][PLAN] Planner request", {
      goal,
      availableAgents: availableAgents.length,
      maxLatency: normalizedConstraints.maxLatency,
      costSensitivity: normalizedConstraints.costSensitivity,
      memoryFailureRate: memoryInsights.recentFailureRate,
      memoryFallbackRate: memoryInsights.plannerFallbackRate,
      retryPolicyHint: memoryInsights.retryPolicyHint,
    });

    const plannerPrompt = `You are an expert orchestration planner. Analyze this goal and create an optimal execution plan.

GOAL: ${goal}

CONTEXT:
- User expertise level: ${context.expertise || "unknown"}
- Training topic: ${context.trainingOn || "general"}
- Available agents: ${availableAgents.join(", ")}
- Constraints: ${JSON.stringify(normalizedConstraints)}
- Memory insights: ${memorySummary}
- Memory failure patterns: ${JSON.stringify(memoryInsights)}

Use the memory failure patterns to avoid repeating previously weak plans or unstable execution paths.
If planner fallback rate is high, keep the plan simpler and more deterministic.

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
    const adaptiveSignals = context.adaptiveSignals || {};
    const notificationLearning = context.notificationLearning || {};

    const safeUserName = this.anonymizeName(context.userName);
    const safeCompanyName = this.sanitizePromptText(context.companyName || "Unknown Company");
    const safeTrainingTopic = this.sanitizePromptText(context.trainingTopic || "General");
    const safeCurrentModule = this.sanitizePromptText(context.activeModule?.moduleTitle || "None");

    const prompt = `You are an intelligent notification strategist for a corporate training platform called TrainMate.

Analyze this user context and make smart notification decisions:

USER PROFILE:
- Name: ${safeUserName}
- Company: ${safeCompanyName}
- Training Topic: ${safeTrainingTopic}
- Last Login: ${context.engagementData?.lastLoginAt?.toLocaleString?.() || "Unknown"}
- Learning Streak: ${context.engagementData?.learningStreak || 0} days
- Modules Completed: ${context.engagementData?.modulesCompleted || 0}
- Average Quiz Score: ${context.engagementData?.averageQuizScore || 0}%
- Email Open Rate: ${context.engagementData?.emailOpenRate || 0}%
- Attendance Rate: ${context.engagementData?.attendanceRate || 0}%
- Time Spent Learning: ${context.engagementData?.timeSpentLearning || 0} minutes
- Current Module: ${safeCurrentModule}

NOTIFICATION CONTEXT:
- Notification Type: ${context.notificationType}
- Is First-time User: ${context.isNewUser}
- Current Hour: ${new Date().getHours()}
- User Timezone: ${context.timezone}
- Constraints: ${JSON.stringify(constraints)}
- Memory insights: ${memorySummary}

ADAPTIVE FEEDBACK SIGNALS:
- userIgnoredLast3Notifications: ${Boolean(adaptiveSignals.userIgnoredLast3Notifications)}
- lowEngagementNow: ${Boolean(adaptiveSignals.lowEngagementNow)}
- inCooldown: ${Boolean(adaptiveSignals.inCooldown)}
- recommendedCadenceHours: ${adaptiveSignals.recommendedCadenceHours ?? "n/a"}
- lastSentHoursAgo: ${adaptiveSignals.lastSentHoursAgo ?? "n/a"}
- historicalConsecutiveIgnored: ${Number(notificationLearning.consecutiveIgnored || 0)}
- historicalTotalSent: ${Number(notificationLearning.totalSent || 0)}
- historicalTotalSkipped: ${Number(notificationLearning.totalSkipped || 0)}

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
      shouldSend: !Boolean(adaptiveSignals.userIgnoredLast3Notifications && !isCriticalNotificationType(context.notificationType)),
      reason: Boolean(adaptiveSignals.userIgnoredLast3Notifications && !isCriticalNotificationType(context.notificationType))
        ? "AI unavailable; adaptive fallback throttled due to ignored streak"
        : "AI unavailable, using defaults",
      sendEmail: true,
      createCalendarEvent: true,
      optimalTime: "15:00",
      personalizationTip: "Encourage consistent daily practice",
      urgencyLevel: "medium",
      estimatedEngagementScore: 50,
      recommendedMessageTone: "motivational",
    };
  }

  async decideCalendarDecision(context = {}) {
    const {
      notificationType = "ROADMAP_GENERATED",
      userEmail,
      userName,
      companyName,
      trainingTopic,
      moduleCount = 0,
      estimatedDays = 0,
      activeModuleTitle = "",
      timezone = "Asia/Karachi",
      emailSent = false,
      upstreamDecision = {},
      constraints = {},
    } = context;

    // Hard guards first.
    if (!userEmail || !String(userEmail).includes("@")) {
      return {
        shouldCreateCalendarEvent: false,
        reason: "Invalid or missing user email",
        reminderTime: "15:00",
        urgency: "low",
      };
    }

    if (notificationType === "ROADMAP_GENERATED" && Number(moduleCount || 0) <= 0) {
      return {
        shouldCreateCalendarEvent: false,
        reason: "No modules available for scheduling",
        reminderTime: "15:00",
        urgency: "low",
      };
    }

    if (upstreamDecision && upstreamDecision.createCalendarEvent === false) {
      return {
        shouldCreateCalendarEvent: false,
        reason: "Notification policy disabled calendar creation",
        reminderTime: "15:00",
        urgency: "low",
      };
    }

    const safeUserName = this.anonymizeName(userName || "Trainee");
    const safeEmail = this.maskEmail(userEmail);
    const safeCompanyName = this.sanitizePromptText(companyName || "Unknown");
    const safeTrainingTopic = this.sanitizePromptText(trainingTopic || "General");
    const safeModuleTitle = this.sanitizePromptText(activeModuleTitle || "N/A");

    const prompt = `You are a calendar scheduling decision agent for TrainMate.

USER:
  - Name: ${safeUserName}
  - Email: ${safeEmail}
  - Company: ${safeCompanyName}
- Notification type: ${notificationType}
  - Training topic: ${safeTrainingTopic}
  - Active module: ${safeModuleTitle}
- Module count: ${Number(moduleCount || 0)}
- Estimated days for active module: ${Number(estimatedDays || 0)}
- Timezone: ${timezone}
- Email already sent: ${Boolean(emailSent)}
- Upstream notification decision: ${JSON.stringify(upstreamDecision || {})}
- Constraints: ${JSON.stringify(constraints || {})}

Decide whether a calendar event should be created now.
If yes, choose a practical reminder time in HH:mm (24h).

Return JSON only:
{
  "shouldCreateCalendarEvent": true,
  "reason": "short reason",
  "reminderTime": "15:00",
  "urgency": "low|medium|high"
}`;

    try {
      const parsed = await this.generateJsonWithFallback(prompt, {
        purpose: "calendar event decision",
      });

      if (parsed && typeof parsed.shouldCreateCalendarEvent === "boolean") {
        const reminderTime =
          typeof parsed.reminderTime === "string" && /^\d{1,2}:\d{2}$/.test(parsed.reminderTime)
            ? parsed.reminderTime
            : "15:00";

        const urgency = ["low", "medium", "high"].includes(String(parsed.urgency || "").toLowerCase())
          ? String(parsed.urgency).toLowerCase()
          : "medium";

        return {
          shouldCreateCalendarEvent: parsed.shouldCreateCalendarEvent,
          reason: parsed.reason || "Calendar decision generated",
          reminderTime,
          urgency,
        };
      }
    } catch {
      // Fall through to deterministic fallback.
    }

    return {
      shouldCreateCalendarEvent: true,
      reason: "Fallback calendar policy: create reminder event",
      reminderTime: "15:00",
      urgency: "medium",
    };
  }

  async decideStepRecovery(context = {}) {
    const {
      attempt = 1,
      maxRetries = 1,
      validation = {},
      error = null,
      memoryInsights = {},
      step = {},
    } = context;

    if (attempt >= maxRetries) {
      console.warn("[POLICY][STEP-RECOVERY] Retry budget exhausted", {
        agent: step?.agent || "unknown",
        attempt,
        maxRetries,
      });
      return { action: "fail", inputPatch: null };
    }

    const issues = Array.isArray(validation?.issues) ? validation.issues : [];
    const severityHint = Number(validation?.score || 0) < 30;
    if (severityHint && attempt + 1 >= maxRetries) {
      console.warn("[POLICY][STEP-RECOVERY] Failing due to high severity near retry limit", {
        agent: step?.agent || "unknown",
        score: validation?.score,
        attempt,
        maxRetries,
      });
      return { action: "fail", inputPatch: null };
    }

    if (error && /missing dependencies|not found/i.test(String(error.message || ""))) {
      console.warn("[POLICY][STEP-RECOVERY] Non-recoverable dependency error", {
        agent: step?.agent || "unknown",
        error: error.message,
      });
      return { action: "fail", inputPatch: null };
    }

    const repeatedFailures = Array.isArray(memoryInsights?.repeatedFailedAgents)
      ? memoryInsights.repeatedFailedAgents
      : [];
    const stepAgent = String(step?.agent || "").trim();
    const memoryConservative = memoryInsights?.retryPolicyHint === "conservative";
    const targetedFailure = stepAgent && repeatedFailures.includes(stepAgent);

    if (memoryConservative && Number(validation?.score || 0) < 70 && attempt >= 1) {
      console.log("[POLICY][STEP-RECOVERY] Conservative retry selected", {
        agent: stepAgent || "unknown",
        score: validation?.score,
        attempt,
        retryPolicyHint: memoryInsights?.retryPolicyHint,
      });
      return {
        action: "retry",
        inputPatch: {
          _policyRecoveryHint: `Use a simpler, more deterministic retry for ${stepAgent || "this step"}`,
        },
        backoffMs: 1500,
      };
    }

    const inputPatch = issues.length > 0
      ? { _policyRecoveryHint: `Focus on: ${issues.slice(0, 2).join("; ")}` }
      : null;

    return {
      action: "retry",
      inputPatch,
      backoffMs: targetedFailure ? 1500 : 1000,
    };
  }

  async decideRecoveryStrategy(context = {}) {
    const {
      targetAgent,
      latestOutput,
      issues = [],
      memoryInsights = {},
    } = context;

    const repeatedFailures = Array.isArray(memoryInsights?.repeatedFailedAgents)
      ? memoryInsights.repeatedFailedAgents
      : [];
    const repeatedFailureCount = repeatedFailures.includes(targetAgent) ? 1 : 0;

    if (repeatedFailureCount > 0 && memoryInsights?.retryPolicyHint === "conservative") {
      console.log("[POLICY][RECOVERY] Escalating to fallback", {
        targetAgent,
        retryPolicyHint: memoryInsights?.retryPolicyHint,
      });
      return {
        strategy: "fallback",
        modifiedInput: {
          _policyRecoveryHint: `Repeated failures detected for ${targetAgent || "this agent"}; use a simpler fallback path.`,
        },
      };
    }

    const recoveryPrompt = `An agent failed validation. Suggest recovery strategy.

FAILED OUTPUT:
${JSON.stringify(latestOutput || {}).slice(0, 1000)}

VALIDATION ISSUES:
${issues.join("\n") || "No issues provided"}

TARGET AGENT:
${targetAgent || "unknown"}

MEMORY FAILURE PATTERNS:
${JSON.stringify(memoryInsights || {})}

If this target agent has repeatedly failed across runs, prefer a conservative retry or fallback path.

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
        console.log("[POLICY][RECOVERY] Strategy selected", {
          targetAgent,
          strategy: strategy.strategy,
        });
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
      planCorrections = [],
      executionResults,
      validation,
      constraints,
      availableAgents = [],
      contextSnapshot = {},
      memoryInsights = {},
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
PLAN CORRECTIONS APPLIED: ${JSON.stringify(planCorrections || []).slice(0, 1200)}
CONSTRAINTS: ${JSON.stringify(constraints || {})}
AVAILABLE AGENTS: ${availableAgents.join(", ")}
CONTEXT SNAPSHOT: ${JSON.stringify(contextSnapshot || {}).slice(0, 1000)}
MEMORY FAILURE PATTERNS: ${JSON.stringify(memoryInsights || {})}

Prefer to de-prioritize agents that have repeatedly failed in recent runs unless the failure reason has clearly changed.

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
      prioritizeAgents: [
        ...failedAgents.filter((name) => availableAgents.includes(name)),
        ...Array.isArray(memoryInsights?.repeatedFailedAgents)
          ? memoryInsights.repeatedFailedAgents.filter((name) => availableAgents.includes(name))
          : [],
      ],
      errorStrategy: "retry",
      refineContext: {
        focusTopics: Array.isArray(memoryInsights?.repeatedFailedAgents)
          ? memoryInsights.repeatedFailedAgents.slice(0, 5)
          : [],
        hints: [
          "Increase grounding and completeness in next cycle",
          ...(Array.isArray(memoryInsights?.repeatedFailedAgents) && memoryInsights.repeatedFailedAgents.length > 0
            ? [`De-prioritize repeated failure agents: ${memoryInsights.repeatedFailedAgents.slice(0, 3).join(", ")}`]
            : []),
        ],
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

function isCriticalNotificationType(notificationType = "") {
  const type = String(notificationType || "").toUpperCase();
  return type === "ROADMAP_GENERATED" || type === "QUIZ_UNLOCK";
}

export const policyEngine = new PolicyEngine();
