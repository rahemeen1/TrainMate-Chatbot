/**
 * ROADMAP CONTROLLER - ORCHESTRATOR VERSION
 * 
 * Simplified controller using Agent Orchestrator pattern
 * All complex workflows handled by orchestrator + agents
 */

import { db } from '../config/firebase.js';
import { parseCvFromUrl } from '../services/cvParser.service.js';
import { orchestrator } from '../services/agentOrchestrator.service.js';
import { initializeAgentRegistry } from '../services/agentRegistry.js';
import { generateRoadmapPDF } from '../services/pdfService.js';
import { handleRoadmapGenerated } from '../services/notificationService.js';
import { buildLearningProfile } from '../services/learningProfileService.js';

// Initialize agents on startup
let agentsInitialized = false;

async function ensureAgentsInitialized() {
  if (!agentsInitialized) {
    initializeAgentRegistry();
    agentsInitialized = true;
  }
}

const ROADMAP_LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * Main roadmap generation endpoint
 * 
 * FLOW:
 * 1. Validate user & fetch prerequisites
 * 2. Parse CV
 * 3. Orchestrate multi-agent workflow:
 *    - Planner: Decide execution plan
 *    - Extractors: Get CV + company skills
 *    - Analyzer: Identify gaps
 *    - Planner: Create retrieval strategy
 *    - Retriever: Fetch company docs
 *    - Generator: Create roadmap
 *    - Validator: Check quality
 * 4. Save roadmap
 * 5. Send notifications
 */
