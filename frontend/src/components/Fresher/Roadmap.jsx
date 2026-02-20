// Roadmap.jsx
/*
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 50% TIME-BASED QUIZ LOCKING SYSTEM DOCUMENTATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Prevents learners from attempting module quizzes prematurely by implementing
 * a time-based locking mechanism. Quiz access is granted only after 50% of the
 * module's estimated duration has elapsed.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * SYSTEM FLOW:
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 1. MODULE START (Day 0)
 *    └─ Module created with FirstTimeCreatedAt timestamp
 *    └─ Quiz is LOCKED 🔒
 *    └─ Learner can access learning materials but not quiz
 * 
 * 2. LEARNING PHASE (0% - 49% of time)
 *    └─ Quiz remains LOCKED 🔒
 *    └─ UI shows countdown: "Quiz will unlock in X days (Y/Z days completed)"
 *    └─ Learner studies module content
 * 
 * 3. QUIZ UNLOCK (50% time threshold met)
 *    └─ Quiz becomes UNLOCKED 🔓
 *    └─ UI shows: "Quiz is now available!"
 *    └─ Learner can attempt quiz at any time
 * 
 * 4. QUIZ COMPLETION
 *    └─ Pass: Module completes, next module unlocks
 *    └─ Fail: AI analyzes and grants dynamic retries (1-3 attempts)
 * 
 * 5. MODULE DEADLINE
 *    └─ If time expires before completion: Module LOCKS permanently
 *    └─ Requires admin intervention
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * CALCULATION EXAMPLES:
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Example 1: 10-day module
 * ├─ Days 0-4: Quiz LOCKED 🔒
 * ├─ Day 5: Quiz UNLOCKS 🔓 (50% = 5 days)
 * └─ Days 5-10: Quiz available, module deadline countdown
 * 
 * Example 2: 6-day module
 * ├─ Days 0-2: Quiz LOCKED 🔒
 * ├─ Day 3: Quiz UNLOCKS 🔓 (50% = 3 days)
 * └─ Days 3-6: Quiz available
 * 
 * Example 3: 15-day module
 * ├─ Days 0-6: Quiz LOCKED 🔒
 * ├─ Day 7: Quiz UNLOCKS 🔓 (50% = 7.5 days, rounds down)
 * └─ Days 7-15: Quiz available
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * KEY FUNCTIONS:
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * checkQuizUnlockBy50Percent(module)
 * └─ Returns: boolean (true = unlocked, false = locked)
 * └─ Calculates: (daysPassed >= estimatedDays / 2)
 * └─ Used by: getUnlockedModules() to determine quiz availability
 * 
 * getQuizUnlockMessageBy50Percent(module)
 * └─ Returns: string (user-friendly countdown message)
 * └─ Examples:
 *    • "Quiz will unlock in 3 day(s) (2/5 days completed)"
 *    • "Quiz is now available!"
 * └─ Used by: UI tooltips and warning messages
 * 
 * getModuleTimeRemaining(module)
 * └─ Returns: object { days, hours, expired, message }
 * └─ Calculates: Total module deadline countdown
 * └─ Different from quiz unlock: tracks full module duration
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * UI COMPONENTS AFFECTED:
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 1. Quiz Button
 *    ├─ Disabled when: !module.quizTimeUnlocked
 *    ├─ Label: "🔒 Quiz Locked" or "📝 Take Quiz"
 *    └─ Tooltip: Shows 50% countdown when locked
 * 
 * 2. Warning Panels
 *    ├─ Yellow panel: Quiz not yet available (< 50%)
 *    └─ Blue panel: Quiz available (≥ 50%)
 * 
 * 3. Module Card
 *    ├─ Time Remaining: Shows overall module deadline
 *    └─ Lock Icon: Shows 🔒 if module expired or locked
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * EDGE CASES HANDLED:
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ✓ No timestamp: Quiz stays locked (safety default)
 * ✓ Completed modules: Quiz always unlocked for review
 * ✓ Module deadline expired: Entire module locks (overrides quiz unlock)
 * ✓ AI-granted retries: Quiz unlocks based on agentic decision
 * ✓ Admin intervention: Module can be manually unlocked
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import axios from "axios";
import { FresherSideMenu } from "./FresherSideMenu";

export default function Roadmap() {
  const { companyId, deptId, userId,companyName } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingModuleId, setLoadingModuleId] = useState(null);
  const [roadmapGeneratedAt, setRoadmapGeneratedAt] = useState(null);
  // 📊 Progress calculation
const completedCount = roadmap.filter((m) => m.completed).length;
const progressPercent = roadmap.length
  ? Math.round((completedCount / roadmap.length) * 100)
  : 0;

const getModuleStartDate = (module) => {
  const fallbackBase = module.FirstTimeCreatedAt || module.createdAt;
  const fallbackDate = fallbackBase
    ? (fallbackBase.toDate ? fallbackBase.toDate() : new Date(fallbackBase))
    : null;

  if (!roadmapGeneratedAt || !roadmap.length || !module.order) return fallbackDate;

  const daysOffset = roadmap
    .filter((m) => (m.order || 0) < (module.order || 0))
    .reduce((sum, m) => sum + (m.estimatedDays || 1), 0);

  return new Date(roadmapGeneratedAt.getTime() + daysOffset * 24 * 60 * 60 * 1000);
};
  // Update overall progress after marking module done
  const updateProgress = async () => {
    try {
      const roadmapRef = collection(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId,
        "roadmap"
      );
      const roadmapSnap = await getDocs(roadmapRef);
      const modules = roadmapSnap.docs.map((doc) => doc.data());

      const totalModules = modules.length;
      const completedModules = modules.filter((m) => m.completed).length;
      const progressPercent = Math.round((completedModules / totalModules) * 100);

      const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
      const payload = { progress: progressPercent };
      if (progressPercent === 100) payload.trainingStatus = "completed";
      await updateDoc(userRef, payload);

      return progressPercent;
    } catch (err) {
      console.error("❌ Error updating progress:", err);
      return 0;
    }
  };

  useEffect(() => {
    if (!companyId || !deptId || !userId) return;

    const loadRoadmap = async () => {
      try {
        const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const generatedAt = userData.roadmapAgentic?.generatedAt || userData.roadmapGeneratedAt;
          if (generatedAt) {
            setRoadmapGeneratedAt(generatedAt.toDate ? generatedAt.toDate() : new Date(generatedAt));
          }
        }

        const roadmapRef = collection(
          db,
          "freshers",
          companyId,
          "departments",
          deptId,
          "users",
          userId,
          "roadmap"
        );

        let roadmapSnap = await getDocs(roadmapRef);

        if (roadmapSnap.empty) {
          // Generate roadmap if it does not exist
          if (!userSnap.exists()) throw new Error("Fresher not found");

          const userData = userSnap.data();
          const expertiseScore = userData.onboarding?.expertise ?? 1;
          const expertiseLevel = userData.onboarding?.level ?? "Beginner";
          const trainingOn = userData.trainingOn ?? "General";
          const trainingDuration = userData.trainingDuration;

          await axios.post("http://localhost:5000/api/roadmap/generate", {
            companyId,
            deptId,
            userId,
            trainingDuration,
            expertiseScore,
            expertiseLevel,
            trainingOn,
          });

          roadmapSnap = await getDocs(roadmapRef);
        }
  const modules = roadmapSnap.docs
  .map((doc) => ({ id: doc.id, ...doc.data() }))
  .sort((a, b) => a.order - b.order);

  setRoadmap(modules);

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadRoadmap();

    // 🔄 Refresh roadmap every 5 seconds to pick up auto-unlocked modules
    const refreshInterval = setInterval(async () => {
      try {
        const roadmapRef = collection(
          db,
          "freshers",
          companyId,
          "departments",
          deptId,
          "users",
          userId,
          "roadmap"
        );
        const roadmapSnap = await getDocs(roadmapRef);
        const modules = roadmapSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => a.order - b.order);
        setRoadmap(modules);
      } catch (err) {
        console.warn("⚠️ Roadmap refresh failed:", err);
      }
    }, 5000);

    return () => clearInterval(refreshInterval);
  }, [companyId, deptId, userId]);

  const markDone = async (moduleId) => {
  try {
    setLoadingModuleId(moduleId);

    const moduleRef = doc(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId,
      "roadmap",
      moduleId
    );

    await updateDoc(moduleRef, {
      completed: true,
      status: "completed",
    });

    // ✅ Update roadmap list only
    setRoadmap((prev) =>
      prev.map((m) =>
        m.id === moduleId
          ? { ...m, completed: true, status: "completed" }
          : m
      )
    );
    // Update overall progress in user doc
    try {
      await updateProgress();
    } catch (err) {
      console.error("❌ Error updating overall progress after markDone:", err);
    }
  } catch (err) {
    console.error("❌ Error marking module done:", err);
  } finally {
    setLoadingModuleId(null);
  }
};
const markInProgress = async (module) => {
  // ❌ Do nothing if already in-progress or completed
  if (module.status === "in-progress" || module.completed) return;

  try {
    const moduleRef = doc(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId,
      "roadmap",
      module.id
    );

    await updateDoc(moduleRef, {
      status: "in-progress",
    });

    // ✅ Update local state
    setRoadmap((prev) =>
      prev.map((m) =>
        m.id === module.id
          ? { ...m, status: "in-progress" }
          : m
      )
    );
  } catch (err) {
    console.error("❌ Error updating module status:", err);
  }
};

const getUnlockedModules = () => {
  let unlockedNext = true;

  return roadmap.map((module) => {
    const unlocked = unlockedNext;
    if (!module.completed) unlockedNext = false;

    // ⏰ 50% TIME-BASED QUIZ LOCKING MECHANISM
    // Quiz unlocks only after 50% of the module's estimated time has passed
    // This ensures learners have adequate preparation time before attempting the quiz
    // Example: For a 10-day module, quiz unlocks after 5 days
    const isQuizUnlocked = checkQuizUnlockBy50Percent(module);
    const quizUnlockMessage = getQuizUnlockMessageBy50Percent(module);
    
    // Calculate module time remaining
    const timeRemaining = getModuleTimeRemaining(module);
    const moduleExpired = isModuleExpired(module);

    return {
      ...module,
      locked: !unlocked || (module.quizLocked && !module.completed) || moduleExpired || module.moduleLocked,
      quizTimeUnlocked: isQuizUnlocked,
      quizUnlockMessage,
      timeRemaining,
      moduleExpired
    };
  });
};

/**
 * 🔒 50% TIME-BASED QUIZ LOCKING MECHANISM
 * 
 * PURPOSE: Prevents learners from attempting quizzes too early, ensuring adequate preparation time
 * 
 * LOGIC:
 * - Quiz remains LOCKED until 50% of the module's estimated time has passed
 * - Example: 10-day module → quiz unlocks after 5 days
 * - Example: 6-day module → quiz unlocks after 3 days
 * 
 * CALCULATION:
 * 1. Get module start date (FirstTimeCreatedAt or createdAt)
 * 2. Calculate days passed since start
 * 3. Compare with 50% of module's estimatedDays
 * 4. Unlock quiz if daysPassed >= (estimatedDays / 2)
 * 
 * EDGE CASES:
 * - Completed modules: Always unlocked
 * - No timestamp: Locked by default (safety measure)
 * - Module deadline expired: Handled by separate locking mechanism
 * 
 * @param {Object} module - Module object with timing data
 * @returns {boolean} - true if quiz should be unlocked, false if locked
 */
