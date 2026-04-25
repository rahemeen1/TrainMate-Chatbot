// FresherTraining.jsx
import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import FresherShellLayout from "./FresherShellLayout";
import TrainingLockedScreen from "./TrainingLockedScreen";
import { getCompanyLicensePlan } from "../../services/companyLicense";

const sortByModuleOrder = (modules = []) =>
  modules
    .map((module, idx) => ({ module, idx }))
    .sort((a, b) => {
      const aOrder = Number(a.module?.order);
      const bOrder = Number(b.module?.order);
      const aHasOrder = Number.isFinite(aOrder);
      const bHasOrder = Number.isFinite(bOrder);

      if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
      if (aHasOrder && !bHasOrder) return -1;
      if (!aHasOrder && bHasOrder) return 1;
      return a.idx - b.idx;
    })
    .map(({ module }) => module);

export default function FresherTraining() {
  const DEFAULT_QUIZ_UNLOCK_PERCENT = 70;
  const { companyId, deptId, userId } = useParams();
  const location = useLocation(); 
  const navigate = useNavigate();
  const selectedModuleId = location.state?.moduleId || null;
  const companyName = location.state?.companyName || "";


  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState(null);
  const [showQuizConfirm, setShowQuizConfirm] = useState(false);
  const [quizModalType, setQuizModalType] = useState("confirm");
  const [weaknessAnalysis, setWeaknessAnalysis] = useState(null);
  const [showWeaknessBanner, setShowWeaknessBanner] = useState(false);
  const [userData, setUserData] = useState(null);
  const [licensePlan, setLicensePlan] = useState("License Basic");

  // ===============================
  // 🔄 Load Roadmap & Weakness Analysis
  // ===============================
  useEffect(() => {
    if (!companyId || !deptId || !userId) return;

    const loadRoadmap = async () => {
      try {
        const detectedPlan = await getCompanyLicensePlan(companyId);
        setLicensePlan(detectedPlan);

        const userRef = doc(
          db,
          "freshers",
          companyId,
          "departments",
          deptId,
          "users",
          userId
        );
        
        // Fetch weakness analysis if it exists
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          setUserData(userData); // Store userData for training lock check
          if (userData.weaknessAnalysis) {
            setWeaknessAnalysis(userData.weaknessAnalysis);
            setShowWeaknessBanner(true);
            // Auto-hide banner after 10 seconds
            setTimeout(() => setShowWeaknessBanner(false), 10000);
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

        const snap = await getDocs(roadmapRef);
        const modules = sortByModuleOrder(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setRoadmap(modules);

        if (selectedModuleId) {
          setSelectedModule(modules.find((m) => m.id === selectedModuleId));
        }
      } catch (err) {
        console.error("❌ Error loading roadmap:", err);
      } finally {
        setLoading(false);
      }
    };

    loadRoadmap();
  }, [companyId, deptId, userId, selectedModuleId]);

  // ===============================
  // 📊 Progress Calculation
  // ===============================
  const completedCount = roadmap.filter((m) => m.completed).length;
  const progressPercent = roadmap.length
    ? Math.round((completedCount / roadmap.length) * 100)
    : 0;

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
      const snap = await getDocs(roadmapRef);
      const modules = snap.docs.map((d) => d.data());

      const totalModules = modules.length;
      const completedModules = modules.filter((m) => m.completed).length;
      const percent = totalModules ? Math.round((completedModules / totalModules) * 100) : 0;

      const userRef = doc(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId
      );
      const payload = { progress: percent };
      if (percent === 100) payload.trainingStatus = "completed";
      await updateDoc(userRef, payload);
      return percent;
    } catch (err) {
      console.error("❌ Error updating progress:", err);
      return 0;
    }
  };


  /**
   * Calculate time remaining to complete module
   * @param {Object} module - Module object with timing data
   * @returns {Object} - Time remaining info
   */
  const getModuleTimeRemaining = (module) => {
    if (!module) return { days: 0, hours: 0, expired: false, message: "No deadline set" };
    if (module.completed) return { days: 0, hours: 0, expired: false, message: "Completed" };
    
    // Prioritize actual start time when module was unlocked
    let createdAtTimeStamp = module.startedAt || module.FirstTimeCreatedAt || module.createdAt;
    
    if (!createdAtTimeStamp) {
      return { days: 0, hours: 0, expired: false, message: "No deadline set" };
    }
    
    const startDate = createdAtTimeStamp.toDate 
      ? createdAtTimeStamp.toDate() 
      : new Date(createdAtTimeStamp);
    
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

  const moduleTimeRemaining = selectedModule ? getModuleTimeRemaining(selectedModule) : null;

  const getQuizTimeUnlock = (module) => {
    if (!module) {
      return {
        isUnlocked: false,
        unlockPercent: DEFAULT_QUIZ_UNLOCK_PERCENT,
        remainingTime: "No module selected",
        message: "Select a module to continue.",
      };
    }

    const startDateRaw = module.startedAt || module.startDate || module.FirstTimeCreatedAt || module.createdAt;
    const estimatedDays = Number(module.estimatedDays) || 1;
    const configuredUnlockPercent = Number(userData?.quizPolicy?.quizUnlockPercent);
    const unlockPercent = Number.isFinite(configuredUnlockPercent)
      ? Math.max(DEFAULT_QUIZ_UNLOCK_PERCENT, configuredUnlockPercent)
      : DEFAULT_QUIZ_UNLOCK_PERCENT;

    if (!startDateRaw) {
      return {
        isUnlocked: false,
        unlockPercent,
        remainingTime: "Module not started yet",
        message: "Quiz unlocks after module start.",
      };
    }

    const startDate = startDateRaw.toDate ? startDateRaw.toDate() : new Date(startDateRaw);
    const unlockAt = startDate.getTime() + (estimatedDays * (unlockPercent / 100) * 24 * 60 * 60 * 1000);
    const now = Date.now();

    if (now >= unlockAt) {
      return {
        isUnlocked: true,
        unlockPercent,
        remainingTime: null,
        message: "Quiz is now available!",
      };
    }

    const remainingMs = unlockAt - now;
    const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const remainingHours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    let remainingTime = "";
    if (remainingDays > 0) {
      remainingTime = `${remainingDays} day${remainingDays > 1 ? "s" : ""} and ${remainingHours} hour${remainingHours !== 1 ? "s" : ""}`;
    } else if (remainingHours > 0) {
      remainingTime = `${remainingHours} hour${remainingHours !== 1 ? "s" : ""} and ${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`;
    } else {
      remainingTime = `${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`;
    }

    return {
      isUnlocked: false,
      unlockPercent,
      remainingTime,
      message: `Quiz unlocks after ${unlockPercent}% module time. Remaining: ${remainingTime}`,
    };
  };

  const quizUnlockInfo = selectedModule ? getQuizTimeUnlock(selectedModule) : null;
  const isBasicPlan = licensePlan !== "License Pro";

  const markSelectedModuleAsCompleted = async () => {
    if (!selectedModule) return;

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
        selectedModule.id
      );

      await updateDoc(moduleRef, {
        completed: true,
        status: "completed",
        completedAt: new Date(),
      });

      setRoadmap((prev) =>
        prev.map((module) =>
          module.id === selectedModule.id
            ? { ...module, completed: true, status: "completed", completedAt: new Date() }
            : module
        )
      );
      setSelectedModule((prev) =>
        prev ? { ...prev, completed: true, status: "completed", completedAt: new Date() } : prev
      );

      await updateProgress();
    } catch (err) {
      console.error("❌ Error marking module complete for basic plan:", err);
    }
  };

  const handleMarkModuleCompleted = async () => {
    if (isBasicPlan) {
      if (moduleTimeRemaining?.expired) {
        await markSelectedModuleAsCompleted();
        setQuizModalType("basicCompleted");
        setShowQuizConfirm(true);
        return;
      }

      setQuizModalType("basicWait");
      setShowQuizConfirm(true);
      return;
    }

    takeQuiz();
  };

  const takeQuiz = (moduleId) => {
    if (!quizUnlockInfo?.isUnlocked) {
      setQuizModalType("locked");
      setShowQuizConfirm(true);
      return;
    }
    setQuizModalType("confirm");
    setShowQuizConfirm(true); // Show confirmation modal
  };

  const confirmQuiz = () => {
    setShowQuizConfirm(false);
    navigate(`/quiz/${companyId}/${deptId}/${userId}/${selectedModule.id}`, {
      state: { companyName }
    });
  };

  const cancelQuiz = () => {
    setShowQuizConfirm(false);
  };


  // ===============================
  // ⏳ Loading State
  // ===============================
  if (loading) {
    return ( 
      <div className="flex min-h-screen bg-[#031C3A] text-white items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00FFFF]" />
          <p className="text-lg font-semibold">Loading your training...</p>
          <p className="text-sm text-[#AFCBE3]">Please wait, this may take a few seconds.</p>
        </div>
      </div>
    );
  }

  // Check if training is locked
  if (licensePlan === "License Pro" && userData?.trainingLocked) {
    return <TrainingLockedScreen userData={userData} />;
  }

