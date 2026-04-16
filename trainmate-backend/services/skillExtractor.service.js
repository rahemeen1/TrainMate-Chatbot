// skillExtractor.js

const MAX_SKILLS = 60;

const SKILL_SECTION_HEADERS = /(\bskills?\b|technical skills|core competencies|expertise|tools|technologies|proficienc(?:y|ies))/i;
const SECTION_STOP_HEADERS = /(education|experience|projects?|certifications?|summary|objective|achievements?|languages|interests?)/i;
const CONTEXT_PATTERNS = [
  /(?:proficient in|experience(?:d)? with|knowledge of|familiar with|hands[-\s]?on(?: experience)? with|worked with|using)\s*[:\-]?\s*([^\n.]+)/gi,
  /(?:skills?|tools|technologies)\s*[:\-]\s*([^\n]+)/gi,
];

const STOP_WORDS = new Set([
  "and", "or", "with", "for", "the", "a", "an", "to", "of", "in", "on", "at", "by",
  "responsible", "experience", "experienced", "knowledge", "familiar", "proficient", "hands-on",
  "strong", "good", "excellent", "ability", "abilities", "communication", "team", "leadership",
  "project", "projects", "management", "role", "roles", "worked", "working", "skills", "skill",
  "tools", "technology", "technologies", "framework", "frameworks", "platform", "platforms",
]);

function normalizeCandidate(raw) {
  return String(raw || "")
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, " ")
    .replace(/^[\s,;:|\-]+|[\s,;:|\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function splitToCandidates(segment) {
  return String(segment || "")
    .split(/[\n,;|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isLikelySkill(candidate) {
  if (!candidate) return false;
  if (candidate.length < 2 || candidate.length > 45) return false;

  const words = candidate.split(" ").filter(Boolean);
  if (words.length > 4) return false;
  if (words.every((w) => STOP_WORDS.has(w))) return false;
  if (STOP_WORDS.has(candidate)) return false;
  if (!/[a-z]/i.test(candidate)) return false;

  return true;
}

function collectFromSkillSections(text, seen) {
  const lines = String(text || "").split(/\r?\n/);
  let inSkillsSection = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      if (inSkillsSection) inSkillsSection = false;
      continue;
    }

    if (SKILL_SECTION_HEADERS.test(line)) {
      inSkillsSection = true;
      const inline = line.split(/[:\-]/).slice(1).join(" ");
      splitToCandidates(inline).forEach((item) => seen.add(normalizeCandidate(item)));
      continue;
    }

    if (inSkillsSection && SECTION_STOP_HEADERS.test(line)) {
      inSkillsSection = false;
      continue;
    }

    if (inSkillsSection) {
      splitToCandidates(line).forEach((item) => seen.add(normalizeCandidate(item)));
    }
  }
}

function collectFromContextPatterns(text, seen) {
  CONTEXT_PATTERNS.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const captured = match[1] || "";
      splitToCandidates(captured).forEach((item) => seen.add(normalizeCandidate(item)));
    }
  });
}

export const extractSkillsFromText = (text) => {
  if (!text || typeof text !== "string" || text.trim() === "") {
    console.warn("[SKILLS][WARN] Empty text received");
    return [];
  }

  console.log("[SKILLS] Skill extraction started");

  const candidates = new Set();
  collectFromSkillSections(text, candidates);
  collectFromContextPatterns(text, candidates);

  const foundSkills = Array.from(candidates)
    .map(normalizeCandidate)
    .filter(isLikelySkill)
    .slice(0, MAX_SKILLS);

  console.log("[SKILLS] Skills detected:", foundSkills);
  return foundSkills;
};
