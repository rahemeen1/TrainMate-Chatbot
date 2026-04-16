import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const extractSkillsAgentically = async ({
  cvText = "",
  companyDocsText = "",
  expertise = 1,
  trainingOn = "General",
}) => {
  console.log("\n================ AGENTIC SKILL EXTRACTION START ================");

  try {
    const hasCv = !!cvText && cvText.trim().length >= 50;
    const hasCompanyDocs = !!companyDocsText && companyDocsText.trim().length >= 50;

    if (!hasCv) {
      console.warn("⚠️ CV text is very small or empty");
    }
    if (!hasCompanyDocs) {
      console.warn("⚠️ Company docs text is very small or empty, using topic defaults");
    }

    const cvSkills = hasCv
      ? await extractSkillList(
          `Extract 10-15 key technical and professional skills from this CV for ${trainingOn}. Return ONLY JSON: {"skills": [...], "analysis": "brief summary"}. CV: ${cvText.slice(0, 1400)}`,
          "CV extraction",
          cvText
        )
      : extractFallbackSkills(trainingOn);

    const companySource = hasCompanyDocs
      ? companyDocsText.slice(0, 1400)
      : buildTopicSource(trainingOn);

    let companySkills = hasCompanyDocs
      ? await extractSkillList(
          `Extract required skills for ${trainingOn}. Return ONLY JSON: {"skills": [...], "analysis": "brief summary"}. Source: ${companySource}`,
          "Company extraction",
          companySource
        )
      : getTopicSkills(trainingOn);

    if (!Array.isArray(companySkills) || companySkills.length === 0) {
      companySkills = getTopicSkills(trainingOn);
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
        companyAnalysis: hasCompanyDocs ? "Extracted from company documentation" : "Derived from topic and industry defaults",
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
      const skills = normalizeSkills(extractSkillsFromParsedResponse(parsed));
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

  return [];
}

function normalizeSkills(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0 && item.length < 120)
    .filter((item, index, self) => self.indexOf(item) === index)
    .slice(0, 50);
}

function extractFallbackSkills(text) {
  const source = String(text || "").toLowerCase();
  const candidates = [
    "python",
    "javascript",
    "typescript",
    "react",
    "node.js",
    "node",
    "langchain",
    "llamaindex",
    "llm",
    "rag",
    "vector database",
    "pinecone",
    "firebase",
    "docker",
    "aws",
    "azure",
    "gcp",
    "fastapi",
    "flask",
    "nlp",
    "prompt engineering",
    "semantic search",
    "machine learning",
    "deep learning",
    "api development",
  ];

  const found = candidates.filter((skill) => source.includes(skill));
  return normalizeSkills(found.length > 0 ? found : ["General Skills"]);
}

function buildTopicSource(trainingOn) {
  const topic = String(trainingOn || "General");
  return `Industry-standard requirements for ${topic}: foundation, tooling, implementation, evaluation, and deployment.`;
}

function getTopicSkills(trainingOn) {
  const topic = String(trainingOn || "").toLowerCase();

  if (topic.includes("rag") || topic.includes("retrieval") || topic.includes("llm")) {
    return normalizeSkills([
      "Python Programming",
      "Large Language Models (LLMs)",
      "Retrieval Augmented Generation (RAG) Architecture",
      "Natural Language Processing (NLP)",
      "Vector Databases",
      "Embedding Models",
      "LangChain",
      "LlamaIndex",
      "Prompt Engineering",
      "Data Preprocessing and Indexing",
      "RAG Evaluation Metrics",
      "Cloud Deployment (AWS/Azure/GCP)",
    ]);
  }

  return normalizeSkills([
    "Domain Fundamentals",
    "Problem Solving",
    "System Design",
    "API Development",
    "Testing and Debugging",
    "Performance Optimization",
  ]);
}
