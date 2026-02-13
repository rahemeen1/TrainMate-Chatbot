// trainmate-backend/services/memoryService.js
import { db } from "../config/firebase.js";
import admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

let model = null;

function initializeMemoryModel() {
  if (!model) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return model;
}

/**
 * Check if a message is a system status message (not learning content)
 * @param {string} message
 * @returns {boolean}
 */
function isSystemStatusMessage(message) {
  const statusPatterns = [
    /you've completed \d+ (of|out of) \d+ steps/i,
    /let's move on to step \d+/i,
    /ready to dive into/i,
    /welcome back/i,
    /you have \d+ days? remaining/i,
    /module status:/i,
    /progress: \d+%/i,
  ];
  
  return statusPatterns.some(pattern => pattern.test(message));
}

/**
 * Update agent memory after a chat interaction
 * @param {Object} params - Memory update parameters
 */
export async function updateMemoryAfterChat({ 
  userId, 
  companyId, 
  deptId, 
  moduleId, 
  userMessage, 
  botReply 
}) {
  try {
    // Skip memory update if this is just a status message
    if (isSystemStatusMessage(botReply) || userMessage.trim().length < 5) {
      console.log("⏭️  Skipped memory update: system status message");
      return true;
    }

    const memoryRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap")
      .doc(moduleId)
      .collection("agentMemory")
      .doc("summary");

    // Get existing memory
    const memorySnap = await memoryRef.get();
    const existingMemory = memorySnap.exists 
      ? memorySnap.data() 
      : { 
          summary: "No prior interactions.", 
          interactions: [],
          keyTopics: [],
          strugglingAreas: [],
          masteredTopics: [],
          lastUpdated: null
        };

    // Store concise interaction summary instead of full messages
    const newInteraction = {
      userQuery: userMessage.substring(0, 100), // Shortened for storage
      topic: "", // Will be extracted by LLM
      timestamp: new Date(),
    };

    // Keep only last 5 interactions for context (reduced from 10)
    const interactions = [...(existingMemory.interactions || []), newInteraction].slice(-5);

    // Extract key information using LLM for smart summarization
    const extractionPrompt = `
Analyze this learning conversation and extract ONLY learning-related insights. 
IGNORE status updates, greetings, and repetitive progress messages.

EXISTING MEMORY:
${existingMemory.summary}

KEY TOPICS: ${(existingMemory.keyTopics || []).join(", ")}
STRUGGLING AREAS: ${(existingMemory.strugglingAreas || []).join(", ")}
MASTERED TOPICS: ${(existingMemory.masteredTopics || []).join(", ")}

NEW LEARNING INTERACTION:
User Question: ${userMessage}
Learning Content: ${botReply.substring(0, 300)}

Extract ONLY if this is meaningful learning content:
1. Key topics/concepts discussed (technical terms, theories, skills)
2. Areas where user seems confused or asks clarifying questions (struggling)
3. Topics user demonstrates understanding of (mastered)
4. Important learning patterns (NOT progress updates)

Return ONLY JSON:
{
  "keyTopics": ["topic1", "topic2"],
  "strugglingAreas": ["area1"],
  "masteredTopics": ["topic1"],
  "insights": "Brief learning insight (avoid repeating step numbers or progress percentages)"
}
`;

    let extracted;
    try {
      const result = await initializeMemoryModel().generateContent(extractionPrompt);
      const text = result?.response?.text()?.trim() || "{}";
      extracted = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch (err) {
      console.warn("⚠️ Memory extraction failed, using basic update:", err.message);
      extracted = {
        keyTopics: [],
        strugglingAreas: [],
        masteredTopics: [],
        insights: "Continued training conversation."
      };
    }

    // Merge topics intelligently (avoid duplicates, limit to 10 each)
    const keyTopics = [...new Set([
      ...(existingMemory.keyTopics || []),
      ...(extracted.keyTopics || [])
    ])].slice(-10);

    const strugglingAreas = [...new Set([
      ...(existingMemory.strugglingAreas || []),
      ...(extracted.strugglingAreas || [])
    ])].slice(-10);

    const masteredTopics = [...new Set([
      ...(existingMemory.masteredTopics || []),
      ...(extracted.masteredTopics || [])
    ])].slice(-10);

    // Generate concise summary
    const summaryPrompt = `
Create a concise learning memory summary (max 300 characters) based on:

PREVIOUS: ${existingMemory.summary}
NEW INSIGHTS: ${extracted.insights}

KEY TOPICS: ${keyTopics.slice(0, 5).join(", ")}
STRUGGLING: ${strugglingAreas.slice(0, 3).join(", ")}
MASTERED: ${masteredTopics.slice(0, 5).join(", ")}

RULES:
- Focus ONLY on learning topics and concepts
- Do NOT include step numbers, progress percentages, or status updates
- Be specific about technical concepts learned
- Keep it concise and actionable

Generate brief summary:
`;

    let newSummary;
    try {
      const summaryResult = await initializeMemoryModel().generateContent(summaryPrompt);
      newSummary = summaryResult?.response?.text()?.trim().substring(0, 300) || extracted.insights;
      
      // Remove any status phrases that might have slipped through
      newSummary = newSummary
        .replace(/you've completed \d+ (of|out of) \d+ steps/gi, '')
        .replace(/let's move on to step \d+/gi, '')
        .replace(/ready to dive into/gi, '')
        .trim();
    } catch (err) {
      console.warn("⚠️ Summary generation failed:", err.message);
      newSummary = extracted.insights || "Continuing learning journey.";
    }

    // Update memory in Firestore
    await memoryRef.set({
      summary: newSummary,
      interactions: interactions,
      keyTopics: keyTopics,
      strugglingAreas: strugglingAreas,
      masteredTopics: masteredTopics,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      totalInteractions: (existingMemory.totalInteractions || 0) + 1,
    }, { merge: true });

    console.log(`✅ Agent memory updated: ${interactions.length} interactions tracked`);
    return true;

  } catch (err) {
    console.error("❌ Memory update failed:", err.message);
    return false;
  }
}

/**
 * Update agent memory after quiz submission
 * @param {Object} params - Quiz result parameters
 */
export async function updateMemoryAfterQuiz({
  userId,
  companyId,
  deptId,
  moduleId,
  moduleTitle,
  score,
  passed,
  mcqResults,
  oneLinerResults
}) {
  try {
    const memoryRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap")
      .doc(moduleId)
      .collection("agentMemory")
      .doc("summary");

    // Get existing memory
    const memorySnap = await memoryRef.get();
    const existingMemory = memorySnap.exists 
      ? memorySnap.data() 
      : { 
          summary: "No prior interactions.",
          keyTopics: [],
          strugglingAreas: [],
          masteredTopics: [],
          quizAttempts: [],
        };

    // Analyze quiz performance
    const incorrectMcq = mcqResults.filter(q => !q.isCorrect);
    const incorrectOneLiners = oneLinerResults.filter(q => !q.isCorrect);
    
    const weakTopics = [
      ...incorrectMcq.map(q => extractTopicFromQuestion(q.question)),
      ...incorrectOneLiners.map(q => extractTopicFromQuestion(q.question))
    ].filter(Boolean);

    const correctMcq = mcqResults.filter(q => q.isCorrect);
    const correctOneLiners = oneLinerResults.filter(q => q.isCorrect);
    
    const strongTopics = [
      ...correctMcq.map(q => extractTopicFromQuestion(q.question)),
      ...correctOneLiners.map(q => extractTopicFromQuestion(q.question))
    ].filter(Boolean);

    // Add quiz attempt record
    const quizAttempt = {
      moduleTitle,
      score,
      passed,
      weakAreas: weakTopics.slice(0, 5),
      strongAreas: strongTopics.slice(0, 5),
      timestamp: new Date(),
    };

    const quizAttempts = [
      ...(existingMemory.quizAttempts || []),
      quizAttempt
    ].slice(-5); // Keep last 5 attempts

    // Update struggling areas and mastered topics
    const strugglingAreas = [...new Set([
      ...(existingMemory.strugglingAreas || []),
      ...weakTopics
    ])].slice(-15);

    // Remove struggling areas from mastered if they appear in weak areas
    const masteredTopics = [...new Set([
      ...(existingMemory.masteredTopics || []).filter(t => !weakTopics.includes(t)),
      ...strongTopics
    ])].slice(-15);

    // Generate updated summary
    const summaryPrompt = `
Update agent memory summary based on quiz results:

PREVIOUS SUMMARY: ${existingMemory.summary}

MODULE: ${moduleTitle}
SCORE: ${score}%
STATUS: ${passed ? "PASSED" : "FAILED"}

WEAK AREAS: ${weakTopics.slice(0, 5).join(", ") || "None"}
STRONG AREAS: ${strongTopics.slice(0, 5).join(", ") || "None"}

CUMULATIVE STRUGGLING AREAS: ${strugglingAreas.join(", ")}
CUMULATIVE MASTERED TOPICS: ${masteredTopics.join(", ")}

Generate a brief memory summary (max 500 chars) focusing on learning progress and recommendations.
`;

    let newSummary;
    try {
      const summaryResult = await initializeMemoryModel().generateContent(summaryPrompt);
      newSummary = summaryResult?.response?.text()?.trim().substring(0, 500) || 
        `Quiz completed for ${moduleTitle}. Score: ${score}%. ${passed ? "Module passed." : "Needs improvement in: " + weakTopics.slice(0, 3).join(", ")}`;
    } catch (err) {
      console.warn("⚠️ Quiz summary generation failed:", err.message);
      newSummary = `Quiz completed for ${moduleTitle}. Score: ${score}%. ${passed ? "Module passed." : "Review recommended."}`;
    }

    // Update memory in Firestore
    await memoryRef.set({
      summary: newSummary,
      strugglingAreas: strugglingAreas,
      masteredTopics: masteredTopics,
      quizAttempts: quizAttempts,
      lastQuizScore: score,
      lastQuizPassed: passed,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`✅ Agent memory updated after quiz: score=${score}%, passed=${passed}`);
    return true;

  } catch (err) {
    console.error("❌ Memory update after quiz failed:", err.message);
    return false;
  }
}

/**
 * Extract topic keywords from a question using simple heuristics
 * @param {string} question 
 * @returns {string|null}
 */
function extractTopicFromQuestion(question) {
  if (!question || typeof question !== 'string') return null;
  
  // Remove common question words
  const cleaned = question
    .toLowerCase()
    .replace(/what|which|how|when|where|why|who|is|are|does|do|can|should|would/gi, '')
    .trim();
  
  // Extract first meaningful phrase (up to 3 words)
  const words = cleaned.split(/\s+/).filter(w => w.length > 3);
  return words.slice(0, 3).join(' ').substring(0, 50);
}

/**
 * Get current agent memory summary
 * @param {Object} params - Parameters to retrieve memory
 */
export async function getAgentMemory({ userId, companyId, deptId, moduleId }) {
  try {
    const memoryRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap")
      .doc(moduleId)
      .collection("agentMemory")
      .doc("summary");

    const memorySnap = await memoryRef.get();
    
    if (!memorySnap.exists) {
      return {
        summary: "No prior learning history.",
        keyTopics: [],
        strugglingAreas: [],
        masteredTopics: [],
      };
    }

    return memorySnap.data();
  } catch (err) {
    console.error("❌ Failed to retrieve agent memory:", err.message);
    return {
      summary: "No prior learning history.",
      keyTopics: [],
      strugglingAreas: [],
      masteredTopics: [],
    };
  }
}