const checkQuizUnlockBy50Percent = (module) => {
  // ✅ Completed modules always have quiz access
  if (module.completed) return true;

  const startDate = getModuleStartDate(module);

  // 🚫 Safety check: Lock quiz if no timestamp exists
  if (!startDate) {
    console.warn("⚠️ Module has no FirstTimeCreatedAt or createdAt:", module.id);
    return false; // Lock quiz if no timestamp available
  }
  
  // ⏱️ Calculate time elapsed
  const today = new Date();
  const daysPassed = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
  const totalDays = module.estimatedDays || 1;
  const fiftyPercentDays = totalDays / 2; // 🎯 50% THRESHOLD
  
  console.log(`📊 Quiz Unlock Check - Module: ${module.moduleTitle}, Days: ${daysPassed}/${fiftyPercentDays}, Unlocked: ${daysPassed >= fiftyPercentDays}`);
  
  // 🔓 UNLOCK CONDITION: 50% or more of time has elapsed
  return daysPassed >= fiftyPercentDays;
};

/**
 * 💬 GENERATE USER-FRIENDLY MESSAGE FOR 50% QUIZ LOCK
 * 
 * PURPOSE: Communicate quiz availability status and countdown to learners
 * 
 * MESSAGES:
 * - "Quiz is now available!" → 50% time threshold met
 * - "Quiz will unlock in X day(s)" → Still locked, shows countdown
 * - "Quiz available" → Module completed
 * - "Quiz will unlock soon" → No timestamp available
 * 
 * HELPS LEARNERS:
 * - Understand when they can take the quiz
 * - See their progress toward quiz eligibility
 * - Plan their study schedule accordingly
 * 
 * @param {Object} module - Module object with timing data
 * @returns {string} - Human-readable message about quiz availability
 */
