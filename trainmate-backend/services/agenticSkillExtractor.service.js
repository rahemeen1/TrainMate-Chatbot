//trainmate-backend/services/agenticSkillExtractor.service.jsS
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MAX_AGENTIC_TEXT_CHARS = 24000;
const CHUNK_SIZE = 5500;
const CHUNK_OVERLAP = 300;

export const extractSkillsAgentically = async ({
  cvText = "",
  companyDocsText = "",
  expertise = 1,
  trainingOn = "General",
  structuredCv = null,
}) => {
  console.log("\n================ AGENTIC SKILL EXTRACTION START ================");

  try {
    const hasCv = !!cvText && cvText.trim().length >= 50;
    const hasCompanyDocs = !!companyDocsText && companyDocsText.trim().length >= 50;

    if (!hasCv) {
      console.warn("⚠️ CV text is very small or empty");
    }
    if (!hasCompanyDocs) {
      console.warn("⚠️ Company docs text is very small or empty, using agentic topic inference");
    }

    const structuredCvSkills = extractSkillsFromStructuredCv(structuredCv);
    const cvSkillsFromText = hasCv
      ? await extractSkillsFromLongText({
          text: cvText,
          taskName: "CV extraction",
          trainingOn,
          extractionType: "cv",
          expertise,
        })
      : [];

    const cvSkills = normalizeSkills([
      ...structuredCvSkills,
      ...cvSkillsFromText,
      ...(hasCv ? [] : extractFallbackSkills(trainingOn)),
    ]);

    const companySource = hasCompanyDocs ? companyDocsText : buildTopicSource(trainingOn);

    let companySkills = await extractSkillsFromLongText({
      text: companySource,
      taskName: "Company extraction",
      trainingOn,
      extractionType: "company",
      expertise,
    });

    if (!Array.isArray(companySkills) || companySkills.length === 0) {
      companySkills = await inferSkillsFromTopicAgentically(trainingOn, expertise);
    }

    if (!Array.isArray(companySkills) || companySkills.length === 0) {
      companySkills = extractFallbackSkills(companySource);
    }

    if (isTooGenericSkillList(companySkills)) {
      companySkills = buildTopicTemplateSkills(trainingOn);
    }

    const cvSet = new Set(cvSkills.map((skill) => skill.toLowerCase()));
    const skillGap = companySkills.filter((skill) => !cvSet.has(skill.toLowerCase()));
    const criticalGaps = skillGap.slice(0, Math.max(3, Math.ceil(skillGap.length / 3)));

    console.log("✅ CV Skills extracted:", cvSkills);
    console.log("✅ Company Skills extracted:", companySkills);
    console.log("✅ Skill gaps identified:", skillGap);
    console.log("🔴 Critical gaps:", criticalGaps);
    console.log("================ AGENTIC SKILL EXTRACTION END ==================\n");

    return {
      cvSkills,
      companySkills,
      skillGap,
      criticalGaps,
      extractionDetails: {
        cvAnalysis: hasCv ? "Extracted from CV context" : "Derived from available topic context",
        companyAnalysis: hasCompanyDocs ? "Extracted from company documentation" : "Derived from agentic topic inference",
        gapPrioritization: `${criticalGaps.length} critical gaps identified`,
      },
    };
  } catch (error) {
    console.error("🔥 Agentic skill extraction failed:", error.message);
    return buildFallbackResult(trainingOn, "Extraction error");
  }
};

function buildFallbackResult(trainingOn, reason) {
  return {
    cvSkills: ["General Skills"],
    companySkills: [trainingOn],
    skillGap: [trainingOn],
    criticalGaps: [trainingOn],
    extractionDetails: {
      cvAnalysis: reason,
      companyAnalysis: reason,
      gapPrioritization: "Fallback gap analysis",
    },
  };
}

async function extractSkillList(prompt, taskName, fallbackText = "") {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 500,
      temperature: 0.2,
    },
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = await result.response.text();
      const parsed = parseJson(text);
      const jsonSkills = extractSkillsFromParsedResponse(parsed);
      const plainTextSkills = extractSkillsFromUnstructuredText(text);
      const skills = normalizeSkills([...jsonSkills, ...plainTextSkills]);
      if (skills.length > 0) {
        return skills;
      }
      throw new Error("No extractable skills found in response");
    } catch (error) {
      console.warn(`⚠️ ${taskName} attempt ${attempt} failed:`, error.message);
      if (attempt === 2) {
        const fallbackSkills = extractFallbackSkills(fallbackText);
        return fallbackSkills;
      }
    }
  }

  return [];
}