export const generateUserRoadmap = async (req, res) => {
  console.log('🚀 Roadmap Generation Request Received');
  console.log('📦 Request Body:', req.body);

  let lockAcquired = false;

  try {
    // ==================== INITIALIZATION ====================
    await ensureAgentsInitialized();

    const {
      companyId,
      deptId,
      userId,
      trainingTime,
      trainingOn: trainingOnFromClient,
      expertiseScore,
    } = req.body;

    // ==================== STEP 1: VALIDATE & PREREQUISITES ====================
    console.log('\n📋 STEP 1: Validating user...');

    const userRef = db
      .collection('freshers')
      .doc(companyId)
      .collection('departments')
      .doc(deptId)
      .collection('users')
      .doc(userId);

    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      console.error('❌ User not found');
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userSnap.data();
    console.log('✅ User validated:', user.name);

    if (!user.onboarding?.onboardingCompleted || !user.cvUrl) {
      console.warn('⚠️  Onboarding incomplete or CV missing');
      return res.status(400).json({ error: 'Onboarding incomplete' });
    }

    // Check existing roadmap
    const existingRoadmapSnap = await userRef.collection('roadmap').get();
    if (!existingRoadmapSnap.empty) {
      return res.json({
        success: true,
        modules: existingRoadmapSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })),
        reused: true,
      });
    }

    // Acquire generation lock
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return;
      const data = snap.data() || {};
      const lock = data.roadmapGenerationLock || {};
      const now = Date.now();
      const expiresAt = lock.expiresAt?.toDate
        ? lock.expiresAt.toDate().getTime()
        : lock.expiresAt;

      if (expiresAt && expiresAt > now) {
        return;
      }

      tx.set(
        userRef,
        {
          roadmapGenerationLock: {
            startedAt: new Date(now),
            expiresAt: new Date(now + ROADMAP_LOCK_TTL_MS),
          },
        },
        { merge: true }
      );

      lockAcquired = true;
    });

    if (!lockAcquired) {
      return res.status(409).json({
        error: 'Roadmap generation already in progress',
      });
    }

    // Fetch training duration
    const onboardingSnap = await db
      .collection('companies')
      .doc(companyId)
      .collection('onboardingAnswers')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    let trainingDurationFromOnboarding = null;
    if (!onboardingSnap.empty) {
      const data = onboardingSnap.docs[0].data();
      trainingDurationFromOnboarding = data?.answers?.['2'] || data?.answers?.[2];
    }

    const trainingOn = trainingOnFromClient || user.trainingOn || 'General';
    const expertise = expertiseScore ?? user.expertise ?? 1;
    const level = user.trainingLevel || 'Beginner';
    const finalTrainingDuration =
      trainingDurationFromOnboarding || user.trainingDurationFromOnboarding || trainingTime;

    console.log('🎯 CONFIG:', { trainingOn, expertise, level, finalTrainingDuration });

    // ==================== STEP 2: PARSE CV ====================
    console.log('\n📄 STEP 2: Parsing CV...');

    const cvParseResult = await parseCvFromUrl(user.cvUrl);
    const cvText = cvParseResult?.rawText || '';

    if (!cvText || typeof cvText !== 'string' || cvText.trim().length < 50) {
      throw new Error('❌ CV extraction failed or insufficient data');
    }

    console.log('✅ CV parsed:', cvText.length, 'chars');
    const structuredCv = cvParseResult?.structured || null;

    // Build learning profile
    console.log('\n🧩 Building learning profile...');
    const learningProfile = await buildLearningProfile({ userRef });
    console.log('✅ Learning profile loaded');

    // ==================== STEP 3: ORCHESTRATE WORKFLOW ====================
    console.log('\n🤖 STEP 3: Starting Agent Orchestration...');
    console.log('   Goal: Generate personalized learning roadmap');

    const orchestrationResult = await orchestrator.orchestrate(
      'Generate personalized learning roadmap from CV and company requirements',
      {
        // User & company context
        companyId,
        deptId,
        userId,
        cvText,
        expertise,
        trainingOn,
        level,
        trainingDuration: finalTrainingDuration,
        structuredCv,
        learningProfile,

        // Will be populated by agents
        companyDocsText: '', // Retrieved during orchestration
        constraints: {
          maxLatency: 2000,
          costSensitivity: "medium",
          guidance: [
            `Duration: ${finalTrainingDuration}`,
            `Expertise: ${level}`,
            "Max 6 modules recommended",
          ],
        },
      }
    );

    if (!orchestrationResult.success) {
      console.error('🔥 Orchestration failed:', orchestrationResult.error);
      throw new Error(`Orchestration failed: ${orchestrationResult.error}`);
    }

    console.log('✅ Orchestration complete');
    console.log('   Agents used:', orchestrationResult.metadata?.agentsUsed?.length || 0);
    console.log('   Execution time:', orchestrationResult.metadata?.executionTime || 'unknown');
    console.log('   Quality validation:', orchestrationResult.metadata?.validationScore || 'unknown');

    // Extract final roadmap modules
    const roadmapModules = orchestrationResult.finalOutput?.modules || [];

    if (!Array.isArray(roadmapModules) || roadmapModules.length === 0) {
      throw new Error('❌ Orchestration did not generate roadmap modules');
    }

    // ==================== STEP 4: STORE ROADMAP ====================
    console.log('\n💾 STEP 4: Storing roadmap...');

    const roadmapCollection = userRef.collection('roadmap');

    for (let i = 0; i < roadmapModules.length; i++) {
      await roadmapCollection.add({
        ...roadmapModules[i],
        skillsCovered: roadmapModules[i].skillsCovered || [],
        order: i + 1,
        completed: false,
        status: 'pending',
        createdAt: new Date(),
        FirstTimeCreatedAt: new Date(),
      });
    }

    // Update user document with orchestration metadata
    await userRef.set(
      {
        progress: 0,
        roadmapAgentic: {
          orchestrationMetadata: orchestrationResult.metadata,
          agentExplanation: orchestrationResult.explanation,
          executionLog: orchestrationResult.executionLog.slice(-5), // Last 5 log entries
          generatedAt: new Date(),
        },
      },
      { merge: true }
    );

    console.log('✅ Roadmap saved successfully');

    // ==================== STEP 5: SEND NOTIFICATIONS ====================
    console.log('\n📧 STEP 5: Sending notifications...');

    let companyName = 'Your Company';
    try {
      const companyRef = db.collection('companies').doc(companyId);
      const companySnap = await companyRef.get();
      companyName = companySnap.exists
        ? companySnap.data().name || 'Your Company'
        : 'Your Company';
    } catch (err) {
      console.warn('⚠️  Failed to fetch company name:', err.message);
    }

    try {
      const pdfBuffer = await generateRoadmapPDF({
        userName: user.name || 'Trainee',
        companyName: companyName,
        trainingTopic: trainingOn,
        modules: roadmapModules,
      });

      const notificationResult = await handleRoadmapGenerated({
        companyId,
        deptId,
        userId: user.userId,
        userEmail: user.email,
        userName: user.name,
        companyName,
        trainingTopic: trainingOn,
        modules: roadmapModules,
        pdfBuffer,
      });

      if (notificationResult?.calendarEventCreated) {
        console.log(`✅ Notifications scheduled for ${user.email}`);
      } else {
        const reason =
          notificationResult?.calendarError ||
          notificationResult?.calendarDecision?.reason ||
          notificationResult?.decision?.reason ||
          "calendar not attempted";

        if (notificationResult?.calendarAttempted) {
          console.warn(`⚠️  Email sent but calendar failed for ${user.email}: ${reason}`);
        } else {
          console.warn(`ℹ️  Email sent and calendar skipped for ${user.email}: ${reason}`);
        }
      }
    } catch (notificationErr) {
      console.warn('⚠️  Notification failed (non-critical):', notificationErr.message);
    }

    // ==================== RETURN SUCCESS ====================
    console.log('\n🎉 SUCCESS: Roadmap generation complete\n');

    return res.json({
      success: true,
      modules: roadmapModules,
      metadata: {
        agentsUsed: orchestrationResult.metadata.agentsUsed,
        executionTime: orchestrationResult.metadata.executionTime,
        validationScore: orchestrationResult.metadata.validationScore,
        explanation: orchestrationResult.explanation,
      },
    });

  } catch (error) {
    console.error('🔥 ROADMAP GENERATION FAILED:', error.message);
    console.error('Stack:', error.stack);

    return res.status(500).json({
      error: error.message || 'Roadmap generation failed',
      orchestrationLog: orchestrator.getLastExecution()?.executionLog || [],
    });

  } finally {
    // Release lock
    if (lockAcquired) {
      try {
        const { companyId, deptId, userId } = req.body;
        const userRef = db
          .collection('freshers')
          .doc(companyId)
          .collection('departments')
          .doc(deptId)
          .collection('users')
          .doc(userId);

        await userRef.set(
          {
            roadmapGenerationLock: {
              startedAt: null,
              expiresAt: null,
            },
          },
          { merge: true }
        );
      } catch {
        // Silently fail lock release
      }
    }
  }
};

/**
 * Get orchestration execution history for debugging
 */
export const getOrchestrationHistory = async (req, res) => {
  try {
    const history = orchestrator.getExecutionHistory(20);

    return res.json({
      success: true,
      executionCount: history.length,
      history: history.map((h) => ({
        goal: h.goal,
        timestamp: h.timestamp,
        success: !h.error,
        error: h.error || null,
        agentsUsed: h.plan?.steps?.map((s) => s.agent) || [],
        executionTime: h.executionTime,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Get agent registry info
 */
export const getAgentRegistryInfo = async (req, res) => {
  try {
    const agents = Array.from(orchestrator.agents.keys());

    return res.json({
      success: true,
      agentCount: agents.length,
      agents,
      lastExecution: orchestrator.getLastExecution()?.timestamp || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
