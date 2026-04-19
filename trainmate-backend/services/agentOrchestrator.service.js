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
import { queueAgentRunIncrement } from "./agentHealthStorage.service.js";

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

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function normalizeGapSkillKey(skill) {
  return String(skill || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSkill(skill) {
  return normalizeGapSkillKey(skill)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function jaccardSimilarity(aSet, bSet) {
  const a = new Set(aSet);
  const b = new Set(bSet);
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function quantile(values = [], q = 0.5) {
  const arr = [...values]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  if (arr.length === 0) return 0;
  if (arr.length === 1) return arr[0];

  const pos = (arr.length - 1) * Math.min(1, Math.max(0, q));
  const base = Math.floor(pos);
  const rest = pos - base;

  if (arr[base + 1] !== undefined) {
    return arr[base] + rest * (arr[base + 1] - arr[base]);
  }
  return arr[base];
}

const VALIDATION_SCORE_THRESHOLDS = {
  retry: 70,
  trusted: 85,
};

const DEFAULT_RETRIEVAL_THRESHOLD = 0.65;
const RETRIEVAL_THRESHOLD_STEP = 0.05;
const MAX_RETRIEVAL_THRESHOLD = 0.85;
const AGENT_RETRIEVAL_BASE_THRESHOLDS = {
  "extract-company-skills": 0.6,
  "retrieve-documents": 0.6,
};

function resolveAgentRetrievalBaseThreshold(agentName) {
  return AGENT_RETRIEVAL_BASE_THRESHOLDS[String(agentName || "")] ?? DEFAULT_RETRIEVAL_THRESHOLD;
}

function resolveRetrievalThreshold(baseThreshold = DEFAULT_RETRIEVAL_THRESHOLD, retryAttempt = 0) {
  const numericBase = Number(baseThreshold);
  const normalizedBase = Number.isFinite(numericBase) && numericBase >= 0 && numericBase <= 1
    ? numericBase
    : DEFAULT_RETRIEVAL_THRESHOLD;
  const numericAttempt = Math.max(0, Number(retryAttempt) || 0);

  return Math.min(MAX_RETRIEVAL_THRESHOLD, normalizedBase + numericAttempt * RETRIEVAL_THRESHOLD_STEP);
}

function getValidationScoreBand(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return "retry";
  if (numericScore < VALIDATION_SCORE_THRESHOLDS.retry) return "retry";
  if (numericScore <= VALIDATION_SCORE_THRESHOLDS.trusted) return "degraded";
  return "trusted";
}

function isConfidenceDebugEnabled() {
  const value = String(process.env.DEBUG_CONFIDENCE_SCORING || "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function confidenceDebugLog(...args) {
  if (!isConfidenceDebugEnabled()) return;
  console.log("[CONF-SCORE]", ...args);
}

function getGapWeightConfig() {
  const defaults = {
    confidenceGap: 0.45,
    roleCriticality: 0.25,
    frequencyWeight: 0.2,
    dependencyWeight: 0.1,
    recencyBoost: 0.08,
  };

  const read = (name, fallback) => {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) ? raw : fallback;
  };

  const cfg = {
    confidenceGap: read("GAP_WEIGHT_CONFIDENCE", defaults.confidenceGap),
    roleCriticality: read("GAP_WEIGHT_CRITICALITY", defaults.roleCriticality),
    frequencyWeight: read("GAP_WEIGHT_FREQUENCY", defaults.frequencyWeight),
    dependencyWeight: read("GAP_WEIGHT_DEPENDENCY", defaults.dependencyWeight),
    recencyBoost: read("GAP_WEIGHT_RECENCY", defaults.recencyBoost),
  };

  const total =
    cfg.confidenceGap +
    cfg.roleCriticality +
    cfg.frequencyWeight +
    cfg.dependencyWeight +
    cfg.recencyBoost;

  if (total <= 0) return defaults;

  const normalized = {
    confidenceGap: cfg.confidenceGap / total,
    roleCriticality: cfg.roleCriticality / total,
    frequencyWeight: cfg.frequencyWeight / total,
    dependencyWeight: cfg.dependencyWeight / total,
    recencyBoost: cfg.recencyBoost / total,
  };

  confidenceDebugLog("Gap weight config", {
    raw: cfg,
    normalized,
  });

  return normalized;
}

function buildDependencyWeights(companyProfiles = []) {
  const tokenMap = new Map();

  for (const profile of companyProfiles) {
    const key = String(profile?.canonicalSkill || normalizeGapSkillKey(profile?.skill));
    if (!key) continue;
    tokenMap.set(key, tokenizeSkill(profile?.skill || key));
  }

  const dependencyMap = new Map();
  const keys = Array.from(tokenMap.keys());

  for (const key of keys) {
    const sourceTokens = tokenMap.get(key) || [];
    let sumSimilarity = 0;
    let peers = 0;

    for (const otherKey of keys) {
      if (otherKey === key) continue;
      const sim = jaccardSimilarity(sourceTokens, tokenMap.get(otherKey) || []);
      if (sim > 0) {
        sumSimilarity += sim;
        peers += 1;
      }
    }

    const avgSimilarity = peers > 0 ? sumSimilarity / peers : 0;
    dependencyMap.set(key, clamp01(avgSimilarity * 2));
  }

  return dependencyMap;
}

function buildWeightedGapAnalysis({ cvProfiles = [], companyProfiles = [], trainingOn = "" }) {
  const cvMap = new Map();
  const companyMap = new Map();

  confidenceDebugLog("Starting weighted gap analysis", {
    trainingOn,
    cvProfiles: Array.isArray(cvProfiles) ? cvProfiles.length : 0,
    companyProfiles: Array.isArray(companyProfiles) ? companyProfiles.length : 0,
  });

  for (const profile of Array.isArray(cvProfiles) ? cvProfiles : []) {
    const key = String(profile?.canonicalSkill || normalizeGapSkillKey(profile?.skill));
    if (!key) continue;

    const prev = cvMap.get(key);
    const nextConf = Number(profile?.calibratedConfidence ?? profile?.confidence ?? 0);
    const prevConf = Number(prev?.calibratedConfidence ?? prev?.confidence ?? 0);
    if (!prev || nextConf > prevConf) {
      cvMap.set(key, profile);
    }
  }

  for (const profile of Array.isArray(companyProfiles) ? companyProfiles : []) {
    const key = String(profile?.canonicalSkill || normalizeGapSkillKey(profile?.skill));
    if (!key) continue;

    const prev = companyMap.get(key);
    const prevFreq = Number(prev?.frequency || 0);
    const nextFreq = Number(profile?.frequency || 0);
    if (!prev || nextFreq > prevFreq) {
      companyMap.set(key, profile);
    }
  }

  const prioritized = [];
  const dependencyWeights = buildDependencyWeights(companyProfiles);
  const config = getGapWeightConfig();

  const companyFreqValues = Array.from(companyMap.values()).map((p) => Number(p?.frequency || 1));
  const maxCompanyFrequency = Math.max(1, ...companyFreqValues);
  const medianCompanyConfidence = quantile(
    Array.from(companyMap.values()).map((p) => Number(p?.calibratedConfidence ?? p?.confidence ?? 0.6)),
    0.5
  );

  confidenceDebugLog("Company profile aggregates", {
    uniqueCompanySkills: companyMap.size,
    uniqueCvSkills: cvMap.size,
    maxCompanyFrequency,
    medianCompanyConfidence: Number(medianCompanyConfidence.toFixed(3)),
  });

  for (const [key, companyProfile] of companyMap.entries()) {
    const cvProfile = cvMap.get(key);
    const companyConfidence = clamp01(companyProfile?.calibratedConfidence ?? companyProfile?.confidence ?? 0.7);
    const cvConfidence = clamp01(cvProfile?.calibratedConfidence ?? cvProfile?.confidence ?? 0);
    const confidenceGap = clamp01(companyConfidence - cvConfidence);

    const frequency = Number(companyProfile?.frequency || 1);
    const frequencyWeight = clamp01(frequency / maxCompanyFrequency);
    const criticalityWeight = clamp01(
      companyConfidence * 0.7 +
      (companyConfidence >= medianCompanyConfidence ? 0.3 : 0.15)
    );
    const dependencyWeight = dependencyWeights.get(key) ?? 0;

    const hasRecencyRisk = Array.isArray(cvProfile?.conflictSignals)
      ? cvProfile.conflictSignals.includes("cv_recency_risk")
      : false;
    const recencyPenalty = hasRecencyRisk && companyConfidence >= 0.7 ? 1 : 0;

    const score = clamp01(
      confidenceGap * config.confidenceGap +
      criticalityWeight * config.roleCriticality +
      frequencyWeight * config.frequencyWeight +
      dependencyWeight * config.dependencyWeight +
      recencyPenalty * config.recencyBoost
    );

    const isMissing = !cvProfile;
    const shouldInclude = isMissing || confidenceGap > 0.12;
    confidenceDebugLog("Skill scoring", {
      skill: companyProfile?.skill || key,
      canonicalSkill: key,
      strategy: companyProfile?.strategy || "unknown",
      sourceType: companyProfile?.sourceType || "unknown",
      rawCompanyConfidence: Number(companyProfile?.confidence ?? 0),
      calibratedCompanyConfidence: Number(companyProfile?.calibratedConfidence ?? companyProfile?.confidence ?? 0),
      rawCvConfidence: Number(cvProfile?.confidence ?? 0),
      calibratedCvConfidence: Number(cvProfile?.calibratedConfidence ?? cvProfile?.confidence ?? 0),
      confidenceGap: Number(confidenceGap.toFixed(3)),
      frequencyWeight: Number(frequencyWeight.toFixed(3)),
      criticalityWeight: Number(criticalityWeight.toFixed(3)),
      dependencyWeight: Number(dependencyWeight.toFixed(3)),
      recencyPenalty,
      weightedScore: Number(score.toFixed(3)),
      includeInGap: shouldInclude,
      includeReason: isMissing ? "missing-in-cv" : "confidence-gap-threshold",
    });

    if (!shouldInclude) continue;

    prioritized.push({
      skill: companyProfile?.skill || key,
      canonicalSkill: key,
      score: Number(score.toFixed(2)),
      roleCriticality: Number(criticalityWeight.toFixed(2)),
      frequencyWeight: Number(frequencyWeight.toFixed(2)),
      dependencyWeight: Number(dependencyWeight.toFixed(2)),
      companyConfidence: Number(companyConfidence.toFixed(2)),
      cvConfidence: Number(cvConfidence.toFixed(2)),
      confidenceGap: Number(confidenceGap.toFixed(2)),
      status: isMissing ? "missing" : "upgrade-needed",
      hasRecencyRisk,
    });
  }

  prioritized.sort((a, b) => b.score - a.score);

  const scores = prioritized.map((item) => item.score);
  const mustHaveThreshold = quantile(scores, 0.67);
  const goodToHaveThreshold = quantile(scores, 0.34);

  for (const item of prioritized) {
    if (item.score >= mustHaveThreshold) {
      item.bucket = "must-have";
    } else if (item.score >= goodToHaveThreshold) {
      item.bucket = "good-to-have";
    } else {
      item.bucket = "optional";
    }
  }

  const buckets = {
    mustHave: prioritized.filter((item) => item.bucket === "must-have").map((item) => item.skill),
    goodToHave: prioritized.filter((item) => item.bucket === "good-to-have").map((item) => item.skill),
    optional: prioritized.filter((item) => item.bucket === "optional").map((item) => item.skill),
  };

  const explorationCandidates = Array.from(companyMap.values())
    .map((profile) => {
      const explorationWeight = clamp01(profile?.explorationWeight ?? 0);
      const confidence = clamp01(profile?.calibratedConfidence ?? profile?.confidence ?? 0);
      const isTopicInference = String(profile?.strategy || "").toLowerCase() === "topic_inference";
      const missingInCv = !cvMap.has(String(profile?.canonicalSkill || normalizeGapSkillKey(profile?.skill)));

      const retrievalPriority = clamp01(
        explorationWeight * 0.65 +
        (isTopicInference ? 0.25 : 0.1) +
        (missingInCv ? 0.1 : 0) -
        confidence * 0.15
      );

      return {
        skill: profile?.skill,
        canonicalSkill: profile?.canonicalSkill,
        sourceType: profile?.sourceType || "unknown",
        strategy: profile?.strategy || "unknown",
        confidence: Number(confidence.toFixed(2)),
        explorationWeight: Number(explorationWeight.toFixed(2)),
        retrievalPriority: Number(retrievalPriority.toFixed(2)),
        isTopicInference,
        missingInCv,
      };
    })
    .filter((item) => item.retrievalPriority >= 0.35 || item.isTopicInference)
    .sort((a, b) => b.retrievalPriority - a.retrievalPriority)
    .slice(0, 12);

  confidenceDebugLog("Gap buckets summary", {
    totalPrioritized: prioritized.length,
    mustHave: buckets.mustHave.length,
    goodToHave: buckets.goodToHave.length,
    optional: buckets.optional.length,
    topPrioritized: prioritized.slice(0, 5).map((item) => ({
      skill: item.skill,
      score: item.score,
      bucket: item.bucket,
      confidenceGap: item.confidenceGap,
    })),
    topExploration: explorationCandidates.slice(0, 5).map((item) => ({
      skill: item.skill,
      retrievalPriority: item.retrievalPriority,
      strategy: item.strategy,
      explorationWeight: item.explorationWeight,
      confidence: item.confidence,
    })),
  });

  return {
    prioritized,
    buckets,
    skillGap: prioritized.map((item) => item.skill),
    criticalGaps: buckets.mustHave.slice(0, 10),
    explorationCandidates,
  };
}

function normalizePrioritySkillsList(skills = []) {
  return Array.from(
    new Set(
      (Array.isArray(skills) ? skills : [])
        .map((skill) => String(skill || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeSkillToken(skill) {
  return normalizeGapSkillKey(skill);
}

function getSkillPriorityRank(skill, prioritizedSkills = {}) {
  const normalizedSkill = normalizeSkillToken(skill);
  const mustHave = new Set(normalizePrioritySkillsList(prioritizedSkills.mustHave).map(normalizeSkillToken));
  const goodToHave = new Set(normalizePrioritySkillsList(prioritizedSkills.goodToHave).map(normalizeSkillToken));

  if (mustHave.has(normalizedSkill)) return 0;
  if (goodToHave.has(normalizedSkill)) return 1;
  return 2;
}

function getModulePriorityRank(module = {}, prioritizedSkills = {}) {
  const skills = Array.isArray(module?.skillsCovered) ? module.skillsCovered : [];
  if (skills.length === 0) return 3;

  return skills.reduce((bestRank, skill) => {
    const rank = getSkillPriorityRank(skill, prioritizedSkills);
    return Math.min(bestRank, rank);
  }, 3);
}

function sortModulesByPriority(modules = [], prioritizedSkills = {}) {
  return [...modules].sort((a, b) => {
    const aRank = getModulePriorityRank(a, prioritizedSkills);
    const bRank = getModulePriorityRank(b, prioritizedSkills);
    if (aRank !== bRank) return aRank - bRank;

    const aDays = Number(a?.estimatedDays || 1);
    const bDays = Number(b?.estimatedDays || 1);
    if (aDays !== bDays) return aDays - bDays;

    return String(a?.moduleTitle || "").localeCompare(String(b?.moduleTitle || ""));
  });
}

function parseDurationToDays(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  const text = String(value).toLowerCase().trim();
  if (!text) return null;

  const numericOnly = Number(text);
  if (Number.isFinite(numericOnly) && numericOnly > 0) {
    return numericOnly;
  }

  const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*[-to]+\s*(\d+(?:\.\d+)?)/i);
  const baseNumber = rangeMatch
    ? (Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2
    : Number((text.match(/\d+(?:\.\d+)?/) || [])[0]);

  if (!Number.isFinite(baseNumber) || baseNumber <= 0) return null;

  if (/month/.test(text)) return baseNumber * 30;
  if (/week/.test(text)) return baseNumber * 7;
  if (/day/.test(text)) return baseNumber;

  return baseNumber;
}

function moduleTextBlob(module = {}) {
  const title = String(module?.moduleTitle || "");
  const description = String(module?.description || "");
  const skills = Array.isArray(module?.skillsCovered) ? module.skillsCovered.join(" ") : "";
  return normalizeGapSkillKey(`${title} ${description} ${skills}`);
}

function skillCoverageMatch(moduleBlob = "", skill = "") {
  const normalizedSkill = normalizeGapSkillKey(skill);
  if (!normalizedSkill) return false;
  if (moduleBlob.includes(normalizedSkill)) return true;

  const stopWords = new Set([
    "and",
    "or",
    "the",
    "for",
    "with",
    "from",
    "into",
    "over",
    "under",
    "through",
    "using",
  ]);

  const tokens = tokenizeSkill(skill)
    .map((token) => String(token || "").trim())
    .filter((token) => token.length >= 4 && !stopWords.has(token));

  if (tokens.length === 0) return false;

  const matched = tokens.filter((token) => moduleBlob.includes(token)).length;
  return matched / tokens.length >= 0.6;
}

function isTrivialModule(module = {}) {
  const title = normalizeGapSkillKey(module?.moduleTitle || "");
  const description = normalizeGapSkillKey(module?.description || "");
  const combined = `${title} ${description}`.trim();
  if (!combined) return true;

  const titlePatterns = [
    /^learn\s+basics?$/,
    /^basics?$/,
    /^practice$/,
    /^introduction$/,
    /^overview$/,
    /^module\s*\d+$/,
  ];

  const descriptionPatterns = [
    /^practice$/,
    /^general\s+practice$/,
    /^basic\s+practice$/,
    /^intro(?:duction)?$/,
  ];

  if (titlePatterns.some((pattern) => pattern.test(title))) {
    return true;
  }

  if (descriptionPatterns.some((pattern) => pattern.test(description))) {
    return true;
  }

  // Catch highly generic combined phrasing even when title/description split differently.
  return /\blearn\s+basics?\b/.test(combined) && /\bpractice\b/.test(combined);
}

const CORE_SKILL_CATEGORIES = {
  backend: ["backend", "api", "node", "express", "server", "database", "sql", "microservice"],
  frontend: ["frontend", "react", "ui", "css", "html", "javascript", "typescript"],
  ml: ["machine learning", "ml", "model", "neural", "tensorflow", "pytorch", "scikit"],
  data: ["data", "analytics", "etl", "warehouse", "bi", "visualization"],
  devops: ["devops", "docker", "kubernetes", "ci", "cd", "deployment", "monitoring"],
  accounting: ["accounting", "bookkeeping", "financial", "audit", "tax", "invoice", "reconciliation"],
  communication: ["communication", "stakeholder", "reporting", "presentation", "collaboration"],
};

function detectSkillCategories(text = "") {
  const normalized = normalizeGapSkillKey(text);
  const categories = new Set();

  for (const [category, keywords] of Object.entries(CORE_SKILL_CATEGORIES)) {
    if (keywords.some((keyword) => normalized.includes(normalizeGapSkillKey(keyword)))) {
      categories.add(category);
    }
  }

  return categories;
}

function buildStrictRoadmapValidation({ modules = [], mustHaveSkills = [], context = {}, previousResults = {} }) {
  const issues = [];
  const hardFails = [];
  const improvements = [];

  const validModules = (Array.isArray(modules) ? modules : []).filter((m) => m && typeof m === "object");
  const moduleBlobs = validModules.map((module) => moduleTextBlob(module));
  const actualDurationDays = validModules.reduce((sum, module) => sum + (Number(module?.estimatedDays) || 1), 0);
  const allowedDurationDays = parseDurationToDays(context?.trainingDuration);

  const normalizedMustHave = normalizePrioritySkillsList(mustHaveSkills);
  const coveredMustHave = normalizedMustHave.filter((skill) =>
    moduleBlobs.some((blob) => skillCoverageMatch(blob, skill))
  );
  const mustHaveCoverage = normalizedMustHave.length > 0
    ? coveredMustHave.length / normalizedMustHave.length
    : 1;

  const trivialModules = validModules
    .map((module, idx) => ({ idx, module }))
    .filter(({ module }) => isTrivialModule(module));

  const requiredCategoryText = [
    ...normalizedMustHave,
    ...(Array.isArray(previousResults?.["extract-company-skills"]?.companySkills)
      ? previousResults["extract-company-skills"].companySkills
      : []),
  ].join(" ");
  const requiredCategories = detectSkillCategories(requiredCategoryText);
  const coveredCategories = detectSkillCategories(moduleBlobs.join(" "));
  const missingCoreCategories = Array.from(requiredCategories).filter((cat) => !coveredCategories.has(cat));

  const cvSkills = Array.isArray(previousResults?.["extract-cv-skills"]?.cvSkills)
    ? previousResults["extract-cv-skills"].cvSkills
    : [];
  const companySkills = Array.isArray(previousResults?.["extract-company-skills"]?.companySkills)
    ? previousResults["extract-company-skills"].companySkills
    : [];
  const alignmentAnchors = normalizePrioritySkillsList([
    ...normalizedMustHave,
    ...companySkills,
    ...cvSkills,
    context?.trainingOn,
  ]);
  const alignedModules = validModules.filter((module, idx) => {
    const blob = moduleBlobs[idx] || "";
    return alignmentAnchors.some((anchor) => skillCoverageMatch(blob, anchor));
  }).length;
  const contextAlignmentRatio = validModules.length > 0 ? alignedModules / validModules.length : 0;

  // Hard fail: must-have coverage below 60%.
  if (normalizedMustHave.length > 0 && mustHaveCoverage < 0.6) {
    hardFails.push(`Must-have skill coverage below 60% (${coveredMustHave.length}/${normalizedMustHave.length})`);
  }

  // Hard fail: module count or trivial modules.
  if (validModules.length < 2) {
    hardFails.push("Roadmap has fewer than 2 modules");
  }
  if (trivialModules.length > 0) {
    hardFails.push("Roadmap contains trivial or overly generic modules");
  }

  // Hard fail: duration mismatch beyond 40%.
  if (Number.isFinite(allowedDurationDays) && allowedDurationDays > 0) {
    const mismatchRatio = Math.abs(actualDurationDays - allowedDurationDays) / allowedDurationDays;
    if (mismatchRatio > 0.4) {
      hardFails.push(
        `Duration mismatch exceeds 40% (actual ${actualDurationDays}d vs allowed ${Math.round(allowedDurationDays)}d)`
      );
    }
  }

  // Hard fail: required category cluster absent in generated modules.
  if (missingCoreCategories.length > 0) {
    hardFails.push(`Missing core skill categories: ${missingCoreCategories.join(", ")}`);
  }

  const moduleRanks = validModules.map((module) => getModulePriorityRank(module, { mustHave: normalizedMustHave }));
  const progressionValid = moduleRanks.every((rank, idx) => idx === 0 || rank >= moduleRanks[idx - 1]);
  if (!progressionValid) {
    issues.push("Modules are not in a logical progression from must-have to optional skills");
    improvements.push("Reorder modules so must-have skills are covered first");
  }

  if (contextAlignmentRatio < 0.5) {
    issues.push("Roadmap weakly aligned with CV/company/training context");
    improvements.push("Increase module-level references to company priorities and user context");
  }

  if (hardFails.length > 0) {
    issues.push(...hardFails);
  }

  const hardFailPenalty = hardFails.length * 25;
  const structurePenalty = progressionValid ? 0 : 12;
  const alignmentPenalty = contextAlignmentRatio >= 0.5 ? 0 : 12;
  const score = Math.max(0, Math.min(100, 95 - hardFailPenalty - structurePenalty - alignmentPenalty));

  const pass = hardFails.length === 0 && progressionValid && contextAlignmentRatio >= 0.5;

  return {
    pass,
    score,
    hardFails,
    issues,
    improvements,
    gates: {
      mustHaveCoverage: {
        pass: normalizedMustHave.length === 0 || mustHaveCoverage >= 0.6,
        covered: coveredMustHave.length,
        total: normalizedMustHave.length,
        ratio: Number(mustHaveCoverage.toFixed(2)),
      },
      moduleQuality: {
        pass: validModules.length >= 2 && trivialModules.length === 0,
        totalModules: validModules.length,
        trivialModules: trivialModules.length,
      },
      durationRealism: {
        pass:
          !Number.isFinite(allowedDurationDays) ||
          allowedDurationDays <= 0 ||
          Math.abs(actualDurationDays - allowedDurationDays) / allowedDurationDays <= 0.4,
        actualDays: actualDurationDays,
        allowedDays: Number.isFinite(allowedDurationDays) ? Math.round(allowedDurationDays) : null,
      },
      coreCategories: {
        pass: missingCoreCategories.length === 0,
        missing: missingCoreCategories,
        required: Array.from(requiredCategories),
      },
      structure: {
        pass: progressionValid,
      },
      contextAlignment: {
        pass: contextAlignmentRatio >= 0.5,
        ratio: Number(contextAlignmentRatio.toFixed(2)),
      },
    },
  };
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

      const { cvSkills, cvSkillProfiles, extractionDetails } = await extractSkillsAgentically({
        cvText,
        companyDocsText: '', // Will be filled after company doc fetching
        expertise,
        trainingOn,
        structuredCv,
        mode: 'cv_only',
      });

      return {
        cvSkills,
        cvSkillProfiles: Array.isArray(cvSkillProfiles) ? cvSkillProfiles : [],
        extractionDetails,
        agentName: 'CV Skills Agent'
      };
    });

    this.registerAgent('extract-company-skills', async ({ previousResults, context, retrievalConfig = {} }) => {
      console.log('    🤖 Company Skills Agent: Analyzing company docs...');
      const { companyDocsText, expertise, trainingOn, companyId, deptId } = context;

      let resolvedCompanyDocsText = String(companyDocsText || '').trim();

      // If planner did not preload docs yet, fetch a focused company context directly from Pinecone.
      if (!resolvedCompanyDocsText) {
        try {
          const fallbackQuery = `${trainingOn || 'General'} requirements best practices`;
          const docs = await retrieveDeptDocsFromPinecone({
            queryText: fallbackQuery,
            companyId,
            deptName: deptId,
            minScore: retrievalConfig.minScore,
          });
          resolvedCompanyDocsText = (Array.isArray(docs) ? docs : [])
            .map((item) => item?.text || '')
            .filter(Boolean)
            .join('\n')
            .slice(0, 8000);

          console.log('    🔎 Company Skills Agent preload docs:', {
            fetched: Array.isArray(docs) ? docs.length : 0,
            chars: resolvedCompanyDocsText.length,
          });
        } catch (error) {
          console.warn('    ⚠️  Company Skills Agent preload retrieval failed:', error.message);
        }
      }

      const { companySkills, companySkillProfiles, extractionDetails } = await extractSkillsAgentically({
        cvText: '',
        companyDocsText: resolvedCompanyDocsText,
        expertise,
        trainingOn,
        mode: 'company_only',
      });

      return {
        companySkills,
        companySkillProfiles: Array.isArray(companySkillProfiles) ? companySkillProfiles : [],
        extractionDetails,
        agentName: 'Company Skills Agent'
      };
    });

    this.registerAgent('analyze-skill-gaps', async ({ previousResults, context }) => {
      console.log('    🤖 Gap Analysis Agent: Identifying skill gaps...');
      const cvSkills = previousResults['extract-cv-skills']?.cvSkills || [];
      const companySkills = previousResults['extract-company-skills']?.companySkills || [];
      const cvSkillProfiles = previousResults['extract-cv-skills']?.cvSkillProfiles || [];
      const companySkillProfiles = previousResults['extract-company-skills']?.companySkillProfiles || [];

      if (Array.isArray(cvSkillProfiles) && cvSkillProfiles.length > 0 && Array.isArray(companySkillProfiles) && companySkillProfiles.length > 0) {
        const weighted = buildWeightedGapAnalysis({
          cvProfiles: cvSkillProfiles,
          companyProfiles: companySkillProfiles,
          trainingOn: context?.trainingOn || "General",
        });

        const bucketCounts = {
          mustHave: Array.isArray(weighted?.buckets?.mustHave) ? weighted.buckets.mustHave.length : 0,
          goodToHave: Array.isArray(weighted?.buckets?.goodToHave) ? weighted.buckets.goodToHave.length : 0,
          optional: Array.isArray(weighted?.buckets?.optional) ? weighted.buckets.optional.length : 0,
        };
        const topScored = Array.isArray(weighted?.prioritized)
          ? weighted.prioritized.slice(0, 5).map((item) => ({
              skill: item?.skill,
              score: item?.score,
              confidenceGap: item?.confidenceGap,
              bucket: item?.bucket,
            }))
          : [];

        console.log('    📊 Gap confidence summary:', {
          prioritized: Array.isArray(weighted?.prioritized) ? weighted.prioritized.length : 0,
          buckets: bucketCounts,
          topScored,
        });

        return {
          skillGap: weighted.skillGap,
          criticalGaps: weighted.criticalGaps,
          gapCount: weighted.skillGap.length,
          prioritizedGaps: weighted.prioritized,
          gapBuckets: weighted.buckets,
          explorationCandidates: weighted.explorationCandidates,
          agentName: 'Gap Analysis Agent'
        };
      }

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
      const explorationCandidates = previousResults['analyze-skill-gaps']?.explorationCandidates || [];
      const { trainingOn } = context;

      const explorationSkills = explorationCandidates
        .slice(0, 6)
        .map((item) => String(item?.skill || '').trim())
        .filter(Boolean);

      const plannerPrompt = `Create a retrieval plan for skill gaps.

SKILL GAPS: ${skillGap.slice(0, 10).join(", ")}
EXPLORATION HINTS: ${explorationSkills.join(", ") || "None"}
TRAINING TOPIC: ${trainingOn}

Return JSON:
{
  "queries": ["query1", "query2", "query3"],
  "focusAreas": ["area1", "area2"],
  "explorationAreas": ["area1", "area2"],
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
          const explorationAreas = Array.isArray(plan?.explorationAreas)
            ? plan.explorationAreas.map((f) => String(f || '').trim()).filter(Boolean)
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
            explorationAreas: explorationAreas.length > 0 ? explorationAreas : explorationSkills,
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
        explorationAreas: explorationSkills,
        priority: 'high',
        agentName: 'Planning Agent'
      };
    });

    this.registerAgent('retrieve-documents', async ({ previousResults, context, retrievalConfig = {} }) => {
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
            minScore: retrievalConfig.minScore,
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
      const prioritizedSkills = previousResults['analyze-skill-gaps']?.gapBuckets || {
        mustHave: previousResults['analyze-skill-gaps']?.criticalGaps || [],
        goodToHave: [],
      };
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
        prioritizedSkills,
      });

      return {
        modules: sortModulesByPriority(modules, prioritizedSkills),
        moduleCount: modules.length,
        totalDays: modules.reduce((sum, m) => sum + (m.estimatedDays || 1), 0),
        prioritizedSkills,
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
      const mustHaveSkills =
        previousResults['analyze-skill-gaps']?.gapBuckets?.mustHave ||
        previousResults['analyze-skill-gaps']?.criticalGaps ||
        [];

      const strictValidation = buildStrictRoadmapValidation({
        modules,
        mustHaveSkills,
        context,
        previousResults,
      });

      console.log('    📏 Strict validation summary:', {
        pass: strictValidation.pass,
        score: strictValidation.score,
        modules: Array.isArray(modules) ? modules.length : 0,
        mustHaveSkills: Array.isArray(mustHaveSkills) ? mustHaveSkills.length : 0,
      });
      console.log('    📐 Strict validation gates:', strictValidation.gates);
      if (Array.isArray(strictValidation.hardFails) && strictValidation.hardFails.length > 0) {
        console.warn('    ❌ Strict hard fails:', strictValidation.hardFails);
      }

      return {
        ...strictValidation,
        reason: strictValidation.pass
          ? 'Roadmap passed strict multi-gate validation'
          : 'Roadmap failed strict multi-gate validation',
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

  buildMemoryInsights(memory = {}) {
    const recentRuns = Array.isArray(memory?.recentRuns) ? memory.recentRuns.slice(-10) : [];
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

    const recentValidationScores = recentRuns
      .map((run) => Number(run?.validationScore))
      .filter((value) => Number.isFinite(value));

    const avgValidationScore = recentValidationScores.length
      ? Math.round(recentValidationScores.reduce((sum, value) => sum + value, 0) / recentValidationScores.length)
      : null;

    const totalRuns = recentRuns.length;
    const failedRuns = recentRuns.filter((run) => run && run.success === false).length;
    const plannerFallbackRate = totalRuns > 0 ? Math.round((plannerFallbackRuns / totalRuns) * 100) : null;

    return {
      totalRuns,
      failedRuns,
      avgValidationScore,
      plannerFallbackRuns,
      plannerFallbackRate,
      repeatedFailedAgents,
      retryPolicyHint:
        plannerFallbackRate != null && plannerFallbackRate >= 30
          ? "conservative"
          : repeatedFailedAgents.length > 0
            ? "targeted"
            : "normal",
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
          failedAgents: update.failedAgents || [],
          validationScore: update.validationScore ?? null,
          validationBand: update.validationBand ?? null,
          plannerMode: update.plannerMode || null,
          plannerFallbackUsed: Boolean(update.plannerFallbackUsed),
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
          lastFailedAgents: update.failedAgents || [],
          lastValidationScore: update.validationScore ?? null,
          lastValidationBand: update.validationBand ?? null,
          lastPlannerMode: update.plannerMode || null,
          lastPlannerFallbackUsed: Boolean(update.plannerFallbackUsed),
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
    const fallbackPlan = this.generateFallbackPlan(goal, Array.from(availableAgents), { log: false });
    const corrections = [];

    if (!plan || !Array.isArray(plan.steps)) {
      corrections.push({
        type: "invalid_plan_shape_fallback",
        reason: "Planner returned non-array steps",
      });
      return {
        plan: fallbackPlan,
        warnings: ["Planner returned an invalid plan shape; using fallback."],
        corrections,
      };
    }

    const warnings = [];
    const normalizedSteps = [];

    for (const rawStep of plan.steps) {
      const rawAgent = typeof rawStep?.agent === "string" ? rawStep.agent.trim() : "";
      if (!rawAgent || !availableAgents.has(rawAgent)) {
        warnings.push(`Planner proposed unknown agent: ${rawAgent || "<empty>"}`);
        corrections.push({
          type: "unknown_agent_removed",
          agent: rawAgent || "<empty>",
        });
        continue;
      }

      normalizedSteps.push({
        stepNumber: normalizedSteps.length + 1,
        sourceStepNumber: Number.isFinite(Number(rawStep?.stepNumber))
          ? Number(rawStep.stepNumber)
          : null,
        description: rawStep?.description || `Execute ${rawAgent}`,
        agent: rawAgent,
        critical: rawStep?.critical !== false,
        dependencies: Array.isArray(rawStep?.dependencies)
          ? rawStep.dependencies
              .map((d) => String(d ?? "").trim())
              .filter(Boolean)
          : [],
        retryPolicy: {
          maxRetries: Math.max(1, Number(rawStep?.retryPolicy?.maxRetries) || 1),
          backoffMs: Math.max(0, Number(rawStep?.retryPolicy?.backoffMs) || 1000),
        },
      });
    }

    if (normalizedSteps.length === 0) {
      corrections.push({
        type: "all_steps_invalid_fallback",
        reason: "No valid steps remained after sanitization",
      });
      return {
        plan: fallbackPlan,
        warnings: [...warnings, "No valid planned steps remained; using fallback."],
        corrections,
      };
    }

    const sourceStepToAgent = new Map();
    for (const step of normalizedSteps) {
      if (Number.isFinite(step?.sourceStepNumber) && step.sourceStepNumber > 0) {
        sourceStepToAgent.set(step.sourceStepNumber, step.agent);
      }
    }

    const plannedAgentSet = new Set(normalizedSteps.map((s) => s.agent));
    for (const step of normalizedSteps) {
      const resolved = [];
      for (const depRaw of step.dependencies || []) {
        let dep = String(depRaw || "").trim();
        if (!dep) continue;

        const numericMatch = dep.match(/^\d+$/);
        if (numericMatch) {
          const depNum = Number(dep);
          const mappedAgent = sourceStepToAgent.get(depNum) || normalizedSteps[depNum - 1]?.agent;
          if (mappedAgent) {
            corrections.push({
              type: "numeric_dependency_mapped",
              step: step.agent,
              from: dep,
              to: mappedAgent,
            });
            dep = mappedAgent;
          }
        }

        if (dep === step.agent) {
          warnings.push(`Removed self dependency '${dep}' from agent '${step.agent}'.`);
          corrections.push({
            type: "self_dependency_removed",
            step: step.agent,
            dependency: dep,
          });
          continue;
        }

        const exists = plannedAgentSet.has(dep);
        if (!exists) {
          warnings.push(`Removed invalid dependency '${dep}' from agent '${step.agent}'.`);
          corrections.push({
            type: "invalid_dependency_removed",
            from: `${step.agent} <- ${dep}`,
            step: step.agent,
            dependency: dep,
          });
          continue;
        }

        if (!resolved.includes(dep)) {
          resolved.push(dep);
        }
      }

      step.dependencies = resolved;
    }

    const allowedStrategies = new Set(["fail_fast", "retry", "skip_non_critical", "pivot"]);
    const errorStrategy = allowedStrategies.has(plan.errorStrategy)
      ? plan.errorStrategy
      : "retry";
    if (!allowedStrategies.has(plan.errorStrategy)) {
      corrections.push({
        type: "error_strategy_corrected",
        from: plan.errorStrategy || "<empty>",
        to: "retry",
      });
    }

    if (this.isRoadmapGoal(goal) && availableAgents.has("generate-roadmap")) {
      const cvStep = normalizedSteps.find((s) => s.agent === "extract-cv-skills");
      const companyStep = normalizedSteps.find((s) => s.agent === "extract-company-skills");

      // Keep extraction deterministic and logs readable by avoiding parallel CV/company extraction.
      if (cvStep && companyStep) {
        const deps = Array.isArray(companyStep.dependencies) ? companyStep.dependencies : [];
        if (!deps.includes("extract-cv-skills")) {
          companyStep.dependencies = [...deps, "extract-cv-skills"];
          corrections.push({
            type: "dependency_injected",
            from: "extract-company-skills",
            dependency: "extract-cv-skills",
            reason: "serialize extraction for deterministic execution",
          });
        }
      }

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
        corrections.push({
          type: "missing_step_injected",
          step: "generate-roadmap",
          reason: "roadmap goal requires roadmap generation",
        });
      }

      // Company document retrieval is useful but optional in early data phases.
      // Keep the agent in the plan, but do not allow it to block roadmap generation.
      for (const step of normalizedSteps) {
        if (step.agent === "retrieve-documents") {
          if (step.critical !== false) {
            corrections.push({
              type: "criticality_adjusted",
              step: "retrieve-documents",
              from: true,
              to: false,
              reason: "non-blocking retrieval in roadmap workflow",
            });
          }
          step.critical = false;
          step.retryPolicy = {
            maxRetries: Math.max(2, Number(step?.retryPolicy?.maxRetries) || 1),
            backoffMs: Math.max(0, Number(step?.retryPolicy?.backoffMs) || 1000),
          };
        }

        if (step.agent === "extract-company-skills") {
          step.retryPolicy = {
            maxRetries: Math.max(2, Number(step?.retryPolicy?.maxRetries) || 1),
            backoffMs: Math.max(0, Number(step?.retryPolicy?.backoffMs) || 1000),
          };
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
      corrections,
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
      const memoryInsights = this.buildMemoryInsights(longTermMemory || {});
      console.log("[ORCH] Memory insights", {
        totalRuns: memoryInsights.totalRuns,
        failedRuns: memoryInsights.failedRuns,
        plannerFallbackRate: memoryInsights.plannerFallbackRate,
        repeatedFailedAgents: Array.isArray(memoryInsights.repeatedFailedAgents)
          ? memoryInsights.repeatedFailedAgents.slice(0, 5)
          : [],
        retryPolicyHint: memoryInsights.retryPolicyHint,
      });
      const runContext = {
        ...context,
        orchestrationMemory: longTermMemory,
        memoryInsights,
      };
      const constraints = this.normalizeConstraintEnvelope(runContext.constraints);
      const maxIterations = Math.max(2, Math.min(4, Number(runContext.maxReasoningIterations) || 3));

      let activeContext = runContext;
      let activePlan = null;
      let activeWarnings = [];
      let activePlanCorrections = [];
      let finalExecutionResults = null;
      let finalValidation = null;
      let successfulCycle = null;

      // STEP 1: Generate initial execution plan
      console.log("\n📋 STEP 1: Generating execution plan...");
      const rawPlan = await this.generatePlan(goal, runContext);
      const { plan, warnings, corrections } = this.normalizePlan(rawPlan, goal);
      activePlan = plan;
      activeWarnings = warnings;
      activePlanCorrections = corrections || [];

      if (warnings.length > 0) {
        console.warn("⚠️  Plan sanitization warnings:", warnings);
      }
      if (activePlanCorrections.length > 0) {
        console.warn("🛠️  Plan corrections applied:", activePlanCorrections);
      }

      executionLog.push({
        stage: "planning",
        status: "success",
        detail: `Generated plan with ${plan.steps.length} steps`,
        steps: plan.steps.map((s) => s.agent),
        errorStrategy: plan.errorStrategy,
        warnings,
        planCorrections: activePlanCorrections,
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
          planCorrections: activePlanCorrections,
          executionResults,
          validation,
          context: activeContext,
          constraints,
          memoryInsights: activeContext?.memoryInsights || {},
        });

        const replanned = this.applyReplanFromCritique(activePlan, critique);
        const normalizedReplan = this.normalizePlan(replanned, goal);
        activePlan = normalizedReplan.plan;
        activeWarnings = normalizedReplan.warnings;
        activePlanCorrections = normalizedReplan.corrections || [];
        activeContext = this.refineContextForNextIteration(activeContext, critique, cycle);

        executionLog.push({
          stage: "replan",
          cycle,
          status: "updated",
          critique,
          warnings: activeWarnings,
          planCorrections: activePlanCorrections,
          nextSteps: activePlan.steps.map((s) => s.agent),
        });

        if (activeWarnings.length > 0) {
          console.warn("⚠️  Replan sanitization warnings:", activeWarnings);
        }
        if (activePlanCorrections.length > 0) {
          console.warn("🛠️  Replan corrections applied:", activePlanCorrections);
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

      const plannerMode = activePlan?.plannerMode || "llm";
      const plannerFallbackUsed = plannerMode === "fallback";
      console.log("[ORCH] Planner mode", {
        plannerMode,
        plannerFallbackUsed,
      });
      if (plannerFallbackUsed) {
        const fallbackPenalty = 10;
        const adjustedScore = Math.max(0, Number(finalValidation.score || 0) - fallbackPenalty);
        const adjustedBand = getValidationScoreBand(adjustedScore);

        console.warn("[ORCH] Applying planner fallback penalty", {
          fallbackPenalty,
          originalScore: finalValidation.score,
          adjustedScore,
          adjustedBand,
        });

        finalValidation = {
          ...finalValidation,
          score: adjustedScore,
          scoreBand: adjustedBand,
          degraded: true,
          trusted: adjustedBand === "trusted",
          pass: Boolean(finalValidation.pass) && adjustedScore >= VALIDATION_SCORE_THRESHOLDS.retry,
          reason: `${finalValidation.reason || "Final validation"} | planner fallback penalty applied`,
        };
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
        plannerMode,
        plannerFallbackUsed,
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
        failedAgents: Array.isArray(finalExecutionResults?.failedAgents) ? finalExecutionResults.failedAgents : [],
        validationScore: finalValidation.score,
        validationBand: finalValidation.scoreBand || getValidationScoreBand(finalValidation.score),
        plannerMode,
        plannerFallbackUsed,
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
          validationBand: finalValidation.scoreBand || getValidationScoreBand(finalValidation.score),
          validationState: finalValidation.degraded
            ? "degraded"
            : finalValidation.trusted
              ? "trusted"
              : finalValidation.pass
                ? "accepted"
                : "blocked",
          plannerMode,
          plannerFallbackUsed,
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
        failedAgents: Array.isArray(executionLog)
          ? executionLog
              .filter((entry) => entry && (entry.status === "FAILED" || entry.status === "SKIPPED"))
              .map((entry) => entry.agent)
              .filter(Boolean)
          : [],
        plannerMode: "unknown",
        plannerFallbackUsed: false,
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
      return {
        ...plan,
        plannerMode: "llm",
      };
    } catch (error) {
      console.warn("⚠️  Planner agent failed:", error.message);
      // Return fallback plan
      return this.generateFallbackPlan(goal, availableAgents, { log: true });
    }
  }

  /**
   * Generate fallback plan if planner fails
   */
  generateFallbackPlan(goal, availableAgents, options = {}) {
    if (options?.log !== false) {
      console.log("🔄 Using fallback plan");
    }

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
      plannerMode: "fallback",
    };
  }

  async critiqueExecutionAndSuggestReplan({
    goal,
    cycle,
    plan,
    planCorrections = [],
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
      planCorrections,
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
        let attemptQueued = false;
        try {
          const constraints = this.normalizeConstraintEnvelope(context?.constraints);
          const baseRetrievalThreshold = step?.retryPolicy?.retrievalThreshold ?? resolveAgentRetrievalBaseThreshold(step.agent);
          const retrievalThreshold = resolveRetrievalThreshold(
            baseRetrievalThreshold,
            attempts
          );
          const executionPlan = {
            strategy: "single_pass",
            retrievalDepth: "standard",
            notes: "control-plane execution",
          };

          output = await agentDefinition.execute({
            ...stepInput,
            retrievalConfig: {
              minScore: retrievalThreshold,
              retryAttempt: attempts,
              baseThreshold: Number(baseRetrievalThreshold) || DEFAULT_RETRIEVAL_THRESHOLD,
              maxThreshold: MAX_RETRIEVAL_THRESHOLD,
              thresholdStep: RETRIEVAL_THRESHOLD_STEP,
            },
            executionPlan,
            constraints,
          });

          const validation = await this.validateOutput(output, {
            ...step,
            input: stepInput,
          });
          const pass = Boolean(validation.pass);
          const mergedScore = Number(validation.score || 0);
          const mergedIssues = Array.isArray(validation.issues) ? validation.issues : [];
          const mergedReason = validation.reason || "Validation result unavailable";
          const scoreBand = getValidationScoreBand(mergedScore);
          const canRetryOnScore =
            scoreBand === "retry" &&
            validation.canRecover !== false &&
            step.critical !== false;

          if (pass && !canRetryOnScore) {
            results[step.agent] = output;
            stepOrderMap[step.agent] = step.stepNumber;

            const stepStatus = scoreBand === "degraded" ? "degraded" : "success";
            queueAgentRunIncrement({
              agentKey: step.agent,
              agentName: step.agent,
              status: stepStatus,
              validationScore: mergedScore,
              durationMs: Date.now() - stepStart,
            });
            attemptQueued = true;

            const stepLog = {
              stepNumber: step.stepNumber,
              agent: step.agent,
              status: scoreBand === "degraded" ? "DEGRADED" : "SUCCESS",
              duration: Date.now() - stepStart,
              executionPlan,
              validation: {
                score: mergedScore,
                reason: mergedReason,
                issues: mergedIssues,
                scoreBand,
                degraded: scoreBand === "degraded",
                trusted: scoreBand === "trusted",
              },
            };

            console.log(`      ✅ Success (validation: ${mergedScore}/100, band: ${scoreBand})`);
            if (scoreBand === "degraded") {
              console.warn(`      ⚠️  Output accepted but marked degraded: ${step.agent}`);
            }
            return { success: true, log: stepLog, output };
          }

          const retryReason = pass
            ? `Validation score ${mergedScore} below retry threshold`
            : `Validation failed: ${mergedReason}`;
          queueAgentRunIncrement({
            agentKey: step.agent,
            agentName: step.agent,
            status: "failed",
            validationScore: mergedScore,
            durationMs: Date.now() - stepStart,
          });
          attemptQueued = true;
          lastError = new Error(retryReason);
          attempts++;
          console.warn(`      ⚠️  Validation issue: ${retryReason}`);

          if (attempts < maxRetries) {
            const recoveryDecision = await policyEngine.decide("stepRecovery", {
              step,
              attempt: attempts,
              maxRetries,
              stepInput,
              memoryInsights: context?.memoryInsights || {},
              validation: {
                pass,
                score: mergedScore,
                reason: mergedReason,
                issues: mergedIssues,
                scoreBand,
              },
              output,
              error: lastError,
            });

            console.log("      [ORCH][STEP-RECOVERY] Decision", {
              agent: step.agent,
              action: recoveryDecision?.action,
              backoffMs: recoveryDecision?.backoffMs || step.retryPolicy?.backoffMs || 1000,
              hasInputPatch: Boolean(recoveryDecision?.inputPatch),
              attempt: attempts,
              maxRetries,
            });

            if (recoveryDecision.action === "fail") {
              throw lastError;
            }

            if (recoveryDecision.action === "skip") {
              queueAgentRunIncrement({
                agentKey: step.agent,
                agentName: step.agent,
                status: "skipped",
                validationScore: mergedScore,
                durationMs: Date.now() - stepStart,
              });
              attemptQueued = true;
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

            if (canRetryOnScore) {
              console.warn(`      🔁 Retrying ${step.agent} because score ${mergedScore} is below threshold`);
            }

            await this.sleep(recoveryDecision.backoffMs || step.retryPolicy?.backoffMs || 1000);
          }
        } catch (error) {
          if (!attemptQueued) {
            queueAgentRunIncrement({
              agentKey: step.agent,
              agentName: step.agent,
              status: "failed",
              durationMs: Date.now() - stepStart,
            });
          }
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
      const score = count > 0 ? 90 : 30;
      return {
        pass: count > 0,
        score,
        reason: count > 0 ? "CV skills extracted" : "No CV skills extracted",
        issues: count > 0 ? [] : ["cvSkills is empty"],
        canRecover: true,
        scoreBand: getValidationScoreBand(score),
      };
    }

    if (step.agent === "extract-company-skills") {
      const count = Array.isArray(output.companySkills) ? output.companySkills.length : 0;
      const score = count > 0 ? 90 : 30;
      return {
        pass: count > 0,
        score,
        reason: count > 0 ? "Company skills extracted" : "No company skills extracted",
        issues: count > 0 ? [] : ["companySkills is empty"],
        canRecover: true,
        scoreBand: getValidationScoreBand(score),
      };
    }

    if (step.agent === "analyze-skill-gaps") {
      const hasArray = Array.isArray(output.skillGap);
      const score = hasArray ? 95 : 40;
      return {
        pass: hasArray,
        score,
        reason: hasArray ? "Skill gap analysis available" : "Missing skillGap array",
        issues: hasArray ? [] : ["skillGap missing or invalid"],
        canRecover: true,
        scoreBand: getValidationScoreBand(score),
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

      const score = pass ? 92 : 35;

      return {
        pass,
        score,
        reason: pass ? "Retrieval plan structure is valid" : "Retrieval plan is incomplete or malformed",
        issues,
        canRecover: true,
        scoreBand: getValidationScoreBand(score),
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
        scoreBand: getValidationScoreBand(docs.length > 0 ? 90 : 65),
      };
    }

    if (step.agent === "generate-roadmap") {
      const modules = Array.isArray(output.modules) ? output.modules : [];
      const validModules = modules.filter((m) => m && typeof m === "object").length;
      const prioritizedSkills =
        step?.input?.prioritizedSkills ||
        step?.input?.context?.prioritizedSkills ||
        output?.prioritizedSkills ||
        {};
      const moduleRanks = modules.map((module) => getModulePriorityRank(module, prioritizedSkills));
      const orderingValid = moduleRanks.every((rank, idx) => idx === 0 || rank >= moduleRanks[idx - 1]);
      const topMustHaveSkills = normalizePrioritySkillsList(prioritizedSkills.mustHave);
      const firstModuleSkills = Array.isArray(modules[0]?.skillsCovered) ? modules[0].skillsCovered : [];
      const firstModuleRank = modules.length > 0 ? moduleRanks[0] : 3;
      const mustHaveSatisfied = topMustHaveSkills.length === 0 || firstModuleRank === 0;
      const score = validModules > 0 ? 92 : 20;
      const finalScore = validModules > 0 && orderingValid && mustHaveSatisfied ? score : Math.min(score, 45);
      return {
        pass: validModules > 0 && orderingValid && mustHaveSatisfied,
        score: finalScore,
        reason: validModules > 0
          ? orderingValid && mustHaveSatisfied
            ? "Roadmap modules generated in prioritized order"
            : "Roadmap modules generated but ordering does not prioritize must-have skills"
          : "No roadmap modules generated",
        issues: [
          ...(validModules > 0 ? [] : ["modules array is empty or invalid"]),
          ...(orderingValid ? [] : ["modules are not ordered by skill priority"]),
          ...(mustHaveSatisfied ? [] : ["first module does not cover must-have skills"]),
        ],
        canRecover: true,
        scoreBand: getValidationScoreBand(finalScore),
      };
    }

    if (step.agent === "validate-roadmap") {
      const hasSignal = typeof output.pass === "boolean" && typeof output.score === "number";
      const pass = hasSignal && output.pass === true;
      const hardFails = Array.isArray(output.hardFails) ? output.hardFails : [];
      const score = hasSignal ? Number(output.score) : 30;

      console.log("      [STRICT-VALIDATOR] Decision", {
        hasSignal,
        pass,
        score,
        hardFailCount: hardFails.length,
      });
      if (hardFails.length > 0) {
        console.warn("      [STRICT-VALIDATOR] Hard fails", hardFails);
      }

      return {
        pass,
        score,
        reason: hasSignal
          ? pass
            ? "Strict roadmap validation passed"
            : "Strict roadmap validation failed"
          : "Validation output incomplete",
        issues: hasSignal
          ? (Array.isArray(output.issues) ? output.issues : [])
          : ["validate-roadmap output missing strict pass/score fields"],
        canRecover: !pass || hardFails.length > 0,
        scoreBand: getValidationScoreBand(score),
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
        memoryInsights: context?.memoryInsights || {},
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
        const score = 95;
        return {
          pass: true,
          canRecover: false,
          score,
          scoreBand: getValidationScoreBand(score),
          reason: "Roadmap generation output is present and non-empty",
          suggestions: [],
        };
      }

      const score = 15;
      return {
        pass: false,
        canRecover: true,
        score,
        scoreBand: getValidationScoreBand(score),
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

        const score = Math.round((Number(finalValidation.score || 0) + guardrail.score) / 2);
        const scoreBand = getValidationScoreBand(score);

        return {
          ...finalValidation,
          pass: Boolean(finalValidation.pass) && guardrail.pass && score >= VALIDATION_SCORE_THRESHOLDS.retry,
          score,
          scoreBand,
          degraded: scoreBand === "degraded",
          trusted: scoreBand === "trusted",
          canRecover: score < VALIDATION_SCORE_THRESHOLDS.retry ? true : Boolean(finalValidation.canRecover),
          guardrail,
        };
      }
    } catch {
      // Fallback validation
    }

    return {
      pass: Object.keys(results).length > 0,
      score: 70,
      scoreBand: getValidationScoreBand(70),
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