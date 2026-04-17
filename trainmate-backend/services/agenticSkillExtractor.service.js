//trainmate-backend/services/agenticSkillExtractor.service.jsS
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { policyEngine } from "./policy/policyEngine.service.js";

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
  mode = "auto",
}) => {
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const logTag = `[SKILL-X:${runId}]`;

  console.log(`\n${logTag} ================ AGENTIC SKILL EXTRACTION START ================`);

  try {
    const hasCv = !!cvText && cvText.trim().length >= 50;
    const hasCompanyDocs = !!companyDocsText && companyDocsText.trim().length >= 50;

    const preStructuredCvSkillsCount = Array.isArray(structuredCv?.skills)
      ? structuredCv.skills.length
      : 0;
    const hasStructuredCvSignal = preStructuredCvSkillsCount > 0;
    const hasAnyCvSignal = hasCv || hasStructuredCvSignal;

    const resolvedMode =
      mode === "auto"
        ? hasAnyCvSignal
          ? (hasCompanyDocs ? "both" : "cv_only")
          : "company_only"
        : mode;

    const shouldRunCv = resolvedMode === "both" || resolvedMode === "cv_only";
    const shouldRunCompany = resolvedMode === "both" || resolvedMode === "company_only";

    console.log(`${logTag} 🧭 Skill extraction mode:`, resolvedMode);

    const cvDecision = shouldRunCv
      ? await policyEngine.decide("skillExtraction", {
          source: "cv",
          trainingOn,
          cvTextLength: String(cvText || "").trim().length,
          structuredCvSkillsCount: preStructuredCvSkillsCount,
        })
      : null;

    const companyDecision = shouldRunCompany
      ? await policyEngine.decide("skillExtraction", {
          source: "company",
          trainingOn,
          companyDocsLength: String(companyDocsText || "").trim().length,
        })
      : null;

    if (cvDecision) {
      console.log(`${logTag} 🧠 CV extraction decision:`, cvDecision?.strategy || "unknown");
    }
    if (companyDecision) {
      console.log(`${logTag} 🧠 Company extraction decision:`, companyDecision?.strategy || "unknown");
    }

    if (shouldRunCv && !hasCv && !hasStructuredCvSignal) {
      console.warn(`${logTag} ⚠️ CV text is very small or empty`);
    }
    if (shouldRunCompany && !hasCompanyDocs) {
      console.warn(`${logTag} ⚠️ Company docs text is very small or empty, using agentic topic inference`);
    }

    const structuredCvSkills = shouldRunCv && cvDecision?.useStructuredCv
      ? extractSkillsFromStructuredCv(structuredCv)
      : [];

    const cvSkillsFromText = shouldRunCv && cvDecision?.useTextExtraction && hasCv
      ? await extractSkillsFromLongText({
          text: cvText,
          taskName: "CV extraction",
          trainingOn,
          extractionType: "cv",
          expertise,
        })
      : [];

    const cvSkillsRaw = normalizeSkills([
      ...structuredCvSkills,
      ...cvSkillsFromText,
      ...((shouldRunCv && (cvDecision?.strategy === "fallback_only" || (!hasCv && !hasStructuredCvSignal)))
        ? extractFallbackSkills(trainingOn, { strict: true })
        : []),
    ]);

    const companySource = hasCompanyDocs ? companyDocsText : "";

    let companySkills = [];

    if (shouldRunCompany && companyDecision?.strategy === "company_docs" && hasCompanyDocs) {
      companySkills = await extractSkillsFromLongText({
        text: companySource,
        taskName: "Company extraction",
        trainingOn,
        extractionType: "company",
        expertise,
      });
    }

    if (
      shouldRunCompany &&
      (companyDecision?.useTopicInference || companySkills.length === 0) &&
      !hasCompanyDocs
    ) {
      companySkills = await inferSkillsFromTopicAgentically(trainingOn, expertise);
    }

    if (shouldRunCompany && (!Array.isArray(companySkills) || companySkills.length === 0)) {
      companySkills = extractFallbackSkills(trainingOn, { strict: true });
    }
    if (shouldRunCompany && isTooGenericSkillList(companySkills)) {
      companySkills = buildTopicTemplateSkills(trainingOn);
    }

    const cvSkills = dedupeSkillsSemantically(cvSkillsRaw);
    const companySkillsFinal = dedupeSkillsSemantically(companySkills);

    const cvFreshness = estimateCvFreshness(cvText, structuredCv);
    const cvSkillProfiles = buildSkillProfiles(cvSkillsRaw, {
      sourceType: "cv",
      strategy: cvDecision?.strategy || "unknown",
      hasPrimarySource: hasCv,
      trainingOn,
      freshness: cvFreshness,
    });

    const companySkillProfiles = buildSkillProfiles(companySkillsFinal, {
      sourceType: "company",
      strategy: companyDecision?.strategy || "unknown",
      hasPrimarySource: hasCompanyDocs,
      trainingOn,
      freshness: 1,
    });

    const cvSet = new Set(cvSkills.map((skill) => getSemanticSkillKey(skill)));
    const skillGap = companySkillsFinal.filter((skill) => !cvSet.has(getSemanticSkillKey(skill)));
    const criticalGaps = skillGap.slice(0, Math.max(3, Math.ceil(skillGap.length / 3)));

    console.log(`${logTag} ✅ CV Skills extracted:`, cvSkills);
    console.log(`${logTag} ✅ Company Skills extracted:`, companySkillsFinal);
    console.log(`${logTag} ✅ Skill gaps identified:`, skillGap);
    console.log(`${logTag} 🔴 Critical gaps:`, criticalGaps);
    console.log(`${logTag} ================ AGENTIC SKILL EXTRACTION END ==================\n`);

    return {
      cvSkills,
      companySkills: companySkillsFinal,
      skillGap,
      criticalGaps,
      cvSkillProfiles,
      companySkillProfiles,
      extractionDetails: {
        cvAnalysis: hasCv ? "Extracted from CV context" : "Derived from available topic context",
        companyAnalysis: hasCompanyDocs ? "Extracted from company documentation" : "Derived from agentic topic inference",
        gapPrioritization: `${criticalGaps.length} critical gaps identified`,
        cvFreshness,
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
    cvSkillProfiles: [],
    companySkillProfiles: [],
    extractionDetails: {
      cvAnalysis: reason,
      companyAnalysis: reason,
      gapPrioritization: "Fallback gap analysis",
      cvFreshness: 0.5,
    },
  };
}

async function extractSkillList(prompt, taskName) {
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
      if (attempt === 2) return [];
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
    
    // Determine skill extraction context based on training topic
    const isNonTechnical = /accounting|finance|hr|human\s*resources|management|sales|marketing|business/i.test(trainingOn);
    
    let scopeRules = "";
    if (isNonTechnical) {
      scopeRules = `
SKILL EXTRACTION RULES FOR ${trainingOn.toUpperCase()}:
- Extract domain-specific competencies and tools relevant to this department
- Examples for ACCOUNTING: Financial Modeling, Excel, Tax, Audit, Reconciliation, QuickBooks, SAP, Tally, Bookkeeping, GAAP, GST, Balance Sheet
- Examples for HR: Recruitment, HRIS, Payroll, Employee Relations, Training & Development, ATS systems, Compensation, Performance Management, Labor Law
- Examples for SALES: Client Management, CRM, Negotiation, Pipeline Management, Salesforce, Territory Management
- Examples for MARKETING: Digital Marketing, SEO, Social Media, Content Marketing, Analytics, Google Analytics, Marketing Automation, Adobe Creative Suite
- Examples for MANAGEMENT: Project Management, Leadership, Strategic Planning, Risk Management, Agile, Scrum, Jira
- DO NOT extract: department/job titles, company names, or soft skills descriptions
`;
    } else {
      scopeRules = `
SKILL EXTRACTION RULES FOR TECHNICAL ROLES:
- Extract ONLY technical skills: programming languages, frameworks, tools, methodologies, and technologies
- Examples: Python, Java, React, Docker, SQL, Agile, REST APIs, Git, AWS, Kubernetes, Machine Learning, Data Analysis
- DO NOT extract: job titles, company names, project names, certifications, degrees, dates, or soft achievements
`;
    }
    
    const prompt = `You are extracting skills from a CV for a fresher roadmap generation pipeline.

${scopeRules}

GENERAL RULES:
- Extract ONLY professional, reusable skills that belong in a learning roadmap
- Keep skill names concise, normalized, and clearly actionable
- One skill per item (no multi-skill entries)

TOPIC CONTEXT: ${trainingOn}
EXPERTISE LEVEL: ${expertise}/5
SEGMENT ${i + 1} OF ${chunks.length}:
${chunk}

Return ONLY valid JSON:
{
  "skills": ["skill 1", "skill 2"],
  "analysis": "one line"
}`;

    const skills = await extractSkillList(prompt, `${taskName} (chunk ${i + 1}/${chunks.length})`);
    collected.push(...skills);
  }

  const merged = normalizeSkills(collected);
  if (merged.length > 0) {
    return merged;
  }

  // Use a stricter fallback only for CV parsing to reduce noisy sentence-like outputs.
  if (extractionType === "cv") {
    return extractFallbackSkills(boundedText, { strict: true });
  }

  return [];
}

async function inferSkillsFromTopicAgentically(trainingOn = "General", expertise = 1) {
  const topic = String(trainingOn || "General").trim();
  
  // Determine domain context
  const isAccounting = /accounting|finance|audit|tax/i.test(topic);
  const isHR = /hr|human\s*resources|recruitment|payroll/i.test(topic);
  const isSales = /sales|business\s*development|account\s*executive/i.test(topic);
  const isMarketing = /marketing|digital\s*marketing|brand/i.test(topic);
  const isManagement = /management|project\s*management|operations/i.test(topic);
  
  let domainContext = "";
  if (isAccounting) {
    domainContext = `Accounting/Finance domain: Include skills like Financial Modeling, Excel Advanced, Tax Knowledge, Audit Processes, GL Accounting, ERP systems (SAP, Tally), Balance Sheet Analysis, GAAP/IFRS, GST Compliance`;
  } else if (isHR) {
    domainContext = `HR domain: Include skills like Recruitment Strategies, HRIS Systems, Payroll Processing, Employee Relations, Training & Development, Compensation & Benefits, Labor Law, Performance Management, ATS Tools`;
  } else if (isSales) {
    domainContext = `Sales domain: Include skills like Client Management, CRM Systems (Salesforce), Sales Pipeline Management, Negotiation, Territory Management, Sales Analytics, Deal Closing, Customer Relationship Building`;
  } else if (isMarketing) {
    domainContext = `Marketing domain: Include skills like Digital Marketing, SEO/SEM, Social Media Management, Analytics (Google Analytics), Content Marketing, Email Marketing, Marketing Automation, Adobe Creative Suite`;
  } else if (isManagement) {
    domainContext = `Management/Operations domain: Include skills like Project Management, Leadership, Strategic Planning, Risk Management, Agile/Scrum, Jira, Process Optimization, Team Management`;
  } else {
    domainContext = `Technical domain: Include programming languages, frameworks, tools, databases, cloud platforms, and development methodologies`;
  }

  const prompt = `You are an L&D specialist with expertise across technical and non-technical domains.

Given a training topic/department name, infer 10-15 practical skills that a fresher should learn first.

TOPIC: ${topic}
EXPERTISE LEVEL: ${expertise}/5
DOMAIN CONTEXT: ${domainContext}

Rules:
- Infer ONLY concrete, actionable skill names (not soft skills or general descriptions)
- Focus on technical tools, systems, processes, and competencies specific to the domain
- Keep each skill short, clear, and relevant to learning roadmaps
- One skill per item
- No role titles or job descriptions

Return ONLY valid JSON:
{
  "skills": ["skill 1", "skill 2"],
  "analysis": "one line"
}`;

  const inferred = await extractSkillList(prompt, "Topic-based skill inference");
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

  // Only extract explicit skills field, ignore tools, certifications, projects
  const skills = Array.isArray(structuredCv.skills) ? structuredCv.skills : [];
  
  // Also extract from tools if present (tools are skills)
  const tools = Array.isArray(structuredCv.tools) ? structuredCv.tools : [];

  const seeded = [
    ...skills,
    ...tools,
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
    .map((item) => cleanSkillToken(item))
    .filter((item) => item.length > 0 && item.length < 120)
    .filter((item) => !/[{}\[\]]/.test(item))
    .filter((item) => !/^skills?$/i.test(item))
    .filter((item) => !/^analysis$/i.test(item))
    .filter((item) => !/^json$/i.test(item))
    .filter((item) => !/^return$/i.test(item))
    .filter((item) => isLikelySkillCandidate(item))
    .filter((item, index, self) => self.indexOf(item) === index)
    .slice(0, 50);
}

function extractFallbackSkills(text, options = {}) {
  const strict = Boolean(options.strict);
  const source = String(text || "");
  const fromSkillsSection = extractFromLikelySkillsSection(source);
  const fromLabeledLines = extractFromLabeledSkillLines(source);
  const fromSignalLines = strict ? [] : extractFromSkillSignalLines(source);
  const fromRequirementSentences = strict ? [] : extractFromRequirementSentences(source);
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
    .map((part) => cleanSkillToken(part))
    .filter((part) => part.length >= 2 && part.length <= 80)
    .filter((part) => !/^\d+$/.test(part))
    .filter((part) => isLikelySkillCandidate(part));
}

function cleanSkillToken(value) {
  return String(value || "")
    .replace(/["'`]/g, "")
    .replace(/^[:\-\s]+|[:\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelySkillCandidate(value) {
  const item = String(value || "").trim();
  if (!item) return false;
  if (item.length > 80) return false;
  if (/\b(education|coursework|experience|project|summary|objective|responsibilities)\b/i.test(item)) return false;
  if (/\b(quick to learn|passionate|adaptable|hands-on experience|senior with)\b/i.test(item)) return false;
  if (/\b(19|20)\d{2}\b/.test(item)) return false;
  if (/\s{2,}/.test(item)) return false;
  if (/[.!?]/.test(item)) return false;
  if (/^[a-z\s]{30,}$/i.test(item) && item.split(" ").length > 5) return false;

  // Allow common short and multi-word domain skills.
  const words = item.split(/\s+/).length;
  if (words > 6) return false;

  return true;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function getSemanticSkillKey(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return "";

  const normalized = raw
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rules = [
    [/\b(ms|microsoft)\s*excel\b|\bexcel\b/, "microsoft excel"],
    [/\bquick\s*books\b|\bquickbooks\b/, "quickbooks"],
    [/\bpower\s*bi\b/, "power bi"],
    [/\btableau\b/, "tableau"],
    [/\bbook\s*keeping\b|\bbookkeeping\b/, "bookkeeping"],
    [/\bfinancial\s*report(ing)?\b/, "financial reporting"],
    [/\bbank\s*recon(ciliation)?\b/, "bank reconciliation"],
    [/\bgaap\b/, "gaap"],
    [/\bifrs\b/, "ifrs"],
    [/\bgst\b/, "gst"],
    [/\bvat\b/, "vat"],
    [/\bhris\b/, "hris"],
    [/\bats\b/, "ats"],
    [/\bobject\s*oriented\s*programming\b|\boop\b/, "oop"],
    [/\bdata\s*structures\s*and\s*algorithms\b|\bdsa\b/, "data structures and algorithms"],
    [/\buser\s*experience\s*design\b|\bux\s*design\b/, "ux design"],
    [/\brest\s*api(s)?\b|\brestful\s*api(s)?\b/, "rest api"],
    [/\bnode\s*js\b/, "node.js"],
    [/\breact\s*js\b|\breact\.js\b|\breact\b/, "react"],
  ];

  for (const [pattern, target] of rules) {
    if (pattern.test(normalized)) return target;
  }

  return normalized;
}

function dedupeSkillsSemantically(skills = []) {
  const map = new Map();

  for (const skill of normalizeSkills(skills)) {
    const key = getSemanticSkillKey(skill);
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, skill);
      continue;
    }

    // Prefer concise but descriptive labels as canonical display.
    if (skill.length < existing.length && skill.length >= 3) {
      map.set(key, skill);
    }
  }

  return Array.from(map.values());
}

function estimateCvFreshness(cvText = "", structuredCv = null) {
  const currentYear = new Date().getFullYear();
  const textYears = String(cvText || "").match(/\b(19|20)\d{2}\b/g) || [];
  const roleDurations = Array.isArray(structuredCv?.roles)
    ? structuredCv.roles.map((r) => String(r?.duration || ""))
    : [];

  const durationYears = roleDurations
    .join(" ")
    .match(/\b(19|20)\d{2}\b/g) || [];

  const allYears = [...textYears, ...durationYears]
    .map((y) => Number(y))
    .filter((y) => Number.isFinite(y) && y >= 1990 && y <= currentYear + 1);

  if (allYears.length === 0) return 0.7;

  const latestYear = Math.max(...allYears);
  const age = currentYear - latestYear;

  if (age <= 1) return 1;
  if (age <= 3) return 0.85;
  if (age <= 5) return 0.7;
  return 0.55;
}

function getConfidenceCalibrationConfig() {
  const read = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    cvSourceTrust: clamp(read("CONF_TRUST_CV", 0.82)),
    companyDocsTrust: clamp(read("CONF_TRUST_COMPANY_DOCS", 0.95)),
    topicInferenceTrust: clamp(read("CONF_TRUST_TOPIC_INFERENCE", 0.62)),
    cvFreshnessInfluence: clamp(read("CONF_CV_FRESHNESS_INFLUENCE", 0.35)),
    cvBaseReliability: clamp(read("CONF_CV_BASE_RELIABILITY", 0.55)),
    fallbackTrust: clamp(read("CONF_TRUST_FALLBACK", 0.58)),
  };
}

function calibrateConfidence({
  rawConfidence = 0,
  sourceType = "unknown",
  strategy = "unknown",
  freshness = 1,
  hasPrimarySource = false,
}) {
  const cfg = getConfidenceCalibrationConfig();
  const raw = clamp(rawConfidence);
  const fresh = clamp(freshness);

  let sourceTrust = cfg.fallbackTrust;
  let reliability = 1;

  if (sourceType === "cv") {
    sourceTrust = cfg.cvSourceTrust;
    reliability = cfg.cvBaseReliability + fresh * cfg.cvFreshnessInfluence;
    if (!hasPrimarySource) {
      reliability *= 0.85;
    }
  } else if (sourceType === "company") {
    if (strategy === "company_docs") {
      sourceTrust = cfg.companyDocsTrust;
      reliability = hasPrimarySource ? 1 : 0.9;
    } else if (strategy === "topic_inference") {
      sourceTrust = cfg.topicInferenceTrust;
      reliability = 0.9;
    } else {
      sourceTrust = cfg.fallbackTrust;
      reliability = 0.92;
    }
  }

  const calibratedConfidence = clamp(raw * sourceTrust * reliability);

  return {
    calibratedConfidence,
    calibrationMeta: {
      sourceTrust: Number(sourceTrust.toFixed(2)),
      reliability: Number(clamp(reliability).toFixed(2)),
      rawConfidence: Number(raw.toFixed(2)),
    },
  };
}

function buildSkillProfiles(skills = [], options = {}) {
  const normalized = normalizeSkills(skills);
  const map = new Map();

  for (const skill of normalized) {
    const key = getSemanticSkillKey(skill);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        canonicalSkill: key,
        skill,
        frequency: 0,
      });
    }

    const item = map.get(key);
    item.frequency += 1;
    if (skill.length < item.skill.length) {
      item.skill = skill;
    }
  }

  const strategy = String(options.strategy || "unknown");
  const sourceType = String(options.sourceType || "unknown");
  const freshness = clamp(options.freshness ?? 0.75);
  const hasPrimarySource = Boolean(options.hasPrimarySource);
  const strategyBase =
    strategy === "hybrid"
      ? 0.78
      : strategy === "single_source"
      ? 0.68
      : strategy === "company_docs"
      ? 0.8
      : strategy === "topic_inference"
      ? 0.58
      : 0.55;

  return Array.from(map.values()).map((item) => {
    const frequencyBoost = Math.min(0.18, item.frequency * 0.06);
    const sourceBoost = hasPrimarySource ? 0.06 : 0;
    const freshnessBoost = sourceType === "cv" ? freshness * 0.12 : 0.08;
    const rawConfidence = clamp(strategyBase + frequencyBoost + sourceBoost + freshnessBoost);
    const explorationWeight = clamp(
      sourceType === "company"
        ? strategy === "topic_inference"
          ? 0.86
          : strategy === "company_docs"
          ? 0.48
          : 0.42
        : sourceType === "cv"
        ? strategy === "hybrid"
          ? 0.46
          : 0.3
        : 0.38
    );
    const { calibratedConfidence, calibrationMeta } = calibrateConfidence({
      rawConfidence,
      sourceType,
      strategy,
      freshness,
      hasPrimarySource,
    });

    return {
      skill: item.skill,
      canonicalSkill: item.canonicalSkill,
      frequency: item.frequency,
      confidence: Number(calibratedConfidence.toFixed(2)),
      rawConfidence: Number(rawConfidence.toFixed(2)),
      calibratedConfidence: Number(calibratedConfidence.toFixed(2)),
      calibrationMeta,
      explorationWeight: Number(explorationWeight.toFixed(2)),
      sourceType,
      strategy,
      freshness: sourceType === "cv" ? Number(freshness.toFixed(2)) : 1,
      conflictSignals: sourceType === "cv" && freshness < 0.7 ? ["cv_recency_risk"] : [],
    };
  });
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
