//FresherDashboard.jsx
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";

import { auth, db } from "../../firebase";
import OnboardingPage from "./OnboardingPage";
import FresherShellLayout from "./FresherShellLayout";
import { apiUrl } from "../../services/api";
import { getCompanyLicensePlan } from "../../services/companyLicense";

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
  const [showMissedDates, setShowMissedDates] = useState(true);
  const [onboardingNotice, setOnboardingNotice] = useState("");
  const [licensePlan, setLicensePlan] = useState("License Basic");

  const state = location.state || {};

// Try to get values from state first, fallback to localStorage
const [userId, setUserId] = useState(state.userId || localStorage.getItem("userId"));
const [companyId, setCompanyId] = useState(state.companyId || localStorage.getItem("companyId"));
const [deptId, setDeptId] = useState(state.deptId || localStorage.getItem("deptId"));
const [companyName, setCompanyName] = useState(state.companyName || localStorage.getItem("companyName"));
const [email, setEmail] = useState(state.email || localStorage.getItem("email"));

const handleLogout = async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("Logout failed:", err);
  } finally {
    localStorage.clear();
    navigate("/", { replace: true });
  }
};

// Check if roadmap already exists
const checkRoadmapExists = useCallback(async () => {
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
}, [companyId, deptId, userId]);

// Build dashboard stats from backend so streak/missed-day logic stays centralized.
const fetchMissedDates = useCallback(async () => {
  try {
    if (!companyId || !deptId || !userId) return;
    const response = await fetch(apiUrl("/api/chat/missed-dates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, companyId, deptId }),
    });

    const data = await response.json();
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || "Failed to fetch attendance stats");
    }

    const latestScoreRaw =
      userData?.finalAssessment?.lastScore ??
      userData?.certificateFinalQuizScore ??
      userData?.weaknessAnalysis?.latestScore ??
      null;
    const latestScore =
      typeof latestScoreRaw === "number" && Number.isFinite(latestScoreRaw)
        ? Math.round(latestScoreRaw)
        : null;

    setMissedDateInfo({
      success: true,
      ...data,
      latestScore,
    });
  } catch (err) {
    console.error("Error fetching missed dates:", err);
  }
}, [companyId, deptId, userId, userData]);

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
          
          // If module has progress field (set when quiz is passed), use that
          if (moduleData.progress !== undefined && moduleData.progress !== null) {
            return {
              ...moduleData,
              moduleProgress: moduleData.progress,
              daysUsed: 0, // Not needed when progress is set
              estimatedDays: moduleData.estimatedDays || 1,
            };
          }
          
          // Otherwise, calculate based on chat session days
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
          const moduleProgress = Math.min(Math.round((daysUsed / estimatedDays) * 100), 100);

          return {
            ...moduleData,
            moduleProgress,
            daysUsed,
            estimatedDays,
          };
        })
      );

      // Calculate overall progress as average of module progress percentages
      const totalModuleProgress = modulesWithProgress.reduce((sum, m) => sum + m.moduleProgress, 0);
      const percent = modulesWithProgress.length > 0
        ? Math.min(Math.round(totalModuleProgress / modulesWithProgress.length), 100)
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
    getCompanyLicensePlan(companyId)
      .then((plan) => setLicensePlan(plan))
      .catch((err) => console.warn("Failed to fetch license plan:", err));
    if (userData) {
      fetchMissedDates();
    }
  }
}, [userId, companyId, deptId, navigate, userData, checkRoadmapExists, fetchMissedDates]);

useEffect(() => {
  if (!companyId || !deptId || !userId) return;

  const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
  const unsubscribe = onSnapshot(
    userRef,
    (snapshot) => {
      if (snapshot.exists()) {
        setUserData((prev) => ({ ...(prev || {}), ...snapshot.data() }));
      }
    },
    (err) => {
      console.warn("Realtime user sync failed:", err);
    }
  );

  return () => unsubscribe();
}, [companyId, deptId, userId]);

useEffect(() => {
  if (!companyId || !deptId || !userId || !userData) return;

  const refreshStats = () => {
    fetchMissedDates();
    checkRoadmapExists();
  };

  const intervalId = setInterval(refreshStats, 60000);
  const onFocus = () => refreshStats();
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      refreshStats();
    }
  };

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    clearInterval(intervalId);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}, [companyId, deptId, userId, userData, fetchMissedDates, checkRoadmapExists]);

