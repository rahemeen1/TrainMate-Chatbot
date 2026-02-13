import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractFileText } from "../utils/TextExtractor.js";

console.log("DEBUG: Using API Key ->", process.env.GEMINI_API_KEY);

let cvModel = null;

function initializeCvModel() {
  if (!cvModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    cvModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return cvModel;
}

const CV_MAX_RETRIES = 2;
const MAX_CV_CHARS = 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateText(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function safeParseJson(text) {
  const trimmed = String(text || "").replace(/```json/g, "").replace(/```/g, "").trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) return null;
  const cleanJson = trimmed.substring(jsonStart, jsonEnd + 1);
  try {
    return JSON.parse(cleanJson);
  } catch (err) {
    return null;
  }
}

function redactPii(text) {
  if (!text) return "";
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[REDACTED_PHONE]")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "[REDACTED_DATE]")
    .replace(/\b\d{5,6}\b/g, "[REDACTED_ID]");
}

function validateStructuredCv(structured) {
  if (!structured || typeof structured !== "object") return false;
  const skills = Array.isArray(structured.skills) ? structured.skills.length : 0;
  const roles = Array.isArray(structured.roles) ? structured.roles.length : 0;
  const education = Array.isArray(structured.education) ? structured.education.length : 0;
  return skills + roles + education >= 3;
}

async function generateCvStructure(prompt) {
  const attempts = 3;
  let lastErr;
  const model = initializeCvModel();

  for (let i = 0; i < attempts; i += 1) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      if (status !== 503 || i === attempts - 1) break;
      await sleep(800 * Math.pow(2, i));
    }
  }

  throw lastErr;
}

export const parseCvFromUrl = async (cvUrl) => {
  console.log("[CV] Agentic CV parsing started");
  console.log("[CV] CV URL:", cvUrl);

  try {
    console.log("[CV] Downloading CV file");
    const response = await axios.get(cvUrl, {
      responseType: "arraybuffer",
    });

    const arrayBuffer = response.data;

    let fileType = "pdf";
    if (cvUrl.toLowerCase().endsWith(".docx")) fileType = "docx";
    console.log("[CV] Detected file type:", fileType);

    const rawText = await extractFileText(arrayBuffer, fileType);
    if (!rawText || rawText.trim().length === 0) {
      console.warn("[CV][WARN] Extracted text is empty");
    }

    const redactedText = truncateText(redactPii(rawText), MAX_CV_CHARS);

    let structured = null;
    let lastIssues = [];

    for (let attempt = 0; attempt < CV_MAX_RETRIES; attempt += 1) {
      const prompt = `
You are an expert CV parser. Extract structured information from the redacted CV text.

CV TEXT (REDACTED):
${redactedText}

Return JSON only in this format:
{
  "summary": "string",
  "skills": ["string"],
  "roles": [
    {
      "title": "string",
      "company": "string",
      "duration": "string",
      "highlights": ["string"]
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "year": "string"
    }
  ],
  "certifications": ["string"],
  "projects": ["string"],
  "tools": ["string"]
}

Rules:
- Keep arrays concise and deduplicated
- If a section is missing, return an empty array
- Output valid JSON only
`;

      const result = await generateCvStructure(prompt);
      const text = result?.response?.text()?.trim() || "";
      const parsed = safeParseJson(text);

      if (validateStructuredCv(parsed)) {
        structured = parsed;
        break;
      }

      lastIssues = ["Structured output incomplete"]; 
    }

    if (!structured) {
      structured = {
        summary: "CV parsed but structured extraction incomplete.",
        skills: [],
        roles: [],
        education: [],
        certifications: [],
        projects: [],
        tools: [],
        issues: lastIssues,
      };
    }

    console.log("[CV] CV text extraction successful");
    console.log("[CV] Text length:", rawText?.length || 0);

    return {
      rawText,
      structured,
      redactedText,
    };
  } catch (error) {
    console.error("[CV][ERROR] Failed to parse CV");
    throw error;
  }
};