const getQuizUnlockMessageBy50Percent = (module) => {
  // 🚫 Edge case: No timestamp
  if (!getModuleStartDate(module)) return "Quiz will unlock soon";
  
  // ✅ Completed modules
  if (module.completed) return "Quiz available";
  
  // 📅 Parse module start date
  const startDate = getModuleStartDate(module);
  if (!startDate) return "Quiz will unlock soon";
  
  // ⏱️ Calculate time progress
  const today = new Date();
  const daysPassed = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
  const totalDays = module.estimatedDays || 1;
  const fiftyPercentDays = totalDays / 2; // 🎯 50% THRESHOLD
  const daysRemainingUntilQuizUnlock = Math.ceil(fiftyPercentDays - daysPassed);
  
  // 🔓 Quiz unlocked - 50% time has passed
  if (daysPassed >= fiftyPercentDays) {
    return "Quiz is now available!";
  }
  
  // 🔒 Quiz still locked - show countdown and progress
  // Format: "Quiz will unlock in X day(s) (current/required days completed)"
  return `Quiz will unlock in ${daysRemainingUntilQuizUnlock} day(s) (${Math.round(daysPassed)}/${Math.round(fiftyPercentDays)} days completed)`;
};

// Calculate time remaining to complete module
const getModuleTimeRemaining = (module) => {
  if (module.completed) return { days: 0, hours: 0, expired: false, message: "Completed" };

  const startDate = getModuleStartDate(module);

  if (!startDate) {
    return { days: 0, hours: 0, expired: false, message: "No deadline set" };
  }
  
  const totalDays = module.estimatedDays || 1;
  const deadlineDate = new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const timeRemaining = deadlineDate - now;
  
  if (timeRemaining <= 0) {
    return { days: 0, hours: 0, expired: true, message: "Deadline expired" };
  }
  
  const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (daysRemaining > 0) {
    return { days: daysRemaining, hours: hoursRemaining, expired: false, message: `${daysRemaining}d ${hoursRemaining}h remaining` };
  } else {
    return { days: 0, hours: hoursRemaining, expired: false, message: `${hoursRemaining}h remaining` };
  }
};