async function extractSkillsFromLongText({
  text = "",
  taskName = "Skill extraction",
  trainingOn = "General",
  extractionType = "cv",
  expertise = 1,
}) {
  const fullText = String(text || "").trim();
  if (!fullText) {
    return [];
  }

  const boundedText = fullText.slice(0, MAX_AGENTIC_TEXT_CHARS);
  const chunks = splitIntoChunks(boundedText, CHUNK_SIZE, CHUNK_OVERLAP);
  const collected = [];
  const scopeInstruction =
    extractionType === "company"
      ? "Extract required/expected capabilities for successful performance in this role or department."
      : "Extract the candidate's present capabilities and demonstrated skills.";

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const prompt = `You are extracting skills for a fresher roadmap generation pipeline.

TASK:
- Extract explicit and implied skills from this text segment.
- ${scopeInstruction}
- Prioritize items listed in sections like Skills, Coursework, Tools, Certifications, Projects, and Experience.
- Keep skill names concise, normalized, and reusable in learning plans.

TOPIC CONTEXT: ${trainingOn}
EXPERTISE LEVEL: ${expertise}/5
SEGMENT ${i + 1} OF ${chunks.length}:
${chunk}

Return ONLY valid JSON:
{
  "skills": ["skill 1", "skill 2"],
  "analysis": "one line"
}`;

    const skills = await extractSkillList(prompt, `${taskName} (chunk ${i + 1}/${chunks.length})`, chunk);
    collected.push(...skills);
  }

  const merged = normalizeSkills(collected);
  if (merged.length > 0) {
    return merged;
  }

  return extractFallbackSkills(boundedText);
}

async function inferSkillsFromTopicAgentically(trainingOn = "General", expertise = 1) {
  const topic = String(trainingOn || "General").trim();

  const prompt = `You are an L&D specialist.

Given only a training topic/department name, infer 10-15 practical skills that a fresher should learn first.

TOPIC: ${topic}
EXPERTISE LEVEL: ${expertise}/5

Rules:
- No role fluff, only concrete skill names.
- Include domain, tooling, process, and communication skills relevant to the topic.
- Keep each skill short and clear.

Return ONLY valid JSON:
{
  "skills": ["skill 1", "skill 2"],
  "analysis": "one line"
}`;

  const inferred = await extractSkillList(prompt, "Company topic inference", topic);
  return normalizeSkills(inferred);
}