// 10-minute timer for missed dates notification
useEffect(() => {
  const LOGIN_TIME_KEY = "fresherDashboardLoginTime";
  const TEN_MINUTES = 10 * 60 * 1000; // 10 minutes in milliseconds

  // Get or set login time
  const storedLoginTime = localStorage.getItem(LOGIN_TIME_KEY);
  const loginTime = storedLoginTime ? parseInt(storedLoginTime, 10) : Date.now();
  
  if (!storedLoginTime) {
    localStorage.setItem(LOGIN_TIME_KEY, loginTime.toString());
  }

  // Check if 10 minutes have passed
  const checkTime = () => {
    const currentTime = Date.now();
    const elapsed = currentTime - loginTime;
    
    if (elapsed >= TEN_MINUTES) {
      setShowMissedDates(false);
    } else {
      setShowMissedDates(true);
    }
  };

  // Initial check
  checkTime();

  // Set interval to check every minute
  const interval = setInterval(checkTime, 60000);

  return () => clearInterval(interval);
}, []);

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
        let data = null;

        if (companyId && deptId && userId) {
          const directUserRef = doc(
            db,
            "freshers",
            companyId,
            "departments",
            deptId,
            "users",
            userId
          );
          const directSnap = await getDoc(directUserRef);
          if (directSnap.exists()) {
            data = directSnap.data();
          }
        }

        if (!data) {
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
          data = userDoc.data();

          // Extract IDs from path
          const pathParts = userDoc.ref.path.split("/");
          const companyIdFromPath = pathParts[1];
          const deptIdFromPath = pathParts[3];
          const userIdFromPath = pathParts[5];

          setUserId(userIdFromPath);
          setCompanyId(companyIdFromPath);
          setDeptId(deptIdFromPath);
        }

        setUserData(data);
        setCompanyName(data.companyName);

        const shouldForceOnboarding = Boolean(state.forceOnboarding);
        const noticeFromState = state.onboardingNotice || "";
        if (shouldForceOnboarding && noticeFromState) {
          setOnboardingNotice(noticeFromState);
        }

        // Onboarding check (or forced CV re-upload)
        if (shouldForceOnboarding || !data.onboarding || !data.onboarding.onboardingCompleted) {
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
  }, [email, navigate, companyId, deptId, userId]);

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
        onboardingNotice={onboardingNotice}
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
          setOnboardingNotice("");
        }}
      />
    );
  }

  const isTrainingLocked = licensePlan === "License Pro" && Boolean(userData?.trainingLocked);

  return (
    <>
      <style>{scrollbarStyles}</style>
      <FresherShellLayout
        userId={userId}
        companyId={companyId}
        deptId={deptId}
        companyName={companyName}
        roadmapGenerated={roadmapGenerated}
        isTrainingLocked={isTrainingLocked}
        headerLabel="Dashboard"
      >
        <div className="p-6 md:p-10">
        {/* TRAINING LOCKED MESSAGE */}
        {isTrainingLocked && (
          <div className="bg-red-500/20 border-l-4 border-red-500 px-4 py-3 mb-6 rounded flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <p className="text-red-200 font-medium">Your admin is notified. According to your progress, they will take action.</p>
          </div>
        )}

        {/* MISSED DATES NOTIFICATION - Only shown for first 10 minutes */}
        {showMissedDates && missedDateInfo?.hasMissedDates && (
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
          {isTrainingLocked ? (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-2 flex items-center gap-2">
              <span className="text-2xl">🔒</span>
              <span className="text-red-300 font-semibold">Your training is locked</span>
            </div>
          ) : missedDateInfo && missedDateInfo.currentStreak > 0 && (
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-[#021B36]/80 p-4 rounded-lg border border-green-500/30">
            <p className="text-[#AFCBE3] text-xs font-semibold uppercase mb-1">Active Days</p>
            <p className="text-green-400 text-2xl font-bold">{missedDateInfo?.activeDays || "-"}</p>
            <p className="text-[#AFCBE3] text-xs mt-1">days trained</p>
          </div>

          <div className="bg-[#021B36]/80 p-4 rounded-lg border border-red-500/30">
            <p className="text-[#AFCBE3] text-xs font-semibold uppercase mb-1">Missed Days</p>
            <p className="text-red-400 text-2xl font-bold">{missedDateInfo?.missedDays || 0}</p>
            <p className="text-[#AFCBE3] text-xs mt-1">days missed</p>
          </div>
          
          <div className="bg-[#021B36]/80 p-4 rounded-lg border border-purple-500/30">
            <p className="text-[#AFCBE3] text-xs font-semibold uppercase mb-1">Active Module</p>
            <p className="text-cyan-400 text-sm font-bold line-clamp-2" title={missedDateInfo?.activeModuleName || ""}>
              {missedDateInfo?.activeModuleName || "No active module"}
            </p>
            <p className="text-[#AFCBE3] text-xs mt-1">current focus</p>
          </div>

          <div className="bg-[#021B36]/80 p-4 rounded-lg border border-[#00FFFF]/30">
            <p className="text-[#AFCBE3] text-xs font-semibold uppercase mb-1">Total Days</p>
            <p className="text-[#00FFFF] text-2xl font-bold">{missedDateInfo?.totalExpectedDays || "-"}</p>
            <p className="text-[#AFCBE3] text-xs mt-1"> for training</p>
          </div>

        </div>

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
  {roadmapGenerated && !isTrainingLocked ? (
    <button
      onClick={() => {
        navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`);
      }}
      className="px-6 py-3 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] font-semibold rounded-xl shadow-lg transition-transform duration-200 hover:scale-105 hover:shadow-2xl"
      title="View Roadmap"
    >
      View Roadmap
    </button>
  ) : !isTrainingLocked ? (
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
      title="Generate Roadmap"
    >
      {generatingRoadmap ? "Generating..." : " Generate Roadmap"}
    </button>
  ) : null}
 
</div>
        <p className="text-center text-xs text-[#AFCBE3] mt-2">
          Powered by TrainMate
        </p>
        </div>
      </FresherShellLayout>
    </>
  );
}
