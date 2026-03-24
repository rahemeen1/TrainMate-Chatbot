//UserProfile.jsx
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase"; 
import CompanySidebar from "./CompanySidebar"; 
import CompanyPageLoader from "./CompanyPageLoader";
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
  const [notificationMeta, setNotificationMeta] = useState(null);
  const [notificationResolveLoading, setNotificationResolveLoading] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const notificationIdFromQuery = searchParams.get("notificationId") || "";
  const moduleIdFromQuery = searchParams.get("moduleId") || "";

  useEffect(() => {
    const loadNotificationMeta = async () => {
      if (!companyId || !notificationIdFromQuery) {
        setNotificationMeta(null);
        return;
      }

      try {
        const res = await fetch(
          `http://localhost:5000/api/company/notifications/${companyId}?status=all&types=module_lock,training_completion`
        );
        const data = await res.json();
        if (!res.ok) return;

        const matched = (data.notifications || []).find((n) => n.id === notificationIdFromQuery) || null;
        setNotificationMeta(matched);
      } catch (err) {
        console.warn("Failed to load notification context:", err.message);
      }
    };

    loadNotificationMeta();
  }, [companyId, notificationIdFromQuery]);

  const resolveNotification = async (action = "approved") => {
    if (!companyId || !notificationIdFromQuery) return;
    try {
      setNotificationResolveLoading(true);
      const res = await fetch(
        `http://localhost:5000/api/company/notifications/module-lock/${companyId}/${notificationIdFromQuery}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, adminNote: "Reviewed from user profile" }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to resolve notification");

      setNotificationMeta((prev) => (prev ? { ...prev, status: action } : prev));
    } catch (err) {
      alert(err.message || "Failed to resolve notification");
    } finally {
      setNotificationResolveLoading(false);
    }
  };
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

  const isModuleCompleted = (module) => {
    const status = String(module?.status || "").toLowerCase();
    if (status === "expired") return false;
    return status === "completed" || !!module?.completed || !!module?.quizPassed;
  };

  const completedModulesCount = roadmapModules.filter((m) => isModuleCompleted(m)).length;
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
    if (isModuleCompleted(module)) return "Completed";
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

      <CompanyPageLoader message="Loading User Profile..." />
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
    <div className="company-page-shell flex min-h-screen">
      <CompanySidebar companyId={companyId} companyName={user.companyName} />

      <div className="company-main-content flex-1 md:p-8 lg:p-10">
        <div className="company-container space-y-6">
          <style>{`
            @keyframes profileFloatIn {
              0% { opacity: 0; transform: translateY(16px); }
              100% { opacity: 1; transform: translateY(0); }
            }

            .profile-shell-enter {
              animation: profileFloatIn 520ms ease-out both;
            }

            .profile-shell-delay-1 { animation-delay: 80ms; }
            .profile-shell-delay-2 { animation-delay: 150ms; }

            .profile-pill-card {
              transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
            }

            .profile-pill-card:hover {
              transform: translateY(-3px);
              border-color: rgba(0,255,255,0.45);
              box-shadow: 0 12px 22px rgba(0,255,255,0.14);
            }

            .profile-module-card {
              transition: transform 220ms ease, border-color 220ms ease;
            }

            .profile-module-card:hover {
              transform: translateY(-2px);
              border-color: rgba(0,255,255,0.35);
            }

            .profile-metric-card {
              border: 1px solid rgba(0, 255, 255, 0.18);
              background: linear-gradient(180deg, rgba(5, 37, 70, 0.78), rgba(3, 28, 58, 0.9));
              border-radius: 0.75rem;
              padding: 0.8rem 0.65rem;
              text-align: center;
              min-height: 78px;
              transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
            }

            .profile-metric-card:hover {
              transform: translateY(-2px);
              border-color: rgba(0, 255, 255, 0.45);
              box-shadow: 0 10px 18px rgba(0, 255, 255, 0.12);
            }

            .profile-metric-label {
              font-size: 10.5px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #AFCBE3;
            }

            .profile-metric-value {
              margin-top: 0.4rem;
              font-size: 1rem;
              font-weight: 700;
              color: #EAF8FF;
              line-height: 1.15;
            }

            .profile-metric-subvalue {
              margin-top: 0.4rem;
              font-size: 0.78rem;
              font-weight: 600;
              line-height: 1.2;
            }
          `}</style>

          {notificationMeta?.type === "training_completion" && notificationMeta?.status === "pending" && (
            <div className="profile-shell-enter rounded-2xl border border-emerald-400/35 bg-[#0A3A47]/30 p-4 md:p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-emerald-300 font-semibold">Training Completion Notification</p>
                  <p className="text-[#CFE8FF] text-sm mt-1">
                    This learner completed training and unlocked certificate with score {typeof notificationMeta?.score === "number" ? `${notificationMeta.score}%` : "N/A"}.
                  </p>
                </div>
                <button
                  onClick={() => resolveNotification("approved")}
                  disabled={notificationResolveLoading}
                  className="company-primary-btn text-sm disabled:opacity-60"
                >
                  {notificationResolveLoading ? "Updating..." : "Mark as Read"}
                </button>
              </div>
            </div>
          )}

          <div className="profile-shell-enter profile-shell-delay-1 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => window.history.back()}
              className="company-outline-btn"
            >
              Back to Users
            </button>

            <div className="flex gap-3 flex-col sm:flex-row w-full sm:w-auto">
              {user.cvUrl && (
                <a
                  href={user.cvUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="company-primary-btn text-center"
                >
                  Download CV
                </a>
              )}
              <div className="rounded-xl border border-[#00FFFF30] bg-[#021B36]/75 px-3 py-2 min-w-[120px] text-center">
                <p className="text-[11px] uppercase tracking-wide text-[#AFCBE3]">Status</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  user.status === "active" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                }`}>
                  {user.status}
                </span>
              </div>
            </div>
          </div>

          <section className="profile-shell-enter profile-shell-delay-1 company-card rounded-3xl p-6 md:p-8 border-[#00FFFF2E] bg-[radial-gradient(circle_at_12%_18%,rgba(0,255,255,0.12),transparent_32%),rgba(2,27,54,0.88)]">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="flex gap-5 items-center">
                <div className="w-24 h-24 rounded-3xl bg-[#072544] border border-[#00FFFF60] flex items-center justify-center text-4xl font-bold text-[#00FFFF]">
                  {user.name.charAt(0).toUpperCase()}
                </div>

                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-[#E8F7FF] tracking-tight">{user.name}</h1>
                  <p className="mt-2 text-[#B8D4E8]">{user.email}</p>
                  <p className="text-[#9EC3DA]">{user.phone || "N/A"}</p>
                  <p className="text-xs mt-2 uppercase tracking-wide text-[#AFCBE3]">{user.trainingOn || "N/A"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full lg:w-[540px]">
                <div className="profile-pill-card rounded-xl border border-[#00FFFF2D] bg-[#031C3A]/65 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-[#AFCBE3]">Progress</p>
                  <p className="mt-1 text-lg font-semibold text-[#00FFFF]">{user.progress || 0}%</p>
                </div>
                <div className="profile-pill-card rounded-xl border border-[#00FFFF2D] bg-[#031C3A]/65 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-[#AFCBE3]">Modules</p>
                  <p className="mt-1 text-lg font-semibold text-[#00FFFF]">{completedModulesCount}/{roadmapModules.length}</p>
                </div>
                <div className="profile-pill-card rounded-xl border border-[#00FFFF2D] bg-[#031C3A]/65 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-[#AFCBE3]">Quiz Attempts</p>
                  <p className="mt-1 text-lg font-semibold text-[#00FFFF]">{totalQuizAttempts}</p>
                </div>
                <div className="profile-pill-card rounded-xl border border-[#00FFFF2D] bg-[#031C3A]/65 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-[#AFCBE3]">Certificate</p>
                  <p className={`mt-1 text-sm font-semibold ${user.certificateUnlocked ? "text-emerald-400" : "text-yellow-300"}`}>
                    {user.certificateUnlocked ? "Unlocked" : "Locked"}
                  </p>
                </div>
                <div className="profile-pill-card rounded-xl border border-[#00FFFF2D] bg-[#031C3A]/65 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-[#AFCBE3]">Final Score</p>
                  <p className="mt-1 text-lg font-semibold text-[#00FFFF]">
                    {typeof user.certificateFinalQuizScore === "number" ? `${Math.round(user.certificateFinalQuizScore)}%` : "N/A"}
                  </p>
                </div>
                <div className="profile-pill-card rounded-xl border border-[#00FFFF2D] bg-[#031C3A]/65 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-[#AFCBE3]">Level</p>
                  <p className="mt-1 text-sm font-semibold text-[#D4F3FF]">{user.trainingLevel || "N/A"}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="profile-shell-enter profile-shell-delay-2 company-card p-5 md:p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-xl font-semibold text-[#00FFFF]">Training Statistics</h2>
              <p className="text-sm text-[#AFCBE3]">Level: {user.trainingLevel || "N/A"}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Active Days", value: user.trainingStats?.activeDays },
                { label: "Current Streak", value: user.trainingStats?.currentStreak },
                { label: "Missed Days", value: user.trainingStats?.missedDays },
                { label: "Expected Days", value: user.trainingStats?.totalExpectedDays },
              ].map((item, i) => (
                <div key={i} className="profile-pill-card rounded-xl border border-[#00FFFF30] bg-[#031C3A]/65 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-[#AFCBE3]">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold text-[#00FFFF]">{item.value ?? 0}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="profile-shell-enter profile-shell-delay-2 company-card p-5 md:p-6">
            <h2 className="text-xl font-semibold text-[#00FFFF] mb-4">Training Roadmap</h2>

            {roadmapModules.some((m) => m.quizLocked || m.moduleLocked) && (
              <div className="mb-6 rounded-2xl border border-[#00FFFF55] bg-[#031C3A]/70 p-4 md:p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-[#00FFFF]/15 text-[#00FFFF]">Action Required</span>
                  <h3 className="text-[#00FFFF] font-semibold">Locked Quiz Actions</h3>
                </div>

                <div className="space-y-3">
                  {roadmapModules.filter((m) => m.quizLocked || m.moduleLocked).map((m) => (
                    <div key={m.id} className="rounded-xl border border-[#00FFFF2D] bg-[#021B36]/75 p-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">Module {m.order}: {m.moduleTitle}</p>
                          <p className="text-xs text-[#AFCBE3] mt-1">Quiz locked | Remaining time: {getRemainingTimeLabel(m)}</p>
                        </div>
                        <button
                          onClick={() => setExpandedActions((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                          className="company-outline-btn text-xs"
                        >
                          {expandedActions[m.id] ? "Hide Options" : "Show Options"}
                        </button>
                      </div>

                      {expandedActions[m.id] && (
                        <div className="mt-4 space-y-3">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <button
                              onClick={() => {
                                setSelectedAction((prev) => ({ ...prev, [m.id]: "regenerate" }));
                                alert("Selected: Regenerate Roadmap based on weaknesses");
                              }}
                              className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                                selectedAction[m.id] === "regenerate"
                                  ? "border-[#00FFFF] bg-[#00FFFF]/10 text-[#00FFFF]"
                                  : "border-[#00FFFF30] text-[#AFCBE3]"
                              }`}
                            >
                              Regenerate Roadmap
                            </button>

                            <button
                              onClick={() => {
                                setSelectedAction((prev) => ({ ...prev, [m.id]: "unlock" }));
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
                              className="company-outline-btn text-xs disabled:opacity-50"
                            >
                              Confirm Regenerate
                            </button>
                          )}

                          {selectedAction[m.id] === "unlock" && (
                            <button
                              onClick={() => handleAdminUnlock(m.id)}
                              disabled={actionLoading[m.id]}
                              className="company-primary-btn text-xs disabled:opacity-50"
                            >
                              Confirm Final Retry
                            </button>
                          )}

                          {actionStatus[m.id] && (
                            <p className="text-xs text-[#AFCBE3]">{actionStatus[m.id]}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {roadmapLoading ? (
              <div className="py-8 flex items-center justify-center gap-3 text-[#AFCBE3]">
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
                Loading roadmap...
              </div>
            ) : roadmapModules.length === 0 ? (
              <div className="py-8 text-center text-yellow-400 font-medium">Roadmap not generated yet.</div>
            ) : (
              <div className="space-y-4">
                {roadmapModules.map((m) => (
                  <article key={m.id} className="profile-module-card rounded-xl border border-[#00FFFF22] bg-[#031C3A]/60 p-4 md:p-5">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="space-y-2">
                        <h3 className="text-white font-semibold">
                          Module {m.order}: {m.moduleTitle}
                          <span className="ml-2 text-[#00FFFF] italic font-medium text-xs">- {m.estimatedDays || 0} days</span>
                        </h3>

                        <div className="flex flex-wrap gap-2">
                          {(expandedSkills[m.id] ? m.skillsCovered : m.skillsCovered?.slice(0, 4))?.map((s, i) => (
                            <span key={i} className="px-2 py-1 rounded-md text-xs border border-[#00FFFF30] bg-[#00FFFF0F] text-[#AFCBE3]">
                              {s}
                            </span>
                          ))}
                        </div>

                        {m.skillsCovered?.length > 4 && (
                          <button
                            onClick={() => setExpandedSkills((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                            className="text-xs text-[#00FFFF] hover:text-[#90F7FF]"
                          >
                            {expandedSkills[m.id] ? "View Less" : `View More (+${m.skillsCovered.length - 4})`}
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 min-w-[320px] md:min-w-[360px]">
                        <div className="profile-metric-card">
                          <p className="profile-metric-label">Status</p>
                          <div className="profile-metric-subvalue flex items-center justify-center">
                            <span className={`text-center ${
                              isModuleCompleted(m) ? "text-emerald-300" : "text-yellow-300"
                            }`}>
                              {isModuleCompleted(m) ? "Completed" : "Pending"}
                            </span>
                          </div>
                        </div>

                        <div className="profile-metric-card">
                          <p className="profile-metric-label">Quiz</p>
                          <div className="profile-metric-subvalue flex items-center justify-center">
                            <span className={`text-center ${
                              m.quizGenerated ? "text-blue-300" : "text-slate-300"
                            }`}>
                              {m.quizGenerated ? "Generated" : "Not Generated"}
                            </span>
                          </div>
                        </div>

                        <div className="profile-metric-card">
                          <p className="profile-metric-label">Attempts</p>
                          <p className="profile-metric-value">{m.quizAttempts ?? 0}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

