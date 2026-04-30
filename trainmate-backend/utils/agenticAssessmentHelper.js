/**
 * Agentic Assessment Helper - No hardcoding, fully LLM-driven context extraction and assessment
 */

function stripHtmlTags(value) {
  return String(value || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonBlock(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0] : null;
}

/**
 * Fully agentic context extraction - uses LLM to analyze conversation, not regex
 */
export async function extractConversationContextAgentically(messages = [], model) {
  try {
    const recent = messages.slice(-15);
    const userMessages = recent.filter(m => m.from === 'user').map(m => stripHtmlTags(m.text || ''));
    const botMessages = recent.filter(m => m.from === 'bot').map(m => stripHtmlTags(m.text || ''));
    const conversationSnippet = recent.map((m, i) => `${m.from}: ${stripHtmlTags(m.text || '').slice(0, 150)}`).join('\n');
    const lastUserMsg = userMessages[userMessages.length - 1] || '';

    // Use LLM to analyze the conversation - no hardcoded patterns
    const analysisPrompt = `Analyze this conversation and extract what the learner is focused on.
Return strict JSON only with these keys:
- topics (array): Specific topics/concepts being discussed, max 5
- conversationIntent (string): What is the learner trying to do (e.g., "understand database design", "fix a bug", "apply a pattern", "get clarification")
- learnerPhase (string): What phase are they in (e.g., "initial learning", "troubleshooting", "applying knowledge", "seeking examples")
- difficulty (string): Should assessment be "easy" or "medium"?
- assessmentFocus (string): What specifically to assess based on this conversation

Conversation:
${conversationSnippet}

Last message: "${lastUserMsg}"

Be specific to THIS conversation, not generic. Return JSON only.`;

    const result = await model.generateContent(analysisPrompt);
    const analysisText = result?.response?.text?.() || '';
    const analysisJson = extractJsonBlock(analysisText);
    const analysis = analysisJson ? JSON.parse(analysisJson) : null;

    if (analysis && analysis.topics && analysis.conversationIntent) {
      return {
        topics: Array.isArray(analysis.topics) ? analysis.topics.slice(0, 5) : [],
        conversationIntent: String(analysis.conversationIntent || '').trim(),
        learnerPhase: String(analysis.learnerPhase || 'learning').trim(),
        suggestedDifficulty: String(analysis.difficulty || 'easy').toLowerCase(),
        assessmentFocus: String(analysis.assessmentFocus || '').trim(),
        lastUserMessage: lastUserMsg,
        conversationLength: messages.length,
      };
    }
    throw new Error('invalid-analysis');
  } catch (err) {
    console.warn('[AGENTIC-CONTEXT] Fallback:', err.message);
    // Minimal fallback without hardcoding
    const lastUserMsg = messages.filter(m => m.from === 'user').slice(-1)[0]?.text || '';
    return {
      topics: [],
      conversationIntent: 'learning',
      learnerPhase: 'general',
      suggestedDifficulty: 'easy',
      assessmentFocus: 'understanding',
      lastUserMessage: stripHtmlTags(lastUserMsg),
      conversationLength: messages.length,
    };
  }
}

/**
 * Agentic assessment generation - fully driven by LLM analysis of context
 */
export async function generateMicroAssessmentAgentically({ objective, moduleTitle, model, conversationHistory = [] }) {
  try {
    // Step 1: Let LLM analyze the conversation context (agentic)
    const context = await extractConversationContextAgentically(conversationHistory, model);

    // Step 2: Let LLM dynamically decide what assessment approach to use (agentic)
    const assessmentStrategyPrompt = `Based on this learner context, determine the best assessment approach:
Topics: ${context.topics.join(", ") || "general topics"}
Intent: ${context.conversationIntent}
Phase: ${context.learnerPhase}
Focus: ${context.assessmentFocus}

Return strict JSON with:
- strategy (string): "recall" (basic understanding), "application" (apply to new scenario), "debugging" (troubleshoot), "elaboration" (explain deeper), or "comparison" (compare concepts)
- assessmentStyle (string): "question" or "scenario"
- expectedComplexity (string): "simple", "moderate", or "complex"

Return JSON only.`;

    const strategyResult = await model.generateContent(assessmentStrategyPrompt);
    const strategyText = strategyResult?.response?.text?.() || '';
    const strategyJson = extractJsonBlock(strategyText);
    const strategy = strategyJson ? JSON.parse(strategyJson) : { strategy: 'recall', assessmentStyle: 'question', expectedComplexity: 'simple' };

    // Step 3: Generate personalized question based on LLM's strategic analysis (agentic)
    const questionPrompt = `Create ONE micro-assessment question for a fresher using this strategy:
Objective: ${objective}
Module: ${moduleTitle}
Learner topics: ${context.topics.join(", ") || "the module"}
Learner intent: ${context.conversationIntent}
Assessment strategy: ${strategy.strategy}
Assessment style: ${strategy.assessmentStyle}
Expected complexity: ${strategy.expectedComplexity}
Last message: "${context.lastUserMessage.slice(0, 150)}"

Guidelines:
- Question must be directly tied to what they just discussed, NOT generic
- Use the selected strategy: ${strategy.strategy} (not just basic recall)
- Match their intent: they want to ${context.conversationIntent}
- Make it relevant to their phase: ${context.learnerPhase}

Return strict JSON with:
- question (string): The question
- expectedPoints (array): 2-3 key points for a good answer
- assessmentType (string): "${strategy.strategy}"
- difficulty (string): "${context.suggestedDifficulty}"

Return JSON only.`;

    const questionResult = await model.generateContent(questionPrompt);
    const questionText = questionResult?.response?.text?.() || '';
    const questionJson = extractJsonBlock(questionText);
    const parsed = questionJson ? JSON.parse(questionJson) : null;

    if (parsed && parsed.question) {
      return {
        question: String(parsed.question).trim(),
        expectedPoints: Array.isArray(parsed.expectedPoints)
          ? parsed.expectedPoints.slice(0, 3).map(p => String(p).trim()).filter(Boolean)
          : [],
        difficulty: String(parsed.difficulty || context.suggestedDifficulty || 'easy').toLowerCase(),
        assessmentType: parsed.assessmentType || strategy.strategy,
        conversationContext: context,
      };
    }
    throw new Error('no-question-generated');
  } catch (error) {
    console.warn('[AGENTIC-ASSESSMENT] Error:', error.message, '- using minimal fallback');
    // Minimal fallback - let LLM generate something safe
    try {
      const fallbackPrompt = `Create a simple check-in question about "${objective}" to see if they're following along. Return JSON with question (string), expectedPoints (array), difficulty (string).`;
      const fallbackResult = await model.generateContent(fallbackPrompt);
      const fallbackText = fallbackResult?.response?.text?.() || '';
      const fallbackJson = extractJsonBlock(fallbackText);
      const fallback = fallbackJson ? JSON.parse(fallbackJson) : null;
      if (fallback && fallback.question) {
        return {
          question: fallback.question,
          expectedPoints: fallback.expectedPoints || [],
          difficulty: 'easy',
          assessmentType: 'recall',
          conversationContext: {},
        };
      }
    } catch (e) {
      // Last resort - no hardcoding, just ask LLM
      console.warn('[AGENTIC-ASSESSMENT] Fallback also failed');
    }
    throw error;
  }
}
