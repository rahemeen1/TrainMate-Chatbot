// Roadmap.jsx

import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import axios from "axios";
import { FresherSideMenu } from "./FresherSideMenu";
import TrainingLockedScreen from "./TrainingLockedScreen";

export default function Roadmap() {
  const { companyId, deptId, userId,companyName } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingModuleId, setLoadingModuleId] = useState(null);
  const [roadmapGeneratedAt, setRoadmapGeneratedAt] = useState(null);
  const [userData, setUserData] = useState(null);
  const generationRequestedRef = useRef(false);

const getModuleStartDate = (module) => {
  // Prioritize actual start time when module was unlocked/started
  if (module.startedAt) {
    return module.startedAt.toDate ? module.startedAt.toDate() : new Date(module.startedAt);
  }

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

  // Check if quiz should be unlocked (50% of module time has passed)
  const checkQuizTimeUnlock = (module) => {
    if (!module || module.completed) return { isUnlocked: true, remainingTime: null };
    
    const startDate = getModuleStartDate(module);
    if (!startDate) return { isUnlocked: false, remainingTime: "Module not started yet" };
    
    const estimatedDays = module.estimatedDays || 1;
    const unlockTime = new Date(startDate.getTime() + (estimatedDays * 0.5 * 24 * 60 * 60 * 1000));
    const now = new Date();
    
    if (now >= unlockTime) {
      return { isUnlocked: true, remainingTime: null };
    }
    
    // Calculate remaining time
    const remainingMs = unlockTime - now;
    const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const remainingHours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    let remainingTimeStr = "";
    if (remainingDays > 0) {
      remainingTimeStr = `${remainingDays}d ${remainingHours}h`;
    } else {
      remainingTimeStr = `${remainingHours}h`;
    }
    
    return { 
      isUnlocked: false, 
      remainingTime: remainingTimeStr,
      message: `Quiz unlocks in ${remainingTimeStr} (${Math.round(estimatedDays * 0.5)} days required)`
    };
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
          setUserData(userData); // Store userData for training lock check
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
          if (generationRequestedRef.current) {
            setLoading(false);
            return;
          }
          generationRequestedRef.current = true;
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

    // Calculate module time remaining
    const timeRemaining = getModuleTimeRemaining(module);
    const moduleExpired = isModuleExpired(module);
    
    // Check if quiz should be unlocked (50% time requirement)
    const quizUnlockStatus = checkQuizTimeUnlock(module);

    return {
      ...module,
      locked: !unlocked || (module.quizLocked && !module.completed) || moduleExpired || module.moduleLocked,
      quizTimeUnlocked: quizUnlockStatus.isUnlocked,
      quizUnlockMessage: quizUnlockStatus.message || "",
      timeRemaining,
      moduleExpired
    };
  });
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
  if (startDate > now) {
    const msUntilStart = startDate - now;
    const daysUntilStart = Math.floor(msUntilStart / (1000 * 60 * 60 * 24));
    const hoursUntilStart = Math.floor((msUntilStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return {
      days: daysUntilStart,
      hours: hoursUntilStart,
      expired: false,
      message: `Starts in ${daysUntilStart}d ${hoursUntilStart}h`
    };
  }
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

const getDaysLeft = (module) => {
  if (module.completed) return 0;
  const startDate = getModuleStartDate(module);
  const totalDays = module.estimatedDays || 1;
  if (!startDate) return totalDays;
  const now = new Date();
  if (startDate > now) return totalDays;

  const deadlineDate = new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
  const timeRemaining = deadlineDate - now;
  if (timeRemaining <= 0) return 0;
  return Math.max(0, Math.ceil(timeRemaining / (1000 * 60 * 60 * 24)));
};

const getCompletionDays = (module) => {
  if (!module.completed) return null;
  const startDate = getModuleStartDate(module);
  if (!startDate) return null;

  const completionBase = module.completedAt || module.lastQuizSubmitted;
  if (!completionBase) return null;

  const endDate = completionBase.toDate ? completionBase.toDate() : new Date(completionBase);
  const diffMs = endDate - startDate;
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;

  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
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
    <div className="flex min-h-screen bg-[#031C3A] text-white items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00FFFF]" />
        <p className="text-lg font-semibold">Loading roadmap modules...</p>
        <p className="text-sm text-[#AFCBE3]">Please wait, this may take a few seconds.</p>
      </div>
    </div>
  );

// Check if training is locked
if (userData?.trainingLocked) {
  return <TrainingLockedScreen userData={userData} />;
}

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
  <div className="sticky top-0 h-screen p-4 overflow-hidden">
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
    {module.completed && getCompletionDays(module) && (
      <p className="text-xs text-green-400 mb-2">
        ✓ Completed in {getCompletionDays(module)} day{getCompletionDays(module) !== 1 ? "s" : ""}
      </p>
    )}
    
    {/* Time Remaining Display - Moved below to avoid overlap with status badge */}
    {!module.locked && !module.completed && (
      <div className={`text-sm font-semibold mt-2 ${
        module.timeRemaining.expired ? "text-red-400" : 
        module.timeRemaining.days === 0 ? "text-yellow-400" : 
        "text-[#00FFFF]"
      }`}>
        <div>Time Left: {module.timeRemaining.message}</div>
        {module.timeRemaining.expired
          ? "⏰ EXPIRED"
          : module.timeRemaining.message.startsWith("Starts in")
        }
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
              TrainMate granted you {module.retriesGranted} more {module.retriesGranted === 1 ? 'retry' : 'retries'} based on your performance
            </p>
          )}
          {!module.retriesGranted && (
            <p className="text-[#AFCBE3] text-xs mt-1">
              TrainMate will analyze your performance and decide retry allocation dynamically.
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
      {/* Quiz button - disabled if quiz locked or time requirement not met */}
      <button
        onClick={() =>
          navigate(
            `/quiz/${companyId}/${deptId}/${userId}/${module.id}`,
            { state: { companyName } }
          )
        }
        // DISABLED when: quiz locked OR time requirement not met
        disabled={module.quizLocked || !module.quizTimeUnlocked}
        title={
          module.quizLocked
            ? "Quiz locked. Contact admin to unlock."
            : !module.quizTimeUnlocked
              ? `Quiz unlocks after 50% of module time. ${module.quizUnlockMessage || ''}`
            : module.quizAttempts > 0
              ? `Retry Quiz - TrainMate will analyze and decide retry allocation`
              : "Take Quiz - TrainMate will evaluate and provide feedback"
        }
        className={`px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded relative group
          ${module.quizLocked || !module.quizTimeUnlocked ? "opacity-40 cursor-not-allowed grayscale" : "hover:bg-[#00FFFF]/10"}
        `}
      >
        {module.quizLocked ? "🔒 Quiz Locked" :
         !module.quizTimeUnlocked ? "⏳ Quiz Locked (Time)" :
         module.quizPassed ? "✅ Quiz Passed" :
         module.quizAttempts > 0 
           ? ` Retry (Attempt ${module.quizAttempts + 1})` 
           : "📝 Take Quiz"}
        
        {/* Tooltip for AI-powered quiz */}
        {!module.quizLocked && module.quizTimeUnlocked && (
          <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-3 hidden group-hover:block w-72 bg-[#021B36] border border-purple-500 rounded-lg p-3 text-sm z-10 whitespace-normal">
            <div className="text-purple-300 font-semibold mb-1 flex items-center gap-2">
              <span></span> TrainMate-Powered Assessment
            </div>
            <div className="text-[#AFCBE3] text-xs space-y-1">
              <p>• It analyzes your performance in real-time</p>
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
