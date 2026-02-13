// services/gemini.service.js
import fetch from "node-fetch";
import { GEMINI_API_KEY } from "../config/env.js";

export async function generateAccomplishmentText(payload) {
  const {
    moduleTitle,
    status,
    summary,
    strongAreas = [],
    masteredTopics = [], 
    score = 0,
  } = payload;

  const prompt = `
You are an AI training evaluator.

Write a confidence-building accomplishment summary for a fresher.

Rules:
- Mention ONLY what has been achieved so far
- Failed attempts count as learning
- No syllabus or future goals
- Simple professional language
- 3–5 bullet points

Module: ${moduleTitle}
Status: ${status}

Agent Summary:
${summary}

Strong Areas:
${strongAreas.join(", ")}

Mastered Topics:
${masteredTopics.join(", ")}

Quiz Score:
${score}%

Output:
• accomplishment statements only
`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}
