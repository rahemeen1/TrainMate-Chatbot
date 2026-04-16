const TOXIC_TERMS = [
  "hate",
  "kill",
  "stupid",
  "idiot",
  "racist",
  "sexist",
  "nazi",
  "terror",
];

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "at",
  "is",
  "are",
  "was",
  "were",
  "it",
  "that",
  "this",
  "with",
  "as",
  "be",
  "by",
  "from",
  "your",
  "you",
  "i",
  "we",
]);

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function extractKeywords(text) {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function scoreToxicity(text) {
  const content = normalizeText(text);
  const matched = TOXIC_TERMS.filter((term) => content.includes(term));
  const score = matched.length === 0 ? 100 : Math.max(10, 100 - matched.length * 30);
  return {
    pass: matched.length === 0,
    score,
    details: matched,
  };
}

function scoreRelevance(userMessage, output) {
  const sourceKeywords = new Set(extractKeywords(userMessage));
  if (sourceKeywords.size === 0) {
    return { pass: true, score: 80, overlap: [] };
  }

  const outputKeywords = new Set(extractKeywords(output));
  const overlap = Array.from(sourceKeywords).filter((word) => outputKeywords.has(word));
  const ratio = overlap.length / sourceKeywords.size;
  const score = Math.round(Math.max(0, Math.min(100, ratio * 100)));

  return {
    pass: ratio >= 0.15,
    score,
    overlap,
  };
}

function scoreHallucinationRisk(contextText, output) {
  const contextLength = String(contextText || "").trim().length;
  if (contextLength === 0) {
    return {
      pass: true,
      score: 75,
      reason: "No grounding context provided",
    };
  }

  const contextKeywords = new Set(extractKeywords(contextText));
  const outputKeywords = extractKeywords(output);
  const unsupported = outputKeywords.filter((word) => !contextKeywords.has(word));
  const unsupportedRatio = outputKeywords.length === 0
    ? 0
    : unsupported.length / outputKeywords.length;

  const score = Math.round(Math.max(0, 100 - unsupportedRatio * 100));
  return {
    pass: unsupportedRatio <= 0.85,
    score,
    reason: unsupportedRatio <= 0.85 ? "Grounding looks acceptable" : "High unsupported claim ratio",
  };
}

function scoreFormatCompliance(output, expectedFormat) {
  const normalizedFormat = String(expectedFormat || "text").toLowerCase();

  if (normalizedFormat === "html") {
    const hasHtmlTag = /<[^>]+>/.test(String(output || ""));
    return {
      pass: hasHtmlTag,
      score: hasHtmlTag ? 100 : 40,
      reason: hasHtmlTag ? "HTML tags detected" : "Expected HTML response",
    };
  }

  return {
    pass: true,
    score: 100,
    reason: "No strict format required",
  };
}

export function applyGuardrails({
  output,
  userMessage = "",
  contextText = "",
  expectedFormat = "text",
}) {
  const content = String(output || "").trim();
  if (!content) {
    return {
      pass: false,
      score: 0,
      reason: "Empty output",
      checks: {
        toxicity: { pass: false, score: 0, details: ["empty-output"] },
        relevance: { pass: false, score: 0, overlap: [] },
        hallucination: { pass: false, score: 0, reason: "Empty output" },
        formatCompliance: { pass: false, score: 0, reason: "Empty output" },
      },
    };
  }

  const toxicity = scoreToxicity(content);
  const relevance = scoreRelevance(userMessage, content);
  const hallucination = scoreHallucinationRisk(contextText, content);
  const formatCompliance = scoreFormatCompliance(content, expectedFormat);

  const score = Math.round(
    toxicity.score * 0.35 +
      relevance.score * 0.25 +
      hallucination.score * 0.25 +
      formatCompliance.score * 0.15
  );

  const pass = toxicity.pass && relevance.pass && hallucination.pass && formatCompliance.pass;

  return {
    pass,
    score,
    reason: pass ? "All guardrails passed" : "Guardrail checks failed",
    checks: {
      toxicity,
      relevance,
      hallucination,
      formatCompliance,
    },
  };
}
