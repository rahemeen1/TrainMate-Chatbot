//FresherDashboard.jsx
import { useEffect, useState } from "react";
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
} from "firebase/firestore";

import { auth, db } from "../../firebase";
import OnboardingPage from "./OnboardingPage";
import FresherShellLayout from "./FresherShellLayout";
import { apiUrl } from "../../services/api";

const toDateSafe = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseTrainingDurationDays = (duration) => {
  if (Number.isFinite(duration)) return Math.max(1, Math.round(duration));

  const raw = String(duration || "").trim().toLowerCase();
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);

  const match = raw.match(/(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit.startsWith("day")) return Math.round(value);
  if (unit.startsWith("week")) return Math.round(value * 7);
  if (unit.startsWith("month")) return Math.round(value * 30);

  return null;
};

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

// Build dashboard stats from Firestore so production does not depend on the API route
const fetchMissedDates = async () => {
  try {
    if (!companyId || !deptId || !userId) return;

    // Company onboarding answer (Q2) is the source of truth for training duration.
    let companyTrainingDurationDays = null;
    try {
      const onboardingRef = collection(db, "companies", companyId, "onboardingAnswers");
      const onboardingSnap = await getDocs(onboardingRef);
      if (!onboardingSnap.empty) {
        const latestDoc = [...onboardingSnap.docs].sort((a, b) => {
          const aTime = toDateSafe(a.data()?.createdAt)?.getTime() || 0;
          const bTime = toDateSafe(b.data()?.createdAt)?.getTime() || 0;
          return bTime - aTime;
        })[0];

        const answers = latestDoc?.data()?.answers || {};
        const rawTrainingDuration =
          answers["2"] || answers[2] || answers["1"] || answers[1] || null;
        companyTrainingDurationDays = parseTrainingDurationDays(rawTrainingDuration);
      }
    } catch (onboardingErr) {
      console.warn("Unable to fetch company onboarding duration:", onboardingErr);
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

    const roadmapSnap = await getDocs(roadmapRef);

    if (roadmapSnap.empty) {
      setMissedDateInfo({
        success: true,
        hasMissedDates: false,
        missedDates: [],
        firstMissedDate: null,
        missedCount: 0,
        activeDays: 0,
        missedDays: 0,
        totalExpectedDays: 0,
        currentStreak: 0,
        activeModuleName: "No roadmap",
      });
      return;
    }

    const allModules = roadmapSnap.docs.map((moduleDoc) => ({
      id: moduleDoc.id,
      ...moduleDoc.data(),
    }));

    const roadmapGeneratedAt =
      toDateSafe(userData?.roadmapAgentic?.generatedAt) ||
      toDateSafe(userData?.roadmapGeneratedAt) ||
      toDateSafe(allModules[0]?.startedAt) ||
      toDateSafe(allModules[0]?.FirstTimeCreatedAt) ||
      toDateSafe(allModules[0]?.createdAt);

    const uniqueActiveDates = new Set();
    for (const module of allModules) {
      const chatSessionsRef = collection(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId,
        "roadmap",
        module.id,
        "chatSessions"
      );
      const chatSessionsSnap = await getDocs(chatSessionsRef);
      chatSessionsSnap.docs.forEach((docSnap) => uniqueActiveDates.add(docSnap.id));
    }

    const activeDaysFromFirestore = uniqueActiveDates.size;
    const estimatedTotalDaysFromRoadmap = allModules.reduce(
      (sum, module) => sum + (Number(module.estimatedDays) || 1),
      0
    );

    const sortedModules = [...allModules].sort((a, b) => {
      const aOrder = Number(a.order) || 0;
      const bOrder = Number(b.order) || 0;
      return aOrder - bOrder;
    });

    const activeModule =
      sortedModules.find((module) => module.status === "in-progress") ||
      sortedModules.find((module) => module.status === "pending") ||
      sortedModules[0];

    const activeModuleName = activeModule?.moduleTitle || "No active module";

    let missedDates = [];
    if (roadmapGeneratedAt) {
      const startDate = startOfDay(roadmapGeneratedAt);
      const today = startOfDay(new Date());
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() - 1);

      if (endDate >= startDate) {
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          const dateKey = currentDate.toISOString().slice(0, 10);
          if (!uniqueActiveDates.has(dateKey)) {
            missedDates.push(dateKey);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    }

    const trainingStats = userData?.trainingStats || {};
    const userTrainingDurationDays =
      parseTrainingDurationDays(userData?.trainingDurationFromOnboarding) ||
      parseTrainingDurationDays(userData?.trainingDuration) ||
      parseTrainingDurationDays(userData?.roadmapAgentic?.trainingDuration);
    const activeDays = Number(trainingStats.activeDays) || activeDaysFromFirestore;
    const totalExpectedDays =
      companyTrainingDurationDays ||
      userTrainingDurationDays ||
      Number(trainingStats.totalExpectedDays) ||
      estimatedTotalDaysFromRoadmap;
    const missedDays = Number(trainingStats.missedDays) || missedDates.length;

    setMissedDateInfo({
      success: true,
      hasMissedDates: missedDays > 0,
      missedDates,
      firstMissedDate: missedDates.length > 0 ? missedDates[0] : null,
      missedCount: missedDays,
      activeDays,
      missedDays,
      totalExpectedDays,
      currentStreak: Number(trainingStats.currentStreak) || 0,
      activeModuleName,
    });
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
    if (userData) {
      fetchMissedDates();
    }
  }
}, [userId, companyId, deptId, navigate, userData]);

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

  const isTrainingLocked = Boolean(userData?.trainingLocked);

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
