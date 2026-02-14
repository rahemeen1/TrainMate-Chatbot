// trainmate-backend/services/codeEvaluator.service.js
import { GoogleGenerativeAI } from "@google/generative-ai";

let evaluatorModel = null;

function initializeEvaluatorModel() {
  if (!evaluatorModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    evaluatorModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return evaluatorModel;
}

/**
 * Evaluates code submission using AI
 * @param {Object} params - Evaluation parameters
 * @param {string} params.question - The coding question
 * @param {string} params.code - User's submitted code
 * @param {string} params.expectedApproach - Expected solution approach
 * @param {string} params.language - Programming language (optional)
 * @returns {Promise<Object>} - Evaluation result with score, feedback, and correctness
 */
export async function evaluateCode({
  question,
  code,
  expectedApproach,
  language = "JavaScript",
}) {
  if (!code || code.trim().length === 0) {
    return {
      isCorrect: false,
      score: 0,
      feedback: "No code submitted.",
      strengths: [],
      improvements: ["Submit a valid solution"],
    };
  }

  const model = initializeEvaluatorModel();

  const prompt = `You are an expert code reviewer evaluating a coding assessment submission.

<b>QUESTION:</b>
${question}

<b>EXPECTED APPROACH:</b>
${expectedApproach}

<b>PROGRAMMING LANGUAGE:</b>
${language}

<b>USER'S CODE:</b>
\`\`\`${language.toLowerCase()}
${code}
\`\`\`

<b>EVALUATION CRITERIA:</b>
1. <b>Correctness</b>: Does the code solve the problem correctly?
2. <b>Logic</b>: Is the algorithmic approach sound?
3. <b>Best Practices</b>: Does it follow coding standards?
4. <b>Efficiency</b>: Is it reasonably optimized?
5. <b>Readability</b>: Is the code clean and well-structured?

<b>SCORING GUIDELINES:</b>
- 90-100: Excellent solution, correct logic, best practices followed
- 70-89: Good solution, mostly correct with minor issues
- 50-69: Partial solution, has significant issues but shows understanding
- 30-49: Incomplete or flawed solution
- 0-29: Does not solve the problem

Return ONLY valid JSON in this format:
{
  "isCorrect": true|false,
  "score": 0-100,
  "feedback": "string (2-3 sentences summary)",
  "strengths": ["string"],
  "improvements": ["string"]
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result?.response?.text()?.trim() || "";
    
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid JSON response from AI");
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    // Validate response structure
    if (
      typeof evaluation.isCorrect !== "boolean" ||
      typeof evaluation.score !== "number" ||
      !evaluation.feedback
    ) {
      throw new Error("Invalid evaluation structure");
    }

    // Ensure arrays
    evaluation.strengths = Array.isArray(evaluation.strengths)
      ? evaluation.strengths
      : [];
    evaluation.improvements = Array.isArray(evaluation.improvements)
      ? evaluation.improvements
      : [];

    console.log(
      `  Code Evaluation - Score: ${evaluation.score}/100, Correct: ${evaluation.isCorrect ? "✓" : "✗"}`
    );

    return evaluation;
  } catch (err) {
    console.error("Code evaluation error:", err.message);

    // Fallback evaluation
    return {
      isCorrect: false,
      score: 40,
      feedback:
        "Automatic evaluation failed. Code will be manually reviewed.",
      strengths: ["Code submitted"],
      improvements: [
        "Ensure code follows the expected approach",
        "Test your solution thoroughly",
      ],
    };
  }
}

/**
 * Batch evaluate multiple code submissions
 * @param {Array} submissions - Array of code submission objects
 * @returns {Promise<Array>} - Array of evaluation results
 */
export async function evaluateCodeBatch(submissions) {
  return Promise.all(
    submissions.map((submission) => evaluateCode(submission))
  );
}