return (
    <FresherShellLayout
      userId={userId}
      companyId={companyId}
      deptId={deptId}
      companyName={companyName}
      roadmapGenerated={true}
      headerLabel="Training"
      contentClassName="p-4 md:p-8 lg:p-10"
    >
      <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-[#00FFFF]">
          Module Details
        </h1>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#00FFFF55] bg-[#031C3A]/70 text-[#00FFFF] transition hover:bg-[#00FFFF1A]"
          aria-label="Back to roadmap"
          title="Back to roadmap"
        >
          ←
        </button>
      </div>

      {/* ===== Weakness Analysis Banner ===== */}
      {showWeaknessBanner && weaknessAnalysis && (
        <div className="bg-red-500/10 border-2 border-red-500 rounded-lg p-6 animate-pulse">
          <div className="flex items-start gap-4">
            <span className="text-3xl">⚠️</span>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-red-400 mb-2">
                Quiz Setback - Let's Refocus
              </h3>
              <p className="text-[#AFCBE3] mb-3">
                You didn't pass the quiz. Your average score was <span className="font-semibold text-red-300">{weaknessAnalysis.avgQuizScore}%</span>. 
                Let's focus on your weak areas and come back stronger.
              </p>
              
              <div className="bg-[#031C3A]/60 rounded-lg p-4 mb-3">
                <p className="text-[#AFCBE3] text-sm font-semibold mb-2">Key Areas to Focus On:</p>
                <ul className="text-[#AFCBE3] text-sm space-y-1 list-disc list-inside">
                  {weaknessAnalysis.strugglingAreas?.map((area, idx) => (
                    <li key={idx} className="text-red-300">{area}</li>
                  ))}
                </ul>
                {Array.isArray(weaknessAnalysis.focusAreas) && weaknessAnalysis.focusAreas.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[#AFCBE3] text-sm font-semibold mb-2">Targeted study plan</p>
                    <ul className="text-[#AFCBE3] text-sm space-y-1 list-disc list-inside">
                      {weaknessAnalysis.focusAreas.map((area, idx) => (
                        <li key={idx} className="text-cyan-200">{area}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(weaknessAnalysis.recommendedActions) && weaknessAnalysis.recommendedActions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[#AFCBE3] text-sm font-semibold mb-2">Recommended next steps</p>
                    <ul className="text-[#AFCBE3] text-sm space-y-1 list-disc list-inside">
                      {weaknessAnalysis.recommendedActions.map((action, idx) => (
                        <li key={idx} className="text-green-300">{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              
              <p className="text-[#AFCBE3] text-sm">
                💡 The chatbot is ready to help you master these concepts. Focus on understanding these areas, then retake the quiz with confidence!
              </p>
            </div>
            <button
              onClick={() => setShowWeaknessBanner(false)}
              className="px-3 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      

      {/* ===== Module Details Card ===== */}
      {selectedModule && (
        <div className="bg-[#021B36]/90 border border-[#00FFFF30]
          rounded-xl p-8 shadow-lg space-y-6"
        >
          <h2 className="text-3xl font-bold text-[#00FFFF]">
            {selectedModule.moduleTitle}
          </h2>

          <p className="text-[#AFCBE3]">
            {selectedModule.description}
          </p>

          {/* Module Duration */}
          <div className="text-sm text-[#AFCBE3]">
            ⏱ Estimated Days: <span className="font-semibold">{selectedModule.estimatedDays}</span>
          </div>
          
          {/* Time Remaining Display - Separate line to avoid overlap */}
          {!selectedModule.completed && moduleTimeRemaining && (
            <div className={`text-sm font-semibold ${
              moduleTimeRemaining.expired ? "text-red-400" : 
              moduleTimeRemaining.days === 0 ? "text-yellow-400" : 
              "text-[#00FFFF]"
            }`}>
              {moduleTimeRemaining.expired ? "⏰ EXPIRED" : `⏳ Time Left: ${moduleTimeRemaining.message}`}
            </div>
          )}

          {/* Learning Outcomes */}
          <div className="border border-[#00FFFF20] rounded-lg p-5">
            <h4 className="text-lg text-[#00FFFF] font-semibold mb-2">
              What you will learn
            </h4>
            <ul className="list-disc list-inside text-[#AFCBE3] text-sm space-y-1">
              <li>Core fundamentals</li>
              <li>Hands-on understanding</li>
              <li>Industry best practices</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-4">
            {!selectedModule.completed ? (
              <>
                <div className="flex items-center gap-3">
                  {/* Chatbot Button */}
                  <button
                    onClick={() =>
                      navigate("/chatbot", {
                        state: { userId, companyId, deptId, companyName },
                      })
                    }
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#00FFFF55] bg-[#031C3A]/90 px-4 py-3 text-sm font-semibold text-[#7FFAFF] shadow-[0_8px_20px_rgba(0,255,255,0.12)] transition hover:bg-[#07315A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FFAFF]"
                  >
                    Chat with AI Assistant
                  </button>

                  <span className="inline-flex items-center gap-1" aria-hidden="true">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#7DE7FF]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#7DE7FF]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#7DE7FF]" />
                  </span>

                  {/* Mark Module as Completed Button */}
                  <button
                    onClick={handleMarkModuleCompleted}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#00FFFF55] bg-[#031C3A]/90 px-4 py-3 text-sm font-semibold text-[#7FFAFF] shadow-[0_8px_20px_rgba(0,255,255,0.12)] transition hover:bg-[#07315A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FFAFF]"
                  >
                    Mark Module as Completed
                  </button>
                </div>

                
              </>
            ) : (
              <span className="text-green-400 font-semibold">
                ✅ Module Completed
              </span>
            )}

          </div>
        </div>
        
      )}
      
      {/* ===== Quiz Confirmation Modal ===== */}
      {showQuizConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#01050C]/75 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#00FFFF40] bg-[linear-gradient(160deg,rgba(2,27,54,0.96),rgba(3,28,58,0.94))] p-7 shadow-[0_20px_60px_rgba(0,255,255,0.14)]">
            {quizModalType === "confirm" ? (
              <>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#00FFFF40] bg-[#00FFFF12] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#7FFAFF]">
                  Completion Check
                </div>
                <h3 className="mb-3 text-2xl font-bold text-[#00FFFF]">
                  Complete Quiz to Finish Module
                </h3>
                <p className="mb-3 text-[#D0E8F6] leading-relaxed">
                  To mark this module as <span className="font-semibold text-white">completed</span>, you need to complete and pass the quiz first.
                </p>
                <p className="mb-4 text-[#AFCBE3]">
                  Ready now? I can take you directly to the quiz.
                </p>

                {/* 🤖 AI-Powered Assessment Info */}
                <div className="mb-6 rounded-xl border border-[#00FFFF30] bg-[#00FFFF0F] p-4">
                  <div className="flex items-start gap-2">
                    <span className="text-[#7FFAFF] text-xl">🤖</span>
                    <div className="text-xs text-[#AFCBE3]">
                      <p className="mb-1 font-semibold text-[#7FFAFF]">AI-Powered Assessment</p>
                      <p>AI will analyze your performance and dynamically allocate retry attempts (1-3) based on your learning progress.</p>
                    </div>
                  </div>
                </div>
              </>
            ) : quizModalType === "basicWait" ? (
              <>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#00FFFF40] bg-[#00FFFF12] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#7FFAFF]">
                  Training Duration Required
                </div>
                <h3 className="mb-3 text-2xl font-bold text-[#00FFFF]">
                  Complete Module Training Time
                </h3>
                <p className="mb-3 text-[#D0E8F6] leading-relaxed">
                  Please complete your module training for <span className="font-semibold text-white">{selectedModule?.estimatedDays || 1} day{(selectedModule?.estimatedDays || 1) > 1 ? "s" : ""}</span>.
                </p>
                <p className="mb-4 text-[#AFCBE3]">
                  After this duration is completed, this module can be marked as completed.
                </p>
                {moduleTimeRemaining?.message && (
                  <div className="mb-4 rounded-xl border border-[#007BFF55] bg-[linear-gradient(120deg,rgba(0,255,255,0.10),rgba(0,123,255,0.14))] p-3">
                    <p className="text-sm text-[#D0E8F6]">Current status: {moduleTimeRemaining.message}</p>
                  </div>
                )}
              </>
            ) : quizModalType === "basicCompleted" ? (
              <>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-green-400/40 bg-green-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-green-300">
                  Module Completed
                </div>
                <h3 className="mb-3 text-2xl font-bold text-[#00FFFF]">
                  Module Marked as Completed
                </h3>
                <p className="mb-4 text-[#D0E8F6] leading-relaxed">
                  Training duration is completed. This module has now been marked as completed.
                </p>
              </>
            ) : (
              <>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#00FFFF50] bg-[#00FFFF14] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#7FFAFF]">
                  Not Yet Available
                </div>
                <h3 className="text-2xl font-bold text-[#00FFFF] mb-3">
                  🔒 Quiz Locked
                </h3>
                <p className="text-[#D0E8F6] mb-3 leading-relaxed">
                  You need to complete the quiz to mark this module as completed.
                </p>
                <p className="text-[#AFCBE3] mb-4">
                  Your quiz will unlock after {quizUnlockInfo?.unlockPercent || DEFAULT_QUIZ_UNLOCK_PERCENT}% module time is completed.
                </p>
                <div className="mb-4 rounded-xl border border-[#007BFF55] bg-[linear-gradient(120deg,rgba(0,255,255,0.10),rgba(0,123,255,0.14))] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7FFAFF] mb-1">Quick Tip</p>
                  <p className="text-sm text-[#D0E8F6]">Use the chatbot to revise weak concepts while your quiz timer unlocks.</p>
                </div>
                {quizUnlockInfo?.remainingTime && (
                  <p className="text-sm text-[#7FFAFF] mb-6 font-semibold">
                    Time remaining: {quizUnlockInfo.remainingTime}
                  </p>
                )}
              </>
            )}
            
            <div className="flex gap-4">
              {quizModalType === "confirm" && (
                <button
                  onClick={confirmQuiz}
                  className="flex-1 rounded-lg bg-[#00FFFF] px-4 py-2 font-semibold text-[#031C3A] transition hover:bg-[#00FFFF]/90"
                >
                  Go to Quiz
                </button>
              )}
              {quizModalType === "locked" && (
                <button
                  onClick={() => {
                    setShowQuizConfirm(false);
                    navigate("/chatbot", {
                      state: { userId, companyId, deptId, companyName },
                    });
                  }}
                  className="flex-1 rounded-lg bg-gradient-to-r from-[#00FFFF] to-[#007BFF] px-4 py-2 font-semibold text-[#031C3A] transition hover:opacity-90"
                >
                  Go to Chatbot
                </button>
              )}
              <button
                onClick={cancelQuiz}
                className="flex-1 rounded-lg border border-[#00FFFF] px-4 py-2 font-semibold text-[#00FFFF] transition hover:bg-[#00FFFF]/10"
              >
                {quizModalType === "confirm" ? "Cancel" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
      

    </div>
        </FresherShellLayout>
);
  // ===============================
}