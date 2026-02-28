// FresherTraining.jsx
import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { FresherSideMenu } from "./FresherSideMenu";
import TrainingLockedScreen from "./TrainingLockedScreen";

export default function FresherTraining() {
  const { companyId, deptId, userId } = useParams();
  const location = useLocation(); 
  const navigate = useNavigate();
  const selectedModuleId = location.state?.moduleId || null;
  const companyName = location.state?.companyName || "";


  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState(null);
  const [showQuizConfirm, setShowQuizConfirm] = useState(false);
  const [weaknessAnalysis, setWeaknessAnalysis] = useState(null);
  const [showWeaknessBanner, setShowWeaknessBanner] = useState(false);
  const [userData, setUserData] = useState(null);

  // ===============================
  // 🔄 Load Roadmap & Weakness Analysis
  // ===============================
  useEffect(() => {
    if (!companyId || !deptId || !userId) return;

    const loadRoadmap = async () => {
      try {
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
        const modules = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

  const takeQuiz = (moduleId) => {
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
  if (userData?.trainingLocked) {
    return <TrainingLockedScreen userData={userData} />;
  }

return (
  <div className="flex h-screen bg-[#031C3A] text-white overflow-hidden">
    {/* ===== Sidebar (FIXED WIDTH) ===== */}
    <div className="w-64 h-screen flex-shrink-0 bg-[#021B36]/90 p-4">
      <FresherSideMenu
        userId={userId}
        companyId={companyId}
        deptId={deptId}
        companyName={companyName}
        roadmapGenerated={true}
      />
    </div>

    {/* ===== Main Content ===== */}
    <div className="flex-1 p-8 space-y-8 overflow-y-auto">
      <h1 className="text-3xl font-bold text-[#00FFFF]">
        Module Details
      </h1>

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

      {/* ===== Progress Bar ===== */}
      <div>
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
                {/* Mark Module as Completed Button - Always same text */}
                <button
                  onClick={() => takeQuiz()}
                  className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold flex items-center justify-center gap-2 hover:bg-[#00FFFF]/90 transition"
                >
                  Mark Module as Completed
                </button>
              </>
            ) : (
              <span className="text-green-400 font-semibold">
                ✅ Module Completed
              </span>
            )}

            {/* Chatbot Button */}
            <button
              onClick={() =>
                navigate("/chatbot", {
                  state: { userId, companyId, deptId, companyName },
                })
              }
              className="flex items-center justify-center gap-2 px-6 py-3
                bg-gradient-to-r from-cyan-400 to-blue-500
                rounded-lg text-white font-semibold hover:scale-105 transition"
            >
              Chat with AI Assistant
            </button>

            <button
              onClick={() => navigate(-1)}
              className="text-sm text-[#00FFFF] underline"
            >
              ← Back to roadmap
            </button>
          </div>
        </div>
        
      )}
      
      {/* ===== Quiz Confirmation Modal ===== */}
      {showQuizConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#021B36] border border-[#00FFFF] rounded-lg p-8 max-w-md shadow-xl">
            <h3 className="text-2xl font-bold text-[#00FFFF] mb-4">
              📝 Take Quiz
            </h3>
            <p className="text-[#AFCBE3] mb-4">
              To mark this module as <span className="font-semibold text-white">completed</span>, you need to take and pass the quiz.
            </p>
            <p className="text-[#AFCBE3] mb-4">
              Do you want me to redirect you to the quiz page?
            </p>
            
            {/* 🤖 AI-Powered Assessment Info */}
            <div className="mb-6 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-purple-400 text-xl">🤖</span>
                <div className="text-xs text-[#AFCBE3]">
                  <p className="font-semibold text-purple-300 mb-1">AI-Powered Assessment</p>
                  <p>AI will analyze your performance and dynamically allocate retry attempts (1-3) based on your learning progress.</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={confirmQuiz}
                className="flex-1 px-4 py-2 bg-[#00FFFF] text-[#031C3A] 
                  rounded font-semibold hover:bg-[#00FFFF]/90 transition"
              >
                Yes, Take Quiz
              </button>
              <button
                onClick={cancelQuiz}
                className="flex-1 px-4 py-2 border border-[#00FFFF] text-[#00FFFF] 
                  rounded font-semibold hover:bg-[#00FFFF]/10 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      

    </div>
  </div>
);
  // ===============================
}