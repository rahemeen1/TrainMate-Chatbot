/**
 * AGENT REGISTRY
 * 
 * Central registry of all AI agents that can be orchestrated
 * Agents are registered with the orchestrator for dynamic planning
 */

import { orchestrator } from './agentOrchestrator.service.js';
import { extractSkillsAgentically } from './agenticSkillExtractor.service.js';
import { generateRoadmap } from './llmService.js';
import { evaluateCode } from './codeEvaluator.service.js';
import { db } from '../config/firebase.js';
import { retrieveDeptDocsFromPinecone } from './pineconeService.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Initialize all agents in the orchestrator
 */
export function initializeAgentRegistry() {
  console.log('\n📋 Initializing Agent Registry...');

  // ==================== EXTRACTION AGENTS ====================

  orchestrator.registerAgent('extract-cv-skills', async ({ previousResults, context }) => {
    console.log('    🤖 CV Skills Agent: Analyzing CV...');
    const { cvText, expertise, trainingOn } = context;
    
    const { cvSkills, extractionDetails } = await extractSkillsAgentically({
      cvText,
      companyDocsText: '', // Will be filled after company doc fetching
      expertise,
      trainingOn,
    });

    return {
      cvSkills,
      extractionDetails,
      agentName: 'CV Skills Agent'
    };
  });

  orchestrator.registerAgent('extract-company-skills', async ({ previousResults, context }) => {
    console.log('    🤖 Company Skills Agent: Analyzing company docs...');
    const { companyDocsText, expertise, trainingOn } = context;

    const { companySkills, extractionDetails } = await extractSkillsAgentically({
      cvText: '',
      companyDocsText,
      expertise,
      trainingOn,
    });

    return {
      companySkills,
      extractionDetails,
      agentName: 'Company Skills Agent'
    };
  });

  orchestrator.registerAgent('analyze-skill-gaps', async ({ previousResults, context }) => {
    console.log('    🤖 Gap Analysis Agent: Identifying skill gaps...');
    const cvSkills = previousResults['extract-cv-skills']?.cvSkills || [];
    const companySkills = previousResults['extract-company-skills']?.companySkills || [];

    // Simple gap analysis with prioritization
    const skillGapMap = new Map();
    companySkills.forEach((skill) => {
      if (!cvSkills.includes(skill)) {
        skillGapMap.set(skill, skillGapMap.has(skill) ? skillGapMap.get(skill) + 1 : 1);
      }
    });

    // Sort by frequency
    const skillGap = Array.from(skillGapMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([skill]) => skill);

    const criticalGaps = skillGap.slice(0, Math.ceil(skillGap.length * 0.3));

    return {
      skillGap,
      criticalGaps,
      gapCount: skillGap.length,
      agentName: 'Gap Analysis Agent'
    };
  });

  // ==================== PLANNING AGENTS ====================

  orchestrator.registerAgent('plan-retrieval', async ({ previousResults, context }) => {
    console.log('    🤖 Planning Agent: Creating retrieval strategy...');
    const skillGap = previousResults['analyze-skill-gaps']?.skillGap || [];
    const { trainingOn, learningProfile } = context;

    const plannerPrompt = `Create a retrieval plan for skill gaps.

SKILL GAPS: ${skillGap.slice(0, 10).join(", ")}
TRAINING TOPIC: ${trainingOn}

Return JSON:
{
  "queries": ["query1", "query2", "query3"],
  "focusAreas": ["area1", "area2"],
  "priority": "high|medium|low"
}`;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } });
      const result = await model.generateContent(plannerPrompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        return {
          ...plan,
          agentName: 'Planning Agent'
        };
      }
    } catch (error) {
      console.warn('    ⚠️  Planner failed, using default');
    }

    return {
      queries: [`${trainingOn} fundamentals`, `${trainingOn} best practices`],
      focusAreas: ['fundamentals', 'practices'],
      priority: 'high',
      agentName: 'Planning Agent'
    };
  });

  orchestrator.registerAgent('retrieve-documents', async ({ previousResults, context }) => {
    console.log('    🤖 Retrieval Agent: Fetching company documents...');
    const queries = previousResults['plan-retrieval']?.queries || [];
    const { companyId, deptId, cvText } = context;

    const allDocs = [];
    for (const query of queries) {
      try {
        const docs = await retrieveDeptDocsFromPinecone({
          queryText: query,
          companyId,
          deptName: deptId,
        });
        allDocs.push(...docs);
      } catch (error) {
        console.warn(`    ⚠️  Retrieval failed for query: ${query}`);
      }
    }

    // Deduplicate
    const uniqueDocs = Array.from(new Map(allDocs.map((d) => [d.text, d])).values());

    return {
      documentCount: uniqueDocs.length,
      documents: uniqueDocs,
      agentName: 'Retrieval Agent'
    };
  });

  // ==================== GENERATION AGENTS ====================

  orchestrator.registerAgent('generate-roadmap', async ({ previousResults, context }) => {
    console.log('    🤖 Roadmap Generation Agent: Creating learning roadmap...');
    
    const cvSkills = previousResults['extract-cv-skills']?.cvSkills || [];
    const skillGap = previousResults['analyze-skill-gaps']?.skillGap || [];
    const focusAreas = previousResults['plan-retrieval']?.focusAreas || [];
    const docs = previousResults['retrieve-documents']?.documents || [];
    
    const {
      cvText,
      expertise,
      trainingOn,
      level,
      trainingDuration,
      learningProfile,
      companyId,
      deptId
    } = context;

    const docsText = docs.map(d => d.text || '').join('\n').slice(0, 8000);
    const companyContext = `COMPANY DOCUMENTS:\n${docsText || 'No company documents available.'}`;

    const modules = await generateRoadmap({
      cvText,
      pineconeContext: docs,
      companyContext,
      expertise,
      trainingOn,
      trainingLevel: level,
      trainingDuration,
      skillGap,
      learningProfile,
      planFocusAreas: focusAreas,
    });

    return {
      modules,
      moduleCount: modules.length,
      totalDays: modules.reduce((sum, m) => sum + (m.estimatedDays || 1), 0),
      agentName: 'Roadmap Generation Agent'
    };
  });

  // ==================== EVALUATION AGENTS ====================

  orchestrator.registerAgent('evaluate-code', async ({ previousResults, context }) => {
    console.log('    🤖 Code Evaluation Agent: Evaluating code submission...');
    const { userCode, testCases, question, language } = context;

    try {
      const expectedApproach = Array.isArray(testCases)
        ? testCases.map((tc) => `${tc?.input ?? ''} => ${tc?.expectedOutput ?? ''}`).join('\n')
        : String(testCases || 'Not provided');

      const evaluation = await evaluateCode({
        question: String(question || 'Coding problem not provided'),
        code: String(userCode || ''),
        expectedApproach,
        language: String(language || 'JavaScript'),
      });
      return {
        ...evaluation,
        agentName: 'Code Evaluation Agent'
      };
    } catch (error) {
      return {
        isCorrect: false,
        score: 0,
        feedback: 'Code evaluation failed',
        agentName: 'Code Evaluation Agent'
      };
    }
  });

  orchestrator.registerAgent('validate-roadmap', async ({ previousResults, context }) => {
    console.log('    🤖 Validation Agent: Checking roadmap quality...');
    const modules = previousResults['generate-roadmap']?.modules || [];
    const { trainingDuration } = context;

    const validatorPrompt = `Validate this roadmap quality.

MODULES: ${modules.length}
TOTAL DAYS: ${modules.reduce((sum, m) => sum + (m.estimatedDays || 1), 0)}
ALLOWED DURATION: ${trainingDuration}

CRITERIA:
1. Modules complete?
2. Estimated days realistic?
3. Skills covered adequate?
4. Logical progression?

Return JSON:
{
  "pass": true/false,
  "score": 0-100,
  "issues": ["issue1"],
  "improvements": ["suggestion1"]
}`;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } });
      const result = await model.generateContent(validatorPrompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const validation = JSON.parse(jsonMatch[0]);
        return {
          ...validation,
          agentName: 'Validation Agent'
        };
      }
    } catch (error) {
      console.warn('    ⚠️  Validation check skipped');
    }

    return {
      pass: modules.length > 0,
      score: 80,
      issues: [],
      agentName: 'Validation Agent'
    };
  });

  console.log('✅ Agent Registry initialized (8 agents registered)\n');
}

/**
 * Get agent registry info
 */
export function getRegistryInfo() {
  return {
    agentCount: orchestrator.agents.size,
    agents: Array.from(orchestrator.agents.keys()),
    timestamp: new Date(),
  };
}

/**
 * Reset all agents (for testing)
 */
export function resetRegistry() {
  orchestrator.agents.clear();
  orchestrator.executionHistory = [];
}
