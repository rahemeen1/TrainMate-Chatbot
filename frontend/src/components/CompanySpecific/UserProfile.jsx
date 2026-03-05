//UserProfile.jsx
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase"; 
import CompanySidebar from "./CompanySidebar"; 
export default function UserProfile() {
  const { companyId, deptId, userId } = useParams();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roadmapModules, setRoadmapModules] = useState([]);
  const [roadmapLoading, setRoadmapLoading] = useState(true);
  const [expandedSkills, setExpandedSkills] = useState({});
  const [actionLoading, setActionLoading] = useState({});
  const [actionStatus, setActionStatus] = useState({});
  const [expandedActions, setExpandedActions] = useState({});
  const [selectedAction, setSelectedAction] = useState({});

  const searchParams = new URLSearchParams(location.search);
  const notificationIdFromQuery = searchParams.get("notificationId") || "";
  const moduleIdFromQuery = searchParams.get("moduleId") || "";
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          console.log("User data fetched:", snap.data());
          setUser(snap.data());
        } else {
          console.warn("User not found");
          alert("User not found");
        }
        
        // Fetch company data
        const companyRef = doc(db, "companies", companyId);
        const companSnap = await getDoc(companyRef);
        if (companSnap.exists()) {
          setCompany(companSnap.data());
        }
      } catch (err) {
        console.error("Error fetching user info:", err);
        alert("Error fetching user info");
      } finally {
        setLoading(false);
      }
    };

    if (companyId && deptId && userId) {
      fetchUser();
    } else {
      console.error("Missing params");
      setLoading(false);
    }
  }, [companyId, deptId, userId]);
  const fetchRoadmap = async () => {
    if (!companyId || !deptId || !userId) return;

    try {
      setRoadmapLoading(true);
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

      const modules = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => a.order - b.order); // order = module number

      setRoadmapModules(modules);
    } catch (err) {
      console.error("Error fetching roadmap:", err);
    } finally {
      setRoadmapLoading(false);
    }
  };

  useEffect(() => {
    fetchRoadmap();
  }, [companyId, deptId, userId]);

  const completedModulesCount = roadmapModules.filter((m) => m.completed && m.quizPassed).length;
  const totalQuizAttempts = roadmapModules.reduce(
    (sum, m) => sum + (m.quizAttempts ?? 0),
    0
  );

  const getModuleStartDate = (module) => {
    const raw = module.startedAt || module.FirstTimeCreatedAt || module.createdAt;
    if (!raw) return null;
    return raw.toDate ? raw.toDate() : new Date(raw);
  };

  const getRemainingTimeLabel = (module) => {
    if (module.completed && module.quizPassed) return "Completed";
    const startDate = getModuleStartDate(module);
    if (!startDate || !module.estimatedDays) return "Unknown";
    const deadline = new Date(startDate.getTime() + module.estimatedDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diffMs = deadline - now;
    if (diffMs <= 0) return "Expired";
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return days > 0 ? `${days}d ${hours}h remaining` : `${hours}h remaining`;
  };

  const setStatus = (moduleId, status) => {
    setActionStatus(prev => ({ ...prev, [moduleId]: status }));
  };

  const setActionLoadingForModule = (moduleId, isLoading) => {
    setActionLoading(prev => ({ ...prev, [moduleId]: isLoading }));
  };

  const parseApiResponse = async (response, fallbackMessage) => {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || fallbackMessage);
      return data;
    }

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(rawText || fallbackMessage);
    }

    throw new Error("Server returned invalid response format. Please verify backend is running on port 5000.");
  };

  const handleRegenerate = async (moduleId) => {
    try {
      setActionLoadingForModule(moduleId, true);
      setStatus(moduleId, "Regenerating roadmap...");

      const shouldResolveNotification =
        notificationIdFromQuery && (!moduleIdFromQuery || moduleIdFromQuery === moduleId);

      const res = await fetch("http://localhost:5000/api/roadmap/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          deptId,
          userId,
          moduleId,
          notificationId: shouldResolveNotification ? notificationIdFromQuery : undefined,
        })
      });
      const data = await parseApiResponse(res, "Regeneration failed");
      
      // Find module title
      const module = roadmapModules.find(m => m.id === moduleId);
      const moduleTitle = module?.moduleTitle || "Module";
      
      // Send email to user
      if (user?.email) {
        try {
          await fetch("http://localhost:5000/api/email/admin-regenerated-roadmap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userEmail: user.email,
              userName: user.displayName || user.name || "User",
              moduleTitle,
              companyName: user.companyName || "Company",
              companyEmail: company?.email || "admin@company.com"
            })
          });
        } catch (emailErr) {
          console.warn("Email send failed (non-blocking):", emailErr);
        }
      }
      
      setStatus(moduleId, "Roadmap regenerated based on weaknesses.");
      await fetchRoadmap();
    } catch (err) {
      setStatus(moduleId, err.message || "Regeneration failed");
    } finally {
      setActionLoadingForModule(moduleId, false);
    }
  };

  const handleAdminUnlock = async (moduleId) => {
    try {
      setActionLoadingForModule(moduleId, true);
      setStatus(moduleId, "Unlocking module...");

      const shouldResolveNotification =
        notificationIdFromQuery && (!moduleIdFromQuery || moduleIdFromQuery === moduleId);

      const res = await fetch("http://localhost:5000/api/quiz/admin-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          deptId,
          userId,
          moduleId,
          notificationId: shouldResolveNotification ? notificationIdFromQuery : undefined,
        })
      });
      const data = await parseApiResponse(res, "Unlock failed");
      
      // Find module title
      const module = roadmapModules.find(m => m.id === moduleId);
      const moduleTitle = module?.moduleTitle || "Module";
      
      // Send email to user
      if (user?.email) {
        try {
          await fetch("http://localhost:5000/api/email/admin-granted-attempts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userEmail: user.email,
              userName: user.displayName || user.name || "User",
              moduleTitle,
              attemptsGranted: data.attemptsGranted || 1,
              companyName: user.companyName || "Company",
              companyEmail: company?.email || "admin@company.com"
            })
          });
        } catch (emailErr) {
          console.warn("Email send failed (non-blocking):", emailErr);
        }
      }
      
      setStatus(moduleId, `Module unlocked. Max attempts now ${data.maxAttemptsOverride}.`);
      await fetchRoadmap();
    } catch (err) {
      setStatus(moduleId, err.message || "Unlock failed");
    } finally {
      setActionLoadingForModule(moduleId, false);
    }
  };

  if (loading) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar stays as it is */}
      <CompanySidebar companyId={companyId}/>

      {/* Main content loading area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
        {/* Rotating hourglass */}
        <svg
          className="animate-spin h-8 w-8 text-[#00FFFF]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="M12 2C6.477 2 2 6.477 2 12h2a8 8 0 0116 0h2c0-5.523-4.477-10-10-10zm0 20c5.523 0 10-4.477 10-10h-2a8 8 0 01-16 0H2c0 5.523 4.477 10 10 10z"
          />
        </svg>

        <p className="text-base font-medium text-white">
          Loading User Profile...
        </p>
      </div>
    </div>
  );
}
if (!user) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white items-center justify-center">
      <p className="text-2xl font-semibold">No user found</p>
    </div>
  );
} 
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={user.companyName} />

      <div className="flex-1 p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Top Bar: Back Button on Left | CV, Status on Right */}
          <div className="flex items-center justify-between gap-3">
            <button 
              onClick={() => window.history.back()} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-[#00FFFF]/10 transition text-[#AFCBE3] font-medium whitespace-nowrap"
            >
              ← Back to Users
            </button>
            <div className="flex gap-3 flex-col md:flex-row">
              {user.cvUrl && (
                <a
                  href={user.cvUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold hover:opacity-90 transition flex items-center justify-center"
                >
                  Download CV
                </a>
              )}
              <div className="px-3 py-2 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-center">
                <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Status</p>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-0.5
                  ${user.status === "active"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"}
                `}>
                  {user.status}
                </span>
              </div>
            </div>
          </div>

          {/* Header Section */}
          <div className="rounded-2xl border border-[#00FFFF30] bg-[#021B36]/80 shadow-lg p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                {/* Avatar */}
                <div className="w-24 h-24 rounded-full bg-[#031C3A] border-3 border-[#00FFFF] flex items-center justify-center text-4xl font-bold text-[#00FFFF] flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>

                {/* Name and Quick Info */}
                <div>
                  <h1 className="text-3xl font-bold text-[#00FFFF]">{user.name}</h1>
                  <p className="text-[#AFCBE3] mt-2">{user.email}</p>
                  <p className="text-[#AFCBE3]">{user.phone}</p>
                </div>
              </div>

              {/* Right Side: Username, Progress, Training On */}
              <div className="flex flex-col gap-3 w-full md:w-auto">
                {/* Row: Username on left, Progress and Training On stacked on right */}
                <div className="grid grid-cols-1 gap-3">
                  
                  
                  {/* Stacked column for Progress and Training On */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="px-3 py-2 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-center text-sm">
                      <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Progress</p>
                      <p className="font-semibold text-[#00FFFF] mt-1">{user.progress || 0}%</p>
                    </div>
                    <div className="px-3 py-2 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-center text-sm">
                      <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Training On</p>
                      <p className="font-semibold text-[#00FFFF] mt-1 truncate">{user.trainingOn || "N/A"}</p>
                    </div>
                    <div className="px-3 py-2 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-center text-sm">
                      <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Modules Completed</p>
                      <p className="font-semibold text-[#00FFFF] mt-1">
                        {completedModulesCount} / {roadmapModules.length}
                      </p>
                    </div>
                    <div className="px-3 py-2 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-center text-sm">
                      <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Quiz Attempts</p>
                      <p className="font-semibold text-[#00FFFF] mt-1">{totalQuizAttempts}</p>
                    </div>
                    
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Training Stats */}
          <div className="rounded-2xl border border-[#00FFFF22] bg-[#021B36]/70 p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xl font-semibold text-[#00FFFF]">Training Statistics</h2>
              <p className="text-sm italic text-[#AFCBE3]">(Level: {user.trainingLevel || "N/A"})</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Active Days", value: user.trainingStats?.activeDays },
                { label: "Current Streak", value: user.trainingStats?.currentStreak },
                { label: "Missed Days", value: user.trainingStats?.missedDays },
                { label: "Expected Days", value: user.trainingStats?.totalExpectedDays },
              ].map((item, i) => (
                <div key={i} className="p-4 bg-[#031C3A]/70 rounded-lg border border-[#00FFFF30] text-center">
                  <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">{item.label}</p>
                  <p className="text-2xl font-bold text-[#00FFFF] mt-2">{item.value ?? 0}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Training Roadmap Section */}
          <div className="rounded-2xl border border-[#00FFFF22] bg-[#021B36]/70 p-5 md:p-6">
            <h2 className="text-xl font-semibold text-[#00FFFF] mb-4">Training Roadmap</h2>

            {roadmapModules.some(m => m.quizLocked || m.moduleLocked) && (
              <div className="mb-6 p-5 rounded-2xl border-2 border-[#00FFFF] bg-[#021B36]/90 shadow-[0_0_18px_rgba(0,255,255,0.25)]">
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-[#00FFFF]/15 text-[#00FFFF]">Action Required</span>
                  <h3 className="text-[#00FFFF] font-semibold">Locked Quiz Actions</h3>
                </div>
                <div className="space-y-4">
                  {roadmapModules.filter(m => m.quizLocked || m.moduleLocked).map((m) => (
                    <div key={m.id} className="p-4 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <div className="text-white font-semibold">Module {m.order}: {m.moduleTitle}</div>
                          <div className="text-xs text-[#AFCBE3] mt-1">
                            Quiz locked • Remaining time: {getRemainingTimeLabel(m)}
                          </div>
                        </div>

                        <div>
                          <button
                            onClick={() => setExpandedActions(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                            className="px-3 py-2 text-xs font-semibold rounded-lg border border-[#00FFFF] text-[#00FFFF] hover:bg-[#00FFFF]/10"
                          >
                            {expandedActions[m.id] ? "Hide Options" : "Show Options"}
                          </button>
                        </div>
                      </div>

                      {expandedActions[m.id] && (
                        <div className="mt-4 space-y-3">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <button
                              onClick={() => {
                                setSelectedAction(prev => ({ ...prev, [m.id]: "regenerate" }));
                                alert("Selected: Regenerate Roadmap based on weaknesses");
                              }}
                              className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                                selectedAction[m.id] === "regenerate"
                                  ? "border-[#00FFFF] bg-[#00FFFF]/10 text-[#00FFFF]"
                                  : "border-[#00FFFF30] text-[#AFCBE3]"
                              }`}
                            >
                              Regenerate Roadmap (Weakness)
                            </button>
                            <button
                              onClick={() => {
                                setSelectedAction(prev => ({ ...prev, [m.id]: "unlock" }));
                                alert("Selected: Give final retry (unlock)");
                              }}
                              className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                                selectedAction[m.id] === "unlock"
                                  ? "border-[#00FFFF] bg-[#00FFFF]/10 text-[#00FFFF]"
                                  : "border-[#00FFFF30] text-[#AFCBE3]"
                              }`}
                            >
                              Give Final Retry
                            </button>
                          </div>

                          {selectedAction[m.id] === "regenerate" && (
                            <button
                              onClick={() => handleRegenerate(m.id)}
                              disabled={actionLoading[m.id]}
                              className="px-3 py-2 text-xs font-semibold rounded-lg border border-[#00FFFF] text-[#00FFFF] hover:bg-[#00FFFF]/10 disabled:opacity-50"
                            >
                              Confirm Regenerate
                            </button>
                          )}

                          {selectedAction[m.id] === "unlock" && (
                            <button
                              onClick={() => handleAdminUnlock(m.id)}
                              disabled={actionLoading[m.id]}
                              className="px-3 py-2 text-xs font-semibold rounded-lg bg-[#00FFFF] text-[#031C3A] hover:opacity-90 disabled:opacity-50"
                            >
                              Confirm Final Retry
                            </button>
                          )}
                        </div>
                      )}

                      {actionStatus[m.id] && (
                        <div className="mt-3 text-xs text-[#AFCBE3]">
                          {actionStatus[m.id]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {roadmapLoading ? (
              <div className="flex items-center justify-center py-8">
                <svg
                  className="animate-spin h-6 w-6 text-[#00FFFF]"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    fill="currentColor"
                    d="M12 2C6.477 2 2 6.477 2 12h2a8 8 0 0116 0h2c0-5.523-4.477-10-10-10zm0 20c5.523 0 10-4.477 10-10h-2a8 8 0 01-16 0H2c0 5.523 4.477 10 10 10z"
                  />
                </svg>
                <p className="text-[#AFCBE3] ml-3">Loading roadmap...</p>
              </div>
            ) : roadmapModules.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-yellow-400 font-medium">Roadmap not generated yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[#AFCBE3] border-b border-[#00FFFF30] bg-[#031C3A]/60">
                      <th className="px-4 py-3 text-left font-semibold">Module</th>
                      <th className="px-4 py-3 text-left font-semibold">Skills To be Covered</th>
                      <th className="px-4 py-3 text-center font-semibold">Days</th>
                      <th className="px-4 py-3 text-center font-semibold">Status</th>
                      <th className="px-4 py-3 text-center font-semibold">Quiz Overview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roadmapModules.map((m) => (
                      <tr key={m.id} className="border-b border-[#00FFFF10] hover:bg-[#031C3A]/40 transition">
                        <td className="px-4 py-4 font-semibold text-white">
                          Module {m.order}: {m.moduleTitle}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                              {expandedSkills[m.id]
                                ? m.skillsCovered?.map((s, i) => (
                                    <span key={i} className="px-2 py-1 bg-[#00FFFF]/10 border border-[#00FFFF30] rounded text-xs text-[#AFCBE3]">
                                      {s}
                                    </span>
                                  ))
                                : m.skillsCovered?.slice(0, 3).map((s, i) => (
                                    <span key={i} className="px-2 py-1 bg-[#00FFFF]/10 border border-[#00FFFF30] rounded text-xs text-[#AFCBE3]">
                                      {s}
                                    </span>
                                  ))}
                            </div>
                            {m.skillsCovered?.length > 3 && (
                              <button
                                onClick={() => setExpandedSkills(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                                className="text-left px-2 py-1 text-xs text-[#00FFFF] hover:text-[#00e5e5] font-medium transition"
                              >
                                {expandedSkills[m.id] ? "← View Less" : `View More (+${m.skillsCovered.length - 3})`}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-center text-white font-medium">{m.estimatedDays} days</td>

                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold
                            ${m.completed && m.quizPassed
                              ? "bg-green-500/20 text-green-400"
                              : "bg-yellow-500/20 text-yellow-400"}
                          `}>
                            {m.completed && m.quizPassed ? "✓ Completed" : "Pending"}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col gap-1 text-xs">

                            {/* Quiz Generated */}
                            <span className={`px-2 py-1 rounded-full font-semibold
                              ${m.quizGenerated
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-gray-500/20 text-gray-400"}
                            `}>
                              {m.quizGenerated ? "Quiz Generated" : "No Quiz"}
                            </span>

                            {/* Attempts */}
                            <span className="text-[#AFCBE3]">
                              Attempts: <strong>{m.quizAttempts ?? 0}</strong>
                            </span>

                            {/* Passed / Failed */}
                            {m.quizGenerated && (
                              <span className={`font-semibold
                                ${m.quizPassed ? "text-green-400" : "text-red-400"}
                              `}>
                                {m.quizPassed ? "✓ Passed" : "✗ Not Passed"}
                              </span>
                            )}

                          </div>
                        </td>
                      </tr>

                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