// Check if module is expired
const isModuleExpired = (module) => {
  const timeInfo = getModuleTimeRemaining(module);
  return timeInfo.expired && !module.completed;
};

  // Navigate to fresher training page
  const viewDetails = (moduleId) => {
    navigate(`/fresher-training/${companyId}/${deptId}/${userId}/${moduleId}`);
  };
  
if (loading)
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">

      {/* ✅ Right content area — loader centered */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00FFFF]" />
          
          <p className="text-lg font-semibold">
            Generating roadmap modules...
          </p>
          
          <p className="text-sm text-[#AFCBE3]">
            Please wait, this may take a few seconds.
          </p>
        </div>
      </div>

    </div>
  );


if (!roadmap.length)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#031C3A] text-white p-8">
      <div className="text-[#00FFFF] mb-4">
        <svg
          className="w-20 h-20 mx-auto animate-bounce"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 17v-6h6v6m2 4H7a2 2 0 01-2-2V7a2 2 0 012-2h5l2 2h5a2 2 0 012 2v10a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <p className="text-lg font-semibold mb-2">No modules found for this fresher</p>
      <p className="text-sm text-[#AFCBE3] mb-4">Roadmap will be generated once onboarding starts.</p>
      <button
        onClick={() => window.location.reload()}
        className="px-5 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold hover:bg-white transition"
      >
        Retry / Refresh
      </button>
    </div>
  );
  const unlockedModules = getUnlockedModules();
  return (
    <div className="min-h-screen bg-[#031C3A] text-white flex">
      {/* Sidebar */}
<div className="w-64 flex-shrink-0 bg-[#021B36]/90">
  <div className="sticky top-0 h-screen p-4 overflow-y-auto">
    <FresherSideMenu
      userId={userId}
      companyId={companyId}
      deptId={deptId}
      companyName={companyName}
      roadmapGenerated={true}
    />
  </div>
</div>


      {/* Modules */}
      <div className="flex-1 p-8 space-y-6">
        <h2 className="text-3xl font-bold text-[#00FFFF] mb-2">Your Personalized Roadmap</h2>
        {roadmapGeneratedAt && (
          <p className="text-sm text-[#AFCBE3] mb-6">
            Roadmap generated on {roadmapGeneratedAt.toLocaleString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit"
            })}
          </p>
        )}
        {/* 📊 Learning Progress */}
