//FresherProgress.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import FresherShellLayout from "./FresherShellLayout";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import TrainingLockedScreen from "./TrainingLockedScreen";
import { getCompanyLicensePlan } from "../../services/companyLicense";
import CompanyPageLoader from "../CompanySpecific/CompanyPageLoader";

const MODULE_QUIZ_PASS_THRESHOLD = 60;
const FINAL_QUIZ_PASS_THRESHOLD = 70;

export default function FresherProgress() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, companyId, deptId, companyName } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [phaseProgress, setPhaseProgress] = useState([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [roadmapModulesDetailed, setRoadmapModulesDetailed] = useState([]);
  const [activityTimeline, setActivityTimeline] = useState([]);
  const [licensePlan, setLicensePlan] = useState("License Basic");
  const [currentModuleLearning, setCurrentModuleLearning] = useState({
    moduleTitle: "Current Module",
    summary: "No current module activity yet.",
    focusAreas: [],
    planQueries: [],
  });

  const toDate = (raw) => {
    if (!raw) return null;
      if (raw instanceof Date) return raw;
      const parsed = raw.toDate ? raw.toDate() : new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

    const startOfDay = (date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const APP_TIMEZONE = "Asia/Karachi";

    const getDateKey = (date, timeZone = APP_TIMEZONE) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);

    const calculateCurrentStreak = (activeDates) => {
      if (!activeDates || activeDates.size === 0) return 0;

      const today = startOfDay(new Date());
      const todayKey = getDateKey(today);
      const cursor = activeDates.has(todayKey)
        ? new Date(today)
        : new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

      let streak = 0;
      while (activeDates.has(getDateKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }

      return streak;
    };

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

    const buildSummaryFromCurrentModuleChats = ({ moduleTitle, moduleProgress, chatSessions }) => {
      const safeSessions = Array.isArray(chatSessions) ? chatSessions : [];
      const allMessages = safeSessions.flatMap((session) =>
        Array.isArray(session?.messages) ? session.messages : []
      );
      const userMessages = allMessages.filter(
        (message) => String(message?.from || "").toLowerCase() === "user"
      );

      if (userMessages.length === 0) {
        return `You are in ${moduleTitle || "the current module"}. Start a chat to get a personalized progress summary.`;
      }

      const progressLabel =
        moduleProgress >= 80
          ? "strong"
          : moduleProgress >= 50
            ? "steady"
            : "early";

      const recentQuestions = userMessages
        .slice(-3)
        .map((message) => String(message?.text || "").trim())
        .filter(Boolean)
        .map((text) => (text.length > 90 ? `${text.slice(0, 87)}...` : text));

      const recentTopicText = recentQuestions.length
        ? `Recent questions: ${recentQuestions.join(" | ")}`
        : "Recent questions are not available yet.";

      return `Your progress in ${moduleTitle || "this module"} is ${progressLabel} (${moduleProgress}%). You have asked ${userMessages.length} questions across ${safeSessions.length} day(s) of chat activity. ${recentTopicText}`;
    };

  const getModulePhaseNumber = (module, fallback = 1) => {
    const title = String(module?.moduleTitle || "");
    const titleMatch = title.match(/\bmodule\s*(\d+)\b/i);
    if (titleMatch) {
      const parsedFromTitle = Number(titleMatch[1]);
      if (Number.isFinite(parsedFromTitle) && parsedFromTitle > 0) {
        return parsedFromTitle;
      }
    }

    const parsedOrder = Number(module?.order);
    if (Number.isFinite(parsedOrder) && parsedOrder > 0) {
      return parsedOrder;
    }

    return fallback;
  };

  useEffect(() => {
    if (!userId || !companyId || !deptId) {
      navigate("/fresher-dashboard");
      return;
    }

    const fetchProgress = async () => {
      try {
        const detectedPlan = await getCompanyLicensePlan(companyId);
        setLicensePlan(detectedPlan);

        // ✅ Get fresher data
        const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          alert("Fresher data not found!");
          navigate("/fresher-dashboard");
          return;
        }

        const data = snap.data();
        setUserData(data);

        let companyTrainingDurationDays = null;
        try {
          const onboardingRef = collection(
            db,
            "companies",
            companyId,
            "onboardingAnswers"
          );
          const onboardingSnap = await getDocs(onboardingRef);
          if (!onboardingSnap.empty) {
            const latestDoc = [...onboardingSnap.docs].sort((a, b) => {
              const aTime = toDate(a.data()?.createdAt)?.getTime() || 0;
              const bTime = toDate(b.data()?.createdAt)?.getTime() || 0;
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

        // ✅ Get all modules with their chat session counts
        const roadmapRef = collection(db, "freshers", companyId, "departments", deptId, "users", userId, "roadmap");
        const roadmapSnap = await getDocs(roadmapRef);
        
        // Calculate progress for each module based on days used or quiz completion
        const modulesWithProgress = await Promise.all(
          roadmapSnap.docs.map(async (moduleDoc) => {
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
            const chatDayKeys = chatSessionsSnap.docs.map((docSnap) => docSnap.id);
            const daysUsed = chatSessionsSnap.size;
            const chatSessionsData = chatSessionsSnap.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }));
            
            // If module has progress field (set when quiz is passed), use that
            if (moduleData.progress !== undefined && moduleData.progress !== null) {
              return {
                ...moduleData,
                daysUsed,
                estimatedDays: moduleData.estimatedDays || 1,
                moduleProgress: moduleData.progress,
                chatDayKeys,
                chatSessionsData,
              };
            }
            
            // Otherwise, calculate based on chat session days
            const estimatedDays = moduleData.estimatedDays || 1;
            const moduleProgress = Math.min(Math.round((daysUsed / estimatedDays) * 100), 100);
            
            return {
              ...moduleData,
              daysUsed,
              estimatedDays,
              moduleProgress,
              chatDayKeys,
              chatSessionsData,
            };
          })
        );

        setRoadmapModulesDetailed(modulesWithProgress);

        const events = [];
        modulesWithProgress.forEach((module, index) => {
          const phaseNumber = getModulePhaseNumber(module, index + 1);
          const startedAt = toDate(
            module.startedAt || module.FirstTimeCreatedAt || module.createdAt
          );
          const completedAt = toDate(module.completedAt);

          if (isValidDate(startedAt)) {
            events.push({
              date: startedAt,
              label: `Started Module ${phaseNumber}: ${module.moduleTitle}`,
              order: phaseNumber,
              type: "start",
            });
          }

          if (isValidDate(completedAt)) {
            events.push({
              date: completedAt,
              label: `Completed Module ${phaseNumber}: ${module.moduleTitle}`,
              order: phaseNumber,
              type: "complete",
            });
          }
        });

        events.sort((a, b) => {
          const timeDiff = b.date.getTime() - a.date.getTime();
          if (timeDiff !== 0) return timeDiff;
          if (a.type !== b.type) return a.type === "complete" ? -1 : 1;
          return (a.order ?? 0) - (b.order ?? 0);
        });
        setActivityTimeline(events);

        const sortedModules = [...modulesWithProgress].sort((a, b) => {
          const aOrder = Number(a.order) || 0;
          const bOrder = Number(b.order) || 0;
          return aOrder - bOrder;
        });

        const currentModule =
          sortedModules.find((module) => String(module?.status || "").toLowerCase() === "in-progress") ||
          sortedModules.find((module) => String(module?.status || "").toLowerCase() === "pending") ||
          sortedModules.find((module) => !module?.completed) ||
          sortedModules[0] ||
          null;

        let currentModuleMemory = null;
        if (currentModule?.id) {
          try {
            const currentModuleMemoryRef = doc(
              db,
              "freshers",
              companyId,
              "departments",
              deptId,
              "users",
              userId,
              "roadmap",
              currentModule.id,
              "agentMemory",
              "summary"
            );
            const currentModuleMemorySnap = await getDoc(currentModuleMemoryRef);
            if (currentModuleMemorySnap.exists()) {
              currentModuleMemory = currentModuleMemorySnap.data() || null;
            }
          } catch (moduleMemoryErr) {
            console.warn("Unable to fetch current module memory summary:", moduleMemoryErr);
          }
        }

        const moduleFocusAreas =
          (Array.isArray(currentModule?.skillsCovered) && currentModule.skillsCovered.filter(Boolean)) ||
          (Array.isArray(currentModule?.focusAreas) && currentModule.focusAreas.filter(Boolean)) ||
          (Array.isArray(data?.roadmapAgentic?.planFocusAreas) && data.roadmapAgentic.planFocusAreas.filter(Boolean)) ||
          [];

        const modulePlanQueriesFromDb =
          (Array.isArray(currentModule?.planQueries) && currentModule.planQueries.filter(Boolean)) ||
          (Array.isArray(currentModule?.skillExtractionContext?.planQueries) && currentModule.skillExtractionContext.planQueries.filter(Boolean)) ||
          (Array.isArray(data?.roadmapAgentic?.planQueries) && data.roadmapAgentic.planQueries.filter(Boolean)) ||
          [];

        const modulePlanQueries = modulePlanQueriesFromDb.length
          ? modulePlanQueriesFromDb
          : (currentModule?.moduleTitle
              ? [
                  `Explain core concepts of ${currentModule.moduleTitle}`,
                  `Give practical examples for ${currentModule.moduleTitle}`,
                  `Create a revision checklist for ${currentModule.moduleTitle}`,
                ]
              : []);

        const currentModuleSummary =
          currentModuleMemory?.summary ||
          buildSummaryFromCurrentModuleChats({
            moduleTitle: currentModule?.moduleTitle || "Current Module",
            moduleProgress: Number(currentModule?.moduleProgress) || Number(currentModule?.progress) || 0,
            chatSessions: currentModule?.chatSessionsData || [],
          });

        setCurrentModuleLearning({
          moduleTitle: currentModule?.moduleTitle || "Current Module",
          summary: currentModuleSummary,
          focusAreas: moduleFocusAreas,
          planQueries: modulePlanQueries,
        });

        const roadmapGeneratedAt =
          toDate(data?.roadmapAgentic?.generatedAt) ||
          toDate(data?.roadmapGeneratedAt) ||
          toDate(sortedModules[0]?.startedAt) ||
          toDate(sortedModules[0]?.FirstTimeCreatedAt) ||
          toDate(sortedModules[0]?.createdAt);

        const uniqueActiveDates = new Set();
        modulesWithProgress.forEach((module) => {
          (module.chatDayKeys || []).forEach((dayKey) => uniqueActiveDates.add(dayKey));
        });

        let missedDays = 0;
        if (roadmapGeneratedAt) {
          const startDate = startOfDay(roadmapGeneratedAt);
          const today = startOfDay(new Date());
          const endDate = new Date(today);
          endDate.setDate(endDate.getDate() - 1);

          if (endDate >= startDate) {
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
              const dateKey = getDateKey(currentDate);
              if (!uniqueActiveDates.has(dateKey)) {
                missedDays += 1;
              }
              currentDate.setDate(currentDate.getDate() + 1);
            }
          }
        }

        const estimatedTotalDaysFromRoadmap = modulesWithProgress.reduce(
          (sum, module) => sum + (Number(module.estimatedDays) || 1),
          0
        );

        const userTrainingDurationDays =
          parseTrainingDurationDays(data?.trainingDurationFromOnboarding) ||
          parseTrainingDurationDays(data?.trainingDuration) ||
          parseTrainingDurationDays(data?.roadmapAgentic?.trainingDuration);

        const totalExpectedDays =
          companyTrainingDurationDays ||
          userTrainingDurationDays ||
          Number(data?.trainingStats?.totalExpectedDays) ||
          estimatedTotalDaysFromRoadmap;

        const activeDays = uniqueActiveDates.size;
        const currentStreak = calculateCurrentStreak(uniqueActiveDates);
        const elapsedDaysSinceStart = roadmapGeneratedAt
          ? Math.max(
              1,
              Math.floor(
                (startOfDay(new Date()).getTime() -
                  startOfDay(roadmapGeneratedAt).getTime()) /
                  (1000 * 60 * 60 * 24)
              ) + 1
            )
          : activeDays;

        const remainingDays = Math.max(totalExpectedDays - elapsedDaysSinceStart, 0);

        setUserData((prev) => ({
          ...(prev || data),
          derivedTimeMetrics: {
            activeDays,
            missedDays,
            totalExpectedDays,
            currentStreak,
            elapsedDaysSinceStart,
            remainingDays,
          },
        }));

        // Calculate overall progress as average of all module progress percentages
        const totalModuleProgress = modulesWithProgress.reduce((sum, m) => sum + m.moduleProgress, 0);
        const overallPercent = modulesWithProgress.length > 0
          ? Math.min(Math.round(totalModuleProgress / modulesWithProgress.length), 100)
          : 0;
        setOverallProgress(overallPercent);

        // Update progress in user document
        await updateDoc(userRef, { progress: overallPercent });

        // ✅ Group modules by phase (order)
        const phaseMap = {};

        modulesWithProgress.forEach((module, index) => {
          const phase = getModulePhaseNumber(module, index + 1);
          if (!phaseMap[phase]) phaseMap[phase] = [];
          phaseMap[phase].push(module);
        });

        // ✅ Build phase progress dynamically based on chatbot usage
        const phases = Object.keys(phaseMap)
          .sort((a, b) => a - b)
          .map((phaseNumber) => {
            const phaseModules = phaseMap[phaseNumber];

            // Calculate average progress for modules in this phase
            const totalPhaseProgress = phaseModules.reduce((sum, m) => sum + m.moduleProgress, 0);
            const percent = phaseModules.length > 0
              ? Math.round(totalPhaseProgress / phaseModules.length)
              : 0;

            return {
              name: `Phase ${phaseNumber}`,
              progress: percent,
            };
          });

        setPhaseProgress(phases);

    
      } catch (err) {
        console.error(err);
        alert("Error fetching fresher progress");
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();
  }, [userId, companyId, deptId, navigate]);

  useEffect(() => {
    let animationFrame = null;
    const startTime = performance.now();
    const durationMs = 900;

    const step = (now) => {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(eased * overallProgress);
      setAnimatedProgress(value);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      }
    };

    animationFrame = requestAnimationFrame(step);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [overallProgress]);

  // if (loading) return <p className="text-white p-10">Loading fresher progress...</p>;
  // if (!userData) return <p className="text-white p-10">No data available.</p>;
  
if (loading) return <CompanyPageLoader message="Loading progress data..." layout="page" />;

// Check if training is locked
if (licensePlan === "License Pro" && userData?.trainingLocked) {
  return <TrainingLockedScreen userData={userData} />;
}

if (!userData) {
  return (
    <FresherShellLayout
      userId={userId}
      companyId={companyId}
      deptId={deptId}
      companyName={companyName}
      roadmapGenerated={true}
      headerLabel="Progress"
    >
      <div className="min-h-[60vh] flex items-center justify-center text-[#AFCBE3]">
        No data available.
      </div>
    </FresherShellLayout>
  );
}

  const hasPhaseProgress = Array.isArray(phaseProgress) && phaseProgress.length > 0;
  const phaseChartData = hasPhaseProgress
    ? phaseProgress.map((item, idx) => ({
        name: item?.name || `Phase ${idx + 1}`,
        progress: Number.isFinite(Number(item?.progress))
          ? Math.max(0, Math.min(100, Number(item.progress)))
          : 0,
      }))
    : [{ name: "No Data", progress: 0 }];


  return (
    <FresherShellLayout
      userId={userId}
      companyId={companyId}
      deptId={deptId}
      companyName={companyName}
      roadmapGenerated={true}
      headerLabel="Progress"
      contentClassName="relative overflow-hidden"
    >
      <div>
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#00FFFF]/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-20 w-72 h-72 rounded-full bg-[#00FFC2]/10 blur-3xl" />
      <div className="relative z-10 p-4 md:p-10">
        <div className="mb-6 backdrop-blur-xl bg-[#021B36]/50 border border-[#00FFFF25] rounded-2xl p-6 shadow-[0_15px_50px_rgba(0,255,255,0.08)]">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#AFCBE3] mb-2">Performance Dashboard</p>
              <h1 className="text-3xl font-bold text-[#00FFFF]">{userData.name}'s Progress</h1>
              <p className="text-[#AFCBE3] mt-1">
                Department: {userData.deptName}  | Expertise: {userData.onboarding?.expertise}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${userData?.certificateUnlocked ? "bg-green-500/10 text-green-300 border-green-400/30" : "bg-amber-500/10 text-amber-300 border-amber-400/30"}`}>
                Certificate: {userData?.certificateUnlocked ? "Unlocked" : "Locked"}
              </span>
              {licensePlan === "License Pro" && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-[#00FFFF10] text-[#00FFFF] border-[#00FFFF30]">
                  Final Quiz: {userData?.finalAssessment?.status || "locked"}
                </span>
              )}
            </div>
          </div>
        </div>

        
        {(() => {
          const isBasicLicense = licensePlan === "License Basic";
          const derivedTimeMetrics = userData.derivedTimeMetrics || {};
          const activeDays = Number(derivedTimeMetrics.activeDays) || 0;
          const currentStreak = Number(derivedTimeMetrics.currentStreak) || 0;
          const missedDays = Number(derivedTimeMetrics.missedDays) || 0;
          const totalExpectedDays = Number(derivedTimeMetrics.totalExpectedDays) || 0;
          const elapsedDaysSinceStart = Number(derivedTimeMetrics.elapsedDaysSinceStart) || 0;
          const remainingDays = Number(derivedTimeMetrics.remainingDays) || 0;
          const trainingWindowPercent = totalExpectedDays
            ? Math.min(Math.round((elapsedDaysSinceStart / totalExpectedDays) * 100), 100)
            : 0;

          const totalAttempts = roadmapModulesDetailed.reduce(
            (sum, m) => sum + (m.quizAttempts ?? 0),
            0
          );
          const quizzesGenerated = roadmapModulesDetailed.filter(
            (m) => m.quizGenerated
          ).length;
          const quizzesAttempted = roadmapModulesDetailed.filter(
            (m) => (Number(m.quizAttempts) || 0) > 0
          ).length;
          const quizzesPassed = roadmapModulesDetailed.filter(
            (m) => m.quizPassed
          ).length;
          const quizzesFailed = roadmapModulesDetailed.filter(
            (m) => (Number(m.quizAttempts) || 0) > 0 && !m.quizPassed
          ).length;
          const passRate = quizzesAttempted
            ? Math.round((quizzesPassed / quizzesAttempted) * 100)
            : 0;

          const modulePassThreshold =
            Number(userData?.quizPolicy?.passThreshold) || MODULE_QUIZ_PASS_THRESHOLD;

          const finalAssessment = userData.finalAssessment || {};
          const finalAttemptsUsed = Number(finalAssessment.attemptsUsed) || 0;
          const finalMaxAttempts = Number(finalAssessment.maxAttempts) || 2;
          const finalAttemptsLeft = Math.max(finalMaxAttempts - finalAttemptsUsed, 0);
          const finalPassThreshold = Number(finalAssessment.passThreshold) || FINAL_QUIZ_PASS_THRESHOLD;
          const finalStatus = finalAssessment.status || "locked";
          const finalLastScore = finalAssessment.lastScore ?? userData.certificateFinalQuizScore ?? null;

          const totalModules = roadmapModulesDetailed.length;
          const completedModules = roadmapModulesDetailed.filter(
            (m) => m.completed
          ).length;
          const completionRate = Math.max(0, Math.min(100, Number(overallProgress) || 0));

          const lockedModules = roadmapModulesDetailed.filter(
            (m) => m.quizLocked || m.moduleLocked
          ).length;
          const pendingModules = roadmapModulesDetailed.filter(
            (m) => !m.completed
          ).length;
          const overdueModules = roadmapModulesDetailed.filter((m) => {
            if (m.completed) return false;
            const startDate = toDate(
              m.startedAt || m.FirstTimeCreatedAt || m.createdAt
            );
            if (!startDate || !m.estimatedDays) return false;
            const deadline = new Date(
              startDate.getTime() + m.estimatedDays * 24 * 60 * 60 * 1000
            );
            return deadline < new Date();
          }).length;

          let nextDeadline = null;
          roadmapModulesDetailed.forEach((m) => {
            if (m.completed) return;
            const startDate = toDate(
              m.startedAt || m.FirstTimeCreatedAt || m.createdAt
            );
            if (!startDate || !m.estimatedDays) return;
            const deadline = new Date(
              startDate.getTime() + m.estimatedDays * 24 * 60 * 60 * 1000
            );
            if (deadline < new Date()) return;
            if (!nextDeadline || deadline < nextDeadline.date) {
              nextDeadline = {
                date: deadline,
                title: m.moduleTitle,
                order: m.order,
              };
            }
          });

          const nextDeadlineDays = nextDeadline
            ? Math.max(
                0,
                Math.ceil((nextDeadline.date - new Date()) / (1000 * 60 * 60 * 24))
              )
            : null;

          return (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {!isBasicLicense && (
                  <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl text-[#00FFFF] font-semibold">Quiz Performance</h2>
                      <span className="text-xs text-[#AFCBE3]">
                        Coverage: {quizzesGenerated}/{totalModules} | Attempted: {quizzesAttempted}
                      </span>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18] flex items-center justify-between">
                        <div>
                          <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Total Attempts</p>
                          <p className="text-sm text-[#CFE8FF]">Across generated quizzes</p>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-[#00FFFF]/15 text-[#00FFFF] font-semibold">
                          {totalAttempts}
                        </span>
                      </div>
                      <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Pass Rate (Attempted)</p>
                          <span className="text-sm font-semibold text-[#00FFFF]">{passRate}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-[#031C3A] overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#00FFFF] to-green-400"
                            style={{ width: `${passRate}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                          <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Quizzes Generated</p>
                          <p className="text-lg font-semibold text-[#00FFFF] mt-1">{quizzesGenerated}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                          <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Passed / Failed</p>
                          <p className="text-lg font-semibold text-[#00FFFF] mt-1">
                            {quizzesPassed} / {quizzesFailed}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                          <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Module Threshold</p>
                          <p className="text-lg font-semibold text-[#00FFFF] mt-1">{modulePassThreshold}%</p>
                        </div>
                      </div>

                      <div className="mt-3 p-3 rounded-lg bg-[#031C3A]/70 border border-[#00FFFF25]">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Final Quiz Attempts</p>
                          <span className="text-xs px-2 py-1 rounded-full bg-[#00FFFF15] text-[#00FFFF] border border-[#00FFFF25] capitalize">
                            {finalStatus}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="p-2 rounded bg-[#031C3A] border border-[#00FFFF18]">
                            <p className="text-[10px] uppercase tracking-wide text-[#AFCBE3]">Used</p>
                            <p className="text-sm font-semibold text-[#00FFFF] mt-1">{finalAttemptsUsed}</p>
                          </div>
                          <div className="p-2 rounded bg-[#031C3A] border border-[#00FFFF18]">
                            <p className="text-[10px] uppercase tracking-wide text-[#AFCBE3]">Left</p>
                            <p className="text-sm font-semibold text-[#00FFFF] mt-1">{finalAttemptsLeft}</p>
                          </div>
                          <div className="p-2 rounded bg-[#031C3A] border border-[#00FFFF18]">
                            <p className="text-[10px] uppercase tracking-wide text-[#AFCBE3]">Final Threshold</p>
                            <p className="text-sm font-semibold text-[#00FFFF] mt-1">{finalPassThreshold}%</p>
                          </div>
                          <div className="p-2 rounded bg-[#031C3A] border border-[#00FFFF18]">
                            <p className="text-[10px] uppercase tracking-wide text-[#AFCBE3]">Last Score</p>
                            <p className="text-sm font-semibold text-[#00FFFF] mt-1">{finalLastScore ?? "-"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className={`bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30] ${isBasicLicense ? "lg:col-span-2" : ""}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl text-[#00FFFF] font-semibold">Time Metrics</h2>
                    <span className="text-xs text-[#AFCBE3]">
                      Window: {elapsedDaysSinceStart}/{totalExpectedDays} days
                    </span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Training Elapsed</p>
                        <span className="text-sm font-semibold text-[#00FFFF]">{trainingWindowPercent}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-[#031C3A] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#00FFFF] to-blue-400"
                          style={{ width: `${trainingWindowPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                        <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Active Days</p>
                        <p className="text-lg font-semibold text-[#00FFFF] mt-1">{activeDays}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                        <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Current Streak</p>
                        <p className="text-lg font-semibold text-[#00FFFF] mt-1">{currentStreak}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                        <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Missed Days</p>
                        <p className="text-lg font-semibold text-[#00FFFF] mt-1">{missedDays}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                        <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Remaining Days</p>
                        <p className="text-lg font-semibold text-[#00FFFF] mt-1">{remainingDays}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl text-[#00FFFF] font-semibold">Roadmap Health</h2>
                    <span className="text-xs text-[#AFCBE3]">Overall Progress: {completionRate}%</span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Completion Rate</p>
                        <span className="text-sm font-semibold text-[#00FFFF]">{completionRate}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-[#031C3A] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#00FFFF] to-green-400"
                          style={{ width: `${completionRate}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                        <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Pending Modules</p>
                        <p className="text-lg font-semibold text-[#00FFFF] mt-1">{pendingModules}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                        <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Locked Modules</p>
                        <p className="text-lg font-semibold text-[#00FFFF] mt-1">{lockedModules}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                        <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Overdue Modules</p>
                        <p className="text-lg font-semibold text-[#00FFFF] mt-1">{overdueModules}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                        <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Next Deadline</p>
                        <p className="text-sm font-semibold text-[#00FFFF] mt-1">
                          {nextDeadline
                            ? `Module ${nextDeadline.order} in ${nextDeadlineDays}d`
                            : "No upcoming"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl text-[#00FFFF] font-semibold">Learning Profile</h2>
                    <span className="text-xs text-[#AFCBE3]">Focus and intent</span>
                  </div>
                  <div className="space-y-3 text-sm text-[#CFE8FF]">
                    <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                      <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Summary</p>
                      <p className="mt-1">
                        {currentModuleLearning.summary || "No summary available."}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                      <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Focus Areas</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Array.isArray(currentModuleLearning.focusAreas) && currentModuleLearning.focusAreas.length > 0
                          ? currentModuleLearning.focusAreas.map((area, idx) => (
                              <span
                                key={`focus-${idx}`}
                                className="px-2 py-1 rounded-full bg-[#031C3A]/70 border border-[#00FFFF25] text-xs"
                              >
                                {area}
                              </span>
                            ))
                          : "None"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#031C3A]/60 border border-[#00FFFF18]">
                      <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Plan Queries</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Array.isArray(currentModuleLearning.planQueries) && currentModuleLearning.planQueries.length > 0
                          ? currentModuleLearning.planQueries.map((query, idx) => (
                              <span
                                key={`query-${idx}`}
                                className="px-2 py-1 rounded-full bg-[#031C3A]/70 border border-[#00FFFF25] text-xs"
                              >
                                {query}
                              </span>
                            ))
                          : "None"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </>
          );
        })()}

        {/* Phase-wise Chart */}
        <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30] mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl text-[#00FFFF] font-semibold">Phase-wise Progress</h2>
            <span className="text-xs text-[#AFCBE3]">
              {hasPhaseProgress ? "Modules grouped by phase" : "No phase progress data yet"}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={phaseChartData}>
              <defs>
                <linearGradient id="phaseGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#00FFFF" />
                  <stop offset="100%" stopColor="#1ac7ff" />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="name"
                stroke="#AFCBE3"
                tick={{ fill: "#AFCBE3", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "#123456" }}
              />
              <YAxis
                stroke="#AFCBE3"
                tick={{ fill: "#AFCBE3", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "#123456" }}
                domain={[0, 100]}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(value) => [`${value}%`, "Progress"]}
                contentStyle={{
                  backgroundColor: "#021B36",
                  border: "1px solid #00FFFF33",
                  color: "#CFE8FF",
                }}
                cursor={{ fill: "#00FFFF12" }}
              />
              <Bar dataKey="progress" fill="url(#phaseGradient)" radius={[8, 8, 0, 0]} minPointSize={2} />
            </BarChart>
          </ResponsiveContainer>
          {!hasPhaseProgress && (
            <p className="mt-3 text-xs text-[#AFCBE3]">
              Graph will appear once module progress is available.
            </p>
          )}
        </div>

        <p className="text-center text-xs text-[#AFCBE3] mt-10">Powered by TrainMate</p>
      </div>
      </div>
    </FresherShellLayout>
  );
}
