/**
 * LEARNING PROFILE SERVICE
 * 
 * Builds learner profile from historical quiz data and module progress
 * Used by both roadmap generation and module regeneration workflows
 */

/**
 * Build comprehensive learning profile from user's learning history
 * 
 * @param {Object} userRef - Firestore user document reference
 * @param {string} moduleId - Optional specific module to analyze
 * @returns {Promise<Object>} Learning profile with history, weak areas, mastered topics
 */
export async function buildLearningProfile({ userRef, moduleId = null }) {
  try {
    const roadmapSnap = await userRef.collection("roadmap").orderBy("createdAt", "desc").limit(5).get();
    if (roadmapSnap.empty) {
      return { 
        summary: "No prior learning history.", 
        strugglingAreas: [], 
        masteredTopics: [], 
        avgScore: null,
        quizAttempts: [],
        wrongQuestions: [],
        weakConcepts: []
      };
    }

    const memorySnaps = await Promise.all(
      roadmapSnap.docs.map((doc) => doc.ref.collection("agentMemory").doc("summary").get())
    );

    const summaries = [];
    const strugglingAreas = [];
    const masteredTopics = [];
    const scores = [];
    const allQuizAttempts = [];
    const wrongQuestions = [];
    const weakConceptsMap = new Map();

    // Collect memory data
    for (const snap of memorySnaps) {
      if (!snap.exists) continue;
      const data = snap.data() || {};
      if (data.summary) summaries.push(data.summary);
      if (Array.isArray(data.strugglingAreas)) strugglingAreas.push(...data.strugglingAreas);
      if (Array.isArray(data.masteredTopics)) masteredTopics.push(...data.masteredTopics);
      if (Number.isFinite(data.lastQuizScore)) scores.push(data.lastQuizScore);
    }

    // Analyze quiz attempts for weakness patterns
    for (const moduleDoc of roadmapSnap.docs) {
      const quizAttemptsSnap = await moduleDoc.ref
        .collection("quiz")
        .doc("current")
        .collection("quizAttempts")
        .orderBy("attemptNumber", "desc")
        .limit(3)
        .get();

      for (const attemptDoc of quizAttemptsSnap.docs) {
        const attemptData = attemptDoc.data();
        allQuizAttempts.push({
          moduleId: moduleDoc.id,
          moduleTitle: moduleDoc.data().moduleTitle,
          score: attemptData.score,
          attemptNumber: attemptData.attemptNumber,
          submittedAt: attemptData.submittedAt,
        });

        // Analyze results to find wrong questions
        const resultsSnap = await moduleDoc.ref
          .collection("quiz")
          .doc("current")
          .collection("results")
          .doc("latest")
          .get();

        if (resultsSnap.exists) {
          const results = resultsSnap.data();
          
          // Collect wrong MCQ questions
          if (Array.isArray(results.mcq)) {
            results.mcq.forEach(q => {
              if (!q.isCorrect) {
                wrongQuestions.push({
                  type: "MCQ",
                  question: q.question,
                  correctAnswer: q.correctAnswer,
                  moduleTitle: moduleDoc.data().moduleTitle,
                });
                // Extract concepts from wrong questions
                const concepts = extractConceptsFromQuestion(q.question);
                concepts.forEach(concept => {
                  weakConceptsMap.set(concept, (weakConceptsMap.get(concept) || 0) + 1);
                });
              }
            });
          }

          // Collect wrong one-liner questions
          if (Array.isArray(results.oneLiners)) {
            results.oneLiners.forEach(q => {
              if (!q.isCorrect) {
                wrongQuestions.push({
                  type: "One-Liner",
                  question: q.question,
                  correctAnswer: q.correctAnswer,
                  moduleTitle: moduleDoc.data().moduleTitle,
                });
                const concepts = extractConceptsFromQuestion(q.question);
                concepts.forEach(concept => {
                  weakConceptsMap.set(concept, (weakConceptsMap.get(concept) || 0) + 1);
                });
              }
            });
          }

          // Collect failed coding questions
          if (Array.isArray(results.coding)) {
            results.coding.forEach(q => {
              if (!q.isCorrect || (q.score && q.score < 70)) {
                wrongQuestions.push({
                  type: "Coding",
                  question: q.question,
                  feedback: q.feedback,
                  improvements: q.improvements,
                  moduleTitle: moduleDoc.data().moduleTitle,
                });
                const concepts = extractConceptsFromQuestion(q.question);
                concepts.forEach(concept => {
                  weakConceptsMap.set(concept, (weakConceptsMap.get(concept) || 0) + 2); // Weight coding more
                });
              }
            });
          }
        }
      }
    }

    // Sort weak concepts by frequency
    const weakConcepts = Array.from(weakConceptsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([concept, count]) => ({ concept, frequency: count }));

    const uniqueStruggling = Array.from(new Set([...strugglingAreas, ...weakConcepts.map(w => w.concept)])).slice(0, 15);
    const uniqueMastered = Array.from(new Set(masteredTopics)).slice(0, 12);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    return {
      summary: summaries.join(" | ").substring(0, 800) || "No prior learning history.",
      strugglingAreas: uniqueStruggling,
      masteredTopics: uniqueMastered,
      avgScore,
      quizAttempts: allQuizAttempts,
      wrongQuestions: wrongQuestions.slice(0, 20), // Last 20 wrong questions
      weakConcepts: weakConcepts,
      totalAttempts: allQuizAttempts.length,
    };
  } catch (err) {
    console.warn("Failed to build learning profile:", err.message);
    return { 
      summary: "No prior learning history.", 
      strugglingAreas: [], 
      masteredTopics: [], 
      avgScore: null,
      quizAttempts: [],
      wrongQuestions: [],
      weakConcepts: []
    };
  }
}

/**
 * Extract technical concepts from question text
 * Uses pattern matching to identify skills and concepts
 * 
 * @param {string} questionText - The question or text to analyze
 * @returns {Array<string>} List of extracted concepts
 */
export function extractConceptsFromQuestion(questionText) {
  if (!questionText) return [];
  
  // Extract technical terms (capitalized words, camelCase, technical patterns)
  const concepts = [];
  
  // Match capitalized words (like React, JavaScript, API)
  const capitalizedWords = questionText.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g) || [];
  concepts.push(...capitalizedWords);
  
  // Match common technical terms
  const technicalTerms = questionText.match(/\b(function|class|object|array|string|method|property|component|hook|state|props|async|await|promise|callback|API|REST|HTTP|JSON|CSS|HTML|DOM|event|handler|lifecycle|render|virtual|real)\b/gi) || [];
  concepts.push(...technicalTerms);
  
  // Remove duplicates and return lowercase
  return Array.from(new Set(concepts.map(c => c.toLowerCase()))).filter(c => c.length > 2);
}
