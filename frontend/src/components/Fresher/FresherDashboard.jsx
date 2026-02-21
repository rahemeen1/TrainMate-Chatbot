//FresherDashboard.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";

import { db } from "../../firebase";
import OnboardingPage from "./OnboardingPage";
import { FresherSideMenu } from "./FresherSideMenu";

// Custom scrollbar styles
const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #021B36;
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #00FFFF;
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #00CCD6;
  }
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: #00FFFF #021B36;
  }
`;

export default function FresherDashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [roadmap, setRoadmap] = useState([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [userData, setUserData] = useState(null);
  const [roadmapGenerated, setRoadmapGenerated] = useState(false);
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);
  const [missedDateInfo, setMissedDateInfo] = useState(null);

  const state = location.state || {};

// Try to get values from state first, fallback to localStorage
const [userId, setUserId] = useState(state.userId || localStorage.getItem("userId"));
const [companyId, setCompanyId] = useState(state.companyId || localStorage.getItem("companyId"));
const [deptId, setDeptId] = useState(state.deptId || localStorage.getItem("deptId"));
const [companyName, setCompanyName] = useState(state.companyName || localStorage.getItem("companyName"));
const [email, setEmail] = useState(state.email || localStorage.getItem("email"));

// Check if roadmap already exists
const checkRoadmapExists = async () => {
  try {
    if (!companyId || !deptId || !userId) return;
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
    setRoadmapGenerated(!snap.empty);
  } catch (err) {
    console.error("Error checking roadmap:", err);
  }
};

// Fetch missed dates
const fetchMissedDates = async () => {
  try {
    if (!companyId || !deptId || !userId) return;
    const response = await fetch("http://localhost:5000/api/chat/missed-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, companyId, deptId })
    });
    const data = await response.json();
    if (data.success) {
      setMissedDateInfo(data);
    }
  } catch (err) {
    console.error("Error fetching missed dates:", err);
  }
};

// Save to localStorage if state exists
useEffect(() => {
  if (state.userId) localStorage.setItem("userId", state.userId);
  if (state.companyId) localStorage.setItem("companyId", state.companyId);
  if (state.deptId) localStorage.setItem("deptId", state.deptId);
  if (state.companyName) localStorage.setItem("companyName", state.companyName);
  if (state.email) localStorage.setItem("email", state.email);
}, [state]);

//progress calculation
useEffect(() => {
  if (!companyId || !deptId || !userId) return;

  const loadRoadmapProgress = async () => {
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

      const modulesWithProgress = await Promise.all(
        snap.docs.map(async (moduleDoc) => {
          const moduleData = { id: moduleDoc.id, ...moduleDoc.data() };
          const chatSessionsRef = collection(
            db,
            "freshers",
            companyId,
            "departments",
            deptId,
            "users",
            userId,
            "roadmap",
            moduleDoc.id,
            "chatSessions"
          );
          const chatSessionsSnap = await getDocs(chatSessionsRef);
          const daysUsed = chatSessionsSnap.size;
          const estimatedDays = moduleData.estimatedDays || 1;

          return {
            ...moduleData,
            daysUsed,
            estimatedDays,
          };
        })
      );

      const totalDaysUsed = modulesWithProgress.reduce((sum, m) => sum + m.daysUsed, 0);
      const totalEstimatedDays = modulesWithProgress.reduce((sum, m) => sum + (m.estimatedDays || 1), 0);
      const percent = totalEstimatedDays > 0
        ? Math.min(Math.round((totalDaysUsed / totalEstimatedDays) * 100), 100)
        : 0;

      setProgressPercent(percent);

      // Update progress in user document
      const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
      await updateDoc(userRef, { progress: percent });
      
    } catch (err) {
      console.error("❌ Error loading roadmap progress:", err);
    }
  };

  loadRoadmapProgress();
}, [companyId, deptId, userId]);


// Redirect if essential info missing
useEffect(() => {
  if (!userId || !companyId || !deptId) {
    navigate("/", { replace: true });
  } else {
    checkRoadmapExists();
    fetchMissedDates();
  }
}, [userId, companyId, deptId, navigate]);

  // 🔹 Progress color
  const getProgressColor = (progress = 0) => {
    if (progress < 30) return "from-red-500 to-orange-500";
    if (progress < 70) return "from-yellow-400 to-[#00FFFF]";
    return "from-[#00FFFF] to-green-400";
  };

  useEffect(() => {
    if (!email) {
      navigate("/");
      return;
    }

    const fetchUser = async () => {
      try {

        const q = query(
          collectionGroup(db, "users"),
          where("email", "==", email)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          alert("User not found");
          navigate("/");
          return;
        }

        const userDoc = snap.docs[0];
        const data = userDoc.data();

          // Extract IDs from path
        const pathParts = userDoc.ref.path.split("/");
        const companyIdFromPath = pathParts[1];
        const deptIdFromPath = pathParts[3];
        const userIdFromPath = pathParts[5];

        setUserId(userIdFromPath);
        setCompanyId(companyIdFromPath);
        setDeptId(deptIdFromPath);

        setUserData(data);
        setCompanyName(data.companyName);

        //  Onboarding check
        if (!data.onboarding || !data.onboarding.onboardingCompleted) {
          setShowOnboarding(true);
        }
      } catch (err) {
        console.error("❌ Error fetching fresher:", err);
        alert("Error loading dashboard");
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [email, navigate]);

if (loading) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00FFFF]" />
        <p className="text-lg font-semibold">Loading your dashboard...</p>
        <p className="text-sm text-[#AFCBE3]">Please wait, this may take a few seconds.</p>
      </div>
    </div>
  );
}

  if (showOnboarding) {
    return (
      <OnboardingPage
        userId={userId}
        companyId={companyId}
        deptId={deptId}
        companyName={companyName}
        onFinish={async () => {
          const userRef = doc(
            db,
            "freshers",
            companyId,
            "departments",
            deptId,
            "users",
            userId
          );
          const snap = await getDoc(userRef);
          setUserData(snap.data());
          setShowOnboarding(false);
        }}
      />
    );
  }

  return (
    <>
      <style>{scrollbarStyles}</style>
      <div className="flex h-screen bg-[#031C3A] text-white overflow-hidden">
        {/* SIDE MENU */}
        <div className="w-64 bg-[#021B36]/90 p-4 overflow-y-auto custom-scrollbar">
          <FresherSideMenu
            userId={userId}
            companyId={companyId}
            deptId={deptId}
            companyName={companyName}
            roadmapGenerated={roadmapGenerated}
          />
        </div>

        {/* MAIN */}
        <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
        {/* MISSED DATES NOTIFICATION */}
        {missedDateInfo?.hasMissedDates && (
          <div className="bg-red-900/40 border border-red-500 rounded-lg p-4 mb-4 flex items-start gap-3">
            <div className="text-red-400 text-2xl flex-shrink-0">⚠️</div>
            <div className="flex-1">
              {(() => {
                const rawStart =
                  userData?.roadmapAgentic?.generatedAt ||
                  userData?.roadmapGeneratedAt ||
                  missedDateInfo.firstMissedDate;
                const startDate = rawStart?.toDate
                  ? rawStart.toDate()
                  : rawStart
                    ? new Date(rawStart)
                    : null;

                return (
                  <>
              <h3 className="text-red-400 font-semibold text-lg">You Missed {missedDateInfo.missedCount} Day{missedDateInfo.missedCount !== 1 ? "s" : ""}</h3>
              <p className="text-red-300 text-sm mt-1">
                Your training started on {
                  startDate
                    ? startDate.toLocaleDateString("en-US", {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                      })
                    : "Unknown"
                }. Don't break your streak! Catch up on your training today.
              </p>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#00FFFF]">
              Welcome {userData?.name || "Fresher"}!
            </h1>
            <p className="text-[#AFCBE3] mt-1">
              Your training journey starts here
            </p>
          </div>
          {missedDateInfo && missedDateInfo.currentStreak > 0 && (
            <div className="bg-gradient-to-r from-yellow-600/30 to-orange-600/30 border border-yellow-400 rounded-full px-3 py-1.5 flex items-center gap-2">
              <span className="text-lg">🔥</span>
              <div className="flex items-baseline gap-1">
                <span className="text-yellow-300 font-bold text-sm">{missedDateInfo.currentStreak}</span>
                
              </div>
            </div>
          )}
        </div>

        {/* INFO CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
            <h3 className="text-[#00FFFF] font-semibold mb-2">
              Training Program
            </h3>
            <p>{userData?.trainingOn || "Not assigned yet"}</p>
          </div>

          <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
            <h3 className="text-[#00FFFF] font-semibold mb-2">Department</h3>
            <p>{userData?.deptName || "N/A"}</p>
          </div>
        </div>

        {/* TRAINING STATS */}
        {missedDateInfo && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-[#021B36]/80 p-4 rounded-lg border border-green-500/30">
              <p className="text-[#AFCBE3] text-xs font-semibold uppercase mb-1">Active Days</p>
              <p className="text-green-400 text-2xl font-bold">{missedDateInfo.activeDays}</p>
              <p className="text-[#AFCBE3] text-xs mt-1">days trained</p>
            </div>

            <div className="bg-[#021B36]/80 p-4 rounded-lg border border-red-500/30">
              <p className="text-[#AFCBE3] text-xs font-semibold uppercase mb-1">Missed Days</p>
              <p className="text-red-400 text-2xl font-bold">{missedDateInfo.missedDays || 0}</p>
              <p className="text-[#AFCBE3] text-xs mt-1">days missed</p>
            </div>
            
             <div className="bg-[#021B36]/80 p-4 rounded-lg border border-purple-500/30">
              <p className="text-[#AFCBE3] text-xs font-semibold uppercase mb-1">Active Module</p>
              <p className="text-cyan-400 text-sm font-bold line-clamp-2" title={missedDateInfo.activeModuleName}>
                {missedDateInfo.activeModuleName || "No active module"}
              </p>
              <p className="text-[#AFCBE3] text-xs mt-1">current focus</p>
            </div>

            <div className="bg-[#021B36]/80 p-4 rounded-lg border border-[#00FFFF]/30">
              <p className="text-[#AFCBE3] text-xs font-semibold uppercase mb-1">Total Expected Days</p>
              <p className="text-[#00FFFF] text-2xl font-bold">{missedDateInfo.totalExpectedDays}</p>
              <p className="text-[#AFCBE3] text-xs mt-1">available for training</p>
            </div>

           

          </div>
        )}

        <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30] mb-6">
          <h2 className="text-xl text-[#00FFFF] font-semibold mb-2">Overall Training Progress</h2>
          <div className="w-full h-3 bg-[#031C3A] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#00FFFF] to-green-400"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-[#AFCBE3]">{progressPercent}% completed</p>
        </div>

           <div className="flex gap-4 mt-4">
  {roadmapGenerated ? (
    <button
      onClick={() => navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`)}
      className="px-6 py-3 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] font-semibold rounded-xl shadow-lg hover:scale-105 hover:shadow-2xl transition-transform duration-200"
    >
      View Roadmap
    </button>
  ) : (
    <button
      onClick={async () => {
        setGeneratingRoadmap(true);
        try {
          // Navigate to roadmap page while generating
          navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`);
        } catch (err) {
          console.error(err);
          alert("❌ Failed to generate roadmap");
        } finally {
          setGeneratingRoadmap(false);
        }
      }}
      disabled={generatingRoadmap}
      className="px-6 py-3 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] font-semibold rounded-xl shadow-lg hover:scale-105 hover:shadow-2xl transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {generatingRoadmap ? "Generating..." : " Generate Roadmap"}
    </button>
  )}
 
</div>
        <p className="text-center text-xs text-[#AFCBE3] mt-2">
          Powered by TrainMate
        </p>
        </div>
      </div>
    </>
  );
}