function splitIntoChunks(text, chunkSize = 5500, overlap = 300) {
  const value = String(text || "");
  if (!value) return [];
  if (value.length <= chunkSize) return [value];

  const chunks = [];
  let start = 0;

  while (start < value.length) {
    const end = Math.min(value.length, start + chunkSize);
    chunks.push(value.slice(start, end));

    if (end >= value.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

function parseJson(text) {
  const cleaned = String(text || "").replace(/```json/g, "").replace(/```/g, "").trim();
  if (!cleaned) return null;

  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;

  try {
    return JSON.parse(objectMatch[0]);
  } catch {
    return null;
  }
}

function extractSkillsFromUnstructuredText(text) {
  const content = String(text || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  if (!content) return [];

  const jsonArraySkills = extractSkillsArrayFromText(content);
  if (jsonArraySkills.length > 0) {
    return normalizeSkills(jsonArraySkills);
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);

  const candidates = [];
  for (const line of lines) {
    // Skip obviously explanatory prose lines.
    if (line.length > 120) continue;
    if (/^(analysis|reason|summary|notes?)\s*:/i.test(line)) continue;
    candidates.push(...splitSkillCandidates(line));
  }

  return normalizeSkills(candidates);
}

function extractSkillsArrayFromText(text) {
  const value = String(text || "");
  const match = value.match(/"skills"\s*:\s*\[([\s\S]*?)\]/i);
  if (!match) return [];

  return match[1]
    .split(",")
    .map((item) => item.replace(/["'\[\]{}]/g, "").trim())
    .filter(Boolean);
}

function extractSkillsFromStructuredCv(structuredCv) {
  if (!structuredCv || typeof structuredCv !== "object") return [];

  const skills = Array.isArray(structuredCv.skills) ? structuredCv.skills : [];
  const tools = Array.isArray(structuredCv.tools) ? structuredCv.tools : [];
  const certs = Array.isArray(structuredCv.certifications) ? structuredCv.certifications : [];
  const projects = Array.isArray(structuredCv.projects) ? structuredCv.projects : [];

  const seeded = [
    ...skills,
    ...tools,
    ...certs,
    ...projects,
  ].flatMap((item) => splitSkillCandidates(item));

  return normalizeSkills(seeded);
}

function extractSkillsFromParsedResponse(parsed) {
  if (!parsed) return [];

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (item && typeof item === "object") {
        return item.skill || item.name || item.title || item.label || item.skills || [];
      }
      return [];
    });
  }

  if (Array.isArray(parsed.skills)) return parsed.skills;
  if (Array.isArray(parsed.skillGap)) return parsed.skillGap;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.result)) return parsed.result;
  if (Array.isArray(parsed.data?.skills)) return parsed.data.skills;

  return [];
}

function normalizeSkills(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((item) => String(item || "").trim())
    .map((item) => item.replace(/["'`]/g, "").trim())
    .map((item) => item.replace(/^[:\-\s]+|[:\-\s]+$/g, "").trim())
    .filter((item) => item.length > 0 && item.length < 120)
    .filter((item) => !/[{}\[\]]/.test(item))
    .filter((item) => !/^skills?$/i.test(item))
    .filter((item) => !/^analysis$/i.test(item))
    .filter((item) => !/^json$/i.test(item))
    .filter((item) => !/^return$/i.test(item))
    .filter((item, index, self) => self.indexOf(item) === index)
    .slice(0, 50);
}

function extractFallbackSkills(text) {
  const source = String(text || "");
  const fromSkillsSection = extractFromLikelySkillsSection(source);
  const fromLabeledLines = extractFromLabeledSkillLines(source);
  const fromSignalLines = extractFromSkillSignalLines(source);
  const fromRequirementSentences = extractFromRequirementSentences(source);
  const merged = normalizeSkills([
    ...fromSkillsSection,
    ...fromLabeledLines,
    ...fromSignalLines,
    ...fromRequirementSentences,
  ]);

  return merged.length > 0 ? merged : ["General Professional Skills"];
}

function extractFromLikelySkillsSection(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headingPattern = /^(skills?|technical skills?|soft skills?|core competencies|competencies|tools?|technologies|coursework|certifications?)\s*:?-?$/i;
  const sectionItems = [];
  let inSkillsBlock = false;

  for (const line of lines) {
    if (headingPattern.test(line)) {
      inSkillsBlock = true;
      continue;
    }

    if (inSkillsBlock) {
      if (/^[A-Z][A-Za-z\s/&()-]{2,}:?$/.test(line) && !line.startsWith("-") && !line.startsWith("•")) {
        inSkillsBlock = false;
        continue;
      }

      const clean = line.replace(/^[•\-\*]\s*/, "");
      sectionItems.push(...splitSkillCandidates(clean));
    }
  }

  return sectionItems;
}

function extractFromSkillSignalLines(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const signals = [
    /proficient in/i,
    /experience with/i,
    /knowledge of/i,
    /familiar with/i,
    /used\s+/i,
    /worked with/i,
  ];

  const candidates = [];
  for (const line of lines) {
    if (!signals.some((re) => re.test(line))) continue;
    const normalized = line
      .replace(/^(.*?)(proficient in|experience with|knowledge of|familiar with|used|worked with)\s*/i, "")
      .replace(/[.;]$/g, "")
      .trim();
    candidates.push(...splitSkillCandidates(normalized));
  }

  return candidates;
}

function extractFromLabeledSkillLines(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const labelPattern = /^(skills?|technical skills?|soft skills?|core competencies|competencies|tools?|technologies|coursework|certifications?)\s*:\s*(.+)$/i;
  const candidates = [];

  for (const line of lines) {
    const match = line.match(labelPattern);
    if (!match) continue;
    candidates.push(...splitSkillCandidates(match[2]));
  }

  return candidates;
}

function extractFromRequirementSentences(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sentenceSignals = [
    /responsibilities include/i,
    /responsible for/i,
    /key skills include/i,
    /required skills include/i,
    /must have/i,
    /should have/i,
    /including/i,
    /experience in/i,
    /experience with/i,
  ];

  const candidates = [];
  for (const line of lines) {
    if (!sentenceSignals.some((re) => re.test(line))) continue;

    const normalized = line
      .replace(/^(.*?)(responsibilities include|responsible for|key skills include|required skills include|must have|should have|including|experience in|experience with)\s*/i, "")
      .replace(/[.]+$/g, "")
      .trim();

    candidates.push(...splitSkillCandidates(normalized));
  }

  return candidates;
}

function splitSkillCandidates(value) {
  return String(value || "")
    .split(/[,;/|]|\band\b/gi)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 80)
    .filter((part) => !/^\d+$/.test(part));
}

function buildTopicSource(trainingOn) {
  const topic = String(trainingOn || "General");
  return `Department training topic: ${topic}
Role profile: fresher trainee
Expected output: required skills for onboarding success
Source notes: domain knowledge, tools, workflows, compliance, communication, quality standards.`;
}

function isTooGenericSkillList(skills = []) {
  if (!Array.isArray(skills) || skills.length === 0) return true;
  const lowered = skills.map((s) => String(s || "").toLowerCase());
  return lowered.length <= 2 && lowered.every((s) => s.includes("general professional"));
}

function buildTopicTemplateSkills(trainingOn) {
  const topic = String(trainingOn || "General").trim();
  const base = topic || "Domain";

  return normalizeSkills([
    `${base} Fundamentals`,
    `${base} Practical Workflows`,
    `${base} Tools and Systems`,
    `${base} Documentation and Reporting`,
    `${base} Compliance and Quality`,
    `${base} Analysis and Decision Making`,
    "Stakeholder Communication",
    "Problem Solving",
  ]);
}