<div className="mb-8">
  <div className="flex justify-between text-sm mb-2 text-[#AFCBE3]">
    <span>Learning Progress</span>
    <span>{progressPercent}%</span>
  </div>

  <div className="w-full bg-[#012244] rounded-full h-3">
    <div
      className="bg-[#00FFFF] h-3 rounded-full transition-all duration-500"
      style={{ width: `${progressPercent}%` }}
    />
  </div>
</div>
        {unlockedModules.map((module) => (
<div
  key={module.id}
  className={`relative bg-[#021B36]/80 border border-[#00FFFF30]
  rounded-xl p-6 shadow-md transition
  ${module.completed ? "opacity-60" : ""}
  ${module.locked ? "opacity-40" : ""}`}
>
  {/* Lock icon */}
  {module.locked && (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-4xl z-10 bg-[#021B36]/60 rounded-xl">
      🔒
      {module.moduleExpired && (
        <p className="text-red-400 text-sm mt-2">Module deadline expired</p>
      )}
    </div>
  )}

  {/* Content */}
  <div>
    <h3 className="text-xl font-semibold text-[#00FFFF] mb-2">
      {module.moduleTitle}
    </h3>

    <p className="text-[#AFCBE3] text-sm mb-3">
      {module.description}
    </p>

    <p className="text-xs text-[#AFCBE3] mb-2">
      ⏱ {module.estimatedDays} days
    </p>
    
    {/* Time Remaining Display - Moved below to avoid overlap with status badge */}
    {!module.locked && !module.completed && (
      <div className={`text-sm font-semibold mt-2 ${
        module.timeRemaining.expired ? "text-red-400" : 
        module.timeRemaining.days === 0 ? "text-yellow-400" : 
        "text-[#00FFFF]"
      }`}>
        {module.timeRemaining.expired ? "⏰ EXPIRED" : `⏳ Time Left: ${module.timeRemaining.message}`}
      </div>
    )}
  </div>

  {/* Status Badge */}
  {!module.locked && (
    <>
      <span className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs
        ${module.completed
          ? "bg-green-500/20 text-green-400"
          : "bg-yellow-500/20 text-yellow-400"}`}
      >
        {module.completed ? "Completed" : "In Progress"}
      </span>
      
      
    </>
  )}

  {/* 🔒 50% TIME LOCK WARNING: Quiz not yet available */}
  {/* Displayed when quiz is locked due to insufficient time elapsed (< 50% of module time) */}
  {!module.locked && !module.completed && !module.quizTimeUnlocked && (
    <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <div className="flex items-start gap-2">
        <span className="text-yellow-400 text-xl">⚠️</span>
        <div className="flex-1">
          <p className="text-yellow-400 font-semibold text-sm mb-1">Quiz Not Yet Available</p>
          <p className="text-[#AFCBE3] text-xs">
            {/* Shows countdown until 50% threshold is met */}
            {module.quizUnlockMessage}. You must complete the quiz within the module timeframe ({module.timeRemaining.message}) or the module will be locked.
          </p>
        </div>
      </div>
    </div>
  )}
  
  {/* 🔓 50% TIME LOCK CLEARED: Quiz is now available */}
  {/* Displayed when 50% of module time has elapsed - quiz is unlocked and ready */}
  {!module.locked && !module.completed && module.quizTimeUnlocked && !module.quizPassed && (
    <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
      <div className="flex items-start gap-2">
        <span className="text-blue-400 text-xl">📝</span>
        <div className="flex-1">
          <p className="text-blue-400 font-semibold text-sm mb-1">Quiz Available - Complete Soon!</p>
          <p className="text-[#AFCBE3] text-xs">
            {/* 50% time threshold has been met - learner can now attempt quiz */}
            You can now attempt the quiz. Please complete it within the remaining time ({module.timeRemaining.message}) or the module will be locked.
          </p>
          {module.retriesGranted !== undefined && module.retriesGranted > 0 && (
            <p className="text-[#00FFFF] text-xs mt-1 font-semibold">
              🤖 AI granted you {module.retriesGranted} more {module.retriesGranted === 1 ? 'retry' : 'retries'} based on your performance
            </p>
          )}
          {!module.retriesGranted && (
            <p className="text-[#AFCBE3] text-xs mt-1">
              AI will analyze your performance and decide retry allocation dynamically.
            </p>
          )}
        </div>
      </div>
    </div>
  )}

  {/* Actions */}
  {!module.locked && !module.completed && (
    <div className="flex gap-3 mt-4">
      
      <button
  onClick={async () => {
    await markInProgress(module);

    navigate(`/fresher-training/${companyId}/${deptId}/${userId}`,
      { state: { moduleId: module.id, companyName },} );}}
  className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold"
>Start Learning
</button>
      <button
  onClick={() =>
    navigate(
      `/module-details/${companyId}/${deptId}/${userId}/${module.id}/${companyName}`,
    )
  }
  className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded"
>
  View Details
</button>
      {/* 
        🔒 50% TIME-BASED QUIZ LOCK BUTTON
        
        BUTTON STATES:
        1. 🔒 Quiz Locked (module.quizTimeUnlocked = false)
           - Shown when < 50% of module time has passed
           - Button is disabled and grayed out
           - Hover shows unlock countdown tooltip
        
        2. 📝 Take Quiz (module.quizTimeUnlocked = true, quizAttempts = 0)
           - Shown when ≥ 50% of module time has passed
           - First attempt, quiz is unlocked
           - Button is enabled and clickable
        
        3. 🤖 Retry (module.quizAttempts > 0)
           - Shown after failed attempts
           - AI decides if retry is allowed
           - Shows current attempt number
        
        4. ✅ Quiz Passed (module.quizPassed = true)
           - Quiz successfully completed
           - Button remains for review access
      */}
      <button
        onClick={() =>
          navigate(
            `/quiz/${companyId}/${deptId}/${userId}/${module.id}`,
            { state: { companyName } }
          )
        }
        // DISABLED when: quiz locked OR 50% time not met
        disabled={module.quizLocked || !module.quizTimeUnlocked}
        title={
          !module.quizTimeUnlocked 
            ? module.quizUnlockMessage  // Shows 50% countdown message
            : module.quizAttempts > 0 
              ? `Retry Quiz - AI will analyze and decide retry allocation`
              : "Take Quiz - AI will evaluate and provide feedback"
        }
        className={`px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded relative group
          ${!module.quizTimeUnlocked || module.quizLocked ? "opacity-40 cursor-not-allowed grayscale" : "hover:bg-[#00FFFF]/10"}
        `}
      >
        {/* Button label changes based on 50% unlock status */}
        {!module.quizTimeUnlocked ? "🔒 Quiz Locked" :  // < 50% time
         module.quizPassed ? "✅ Quiz Passed" :
         module.quizAttempts > 0 
           ? `🤖 Retry (Attempt ${module.quizAttempts + 1})` 
           : "📝 Take Quiz"}
        
        {/* 🔒 TOOLTIP: Shown when quiz is locked due to 50% rule */}
        {!module.quizTimeUnlocked && (
          <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-3 hidden group-hover:block w-64 bg-[#021B36] border border-[#00FFFF] rounded-lg p-3 text-sm z-10 whitespace-normal">
            <div className="text-[#00FFFF] font-semibold mb-1">Quiz Locked</div>
            {/* Displays 50% countdown message */}
            <div className="text-[#AFCBE3]">{module.quizUnlockMessage}</div>
            <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-[#00FFFF]"></div>
          </div>
        )}
        
        {/* Tooltip for AI-powered quiz */}
        {module.quizTimeUnlocked && !module.quizLocked && (
          <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-3 hidden group-hover:block w-72 bg-[#021B36] border border-purple-500 rounded-lg p-3 text-sm z-10 whitespace-normal">
            <div className="text-purple-300 font-semibold mb-1 flex items-center gap-2">
              <span>🤖</span> AI-Powered Assessment
            </div>
            <div className="text-[#AFCBE3] text-xs space-y-1">
              <p>• AI analyzes your performance in real-time</p>
              <p>• Dynamically allocates retry attempts (1-3)</p>
              <p>• Provides personalized recommendations</p>
              <p>• Adapts module timeline based on progress</p>
            </div>
            <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-purple-500"></div>
          </div>
        )}
      </button>

    </div>
  )}
</div>

        ))}
    

      </div>
    </div>
  );
}
