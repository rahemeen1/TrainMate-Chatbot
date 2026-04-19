import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CompanyPageLoader from "./CompanyPageLoader";
import CompanyShellLayout from "./CompanyShellLayout";
import { apiUrl } from "../../services/api";

export default function CompanyNotifications() {
  const location = useLocation();
  const navigate = useNavigate();

  const companyId = location.state?.companyId || localStorage.getItem("companyId") || "";
  const companyName = location.state?.companyName || localStorage.getItem("companyName") || "Company";

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");

  const loadNotifications = async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(apiUrl(`/api/company/notifications/${companyId}?status=pending&types=module_lock,training_completion,training_summary_report`));
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load notifications");
      setNotifications(data.notifications || []);
    } catch (err) {
      setError(err.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) {
      navigate("/", { replace: true });
      return;
    }
    loadNotifications();
  }, [companyId]);

  const handleViewProfile = (notification) => {
    if (!notification?.deptId || !notification?.userId) {
      setError("Missing user details for this notification");
      return;
    }

    navigate(
      `/user-profile/${companyId}/${notification.deptId}/${notification.userId}?notificationId=${encodeURIComponent(notification.id)}&moduleId=${encodeURIComponent(notification.moduleId || "")}`,
      {
        state: {
          companyId,
          companyName,
          notificationId: notification.id,
          moduleId: notification.moduleId || "",
        },
      }
    );
  };

  return (
    <CompanyShellLayout companyId={companyId} companyName={companyName} headerLabel="Notifications">
        {loading ? (
          <CompanyPageLoader message="Loading Notifications..." />
        ) : (
          <div className="company-container space-y-6">
            <div className="company-card p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h1 className="company-title">Admin Notifications</h1>
                  <p className="company-subtitle">
                    Review training alerts and open fresher profiles for details.
                  </p>
                </div>
                <button
                  onClick={loadNotifications}
                  className="company-outline-btn"
                >
                  Refresh
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg border border-red-400/40 bg-red-500/10 text-red-300 text-sm">
                {error}
              </div>
            )}

            {notifications.length === 0 ? (
              <div className="company-card p-6 text-[#AFCBE3]">
                No pending notifications.
              </div>
            ) : (
              <div className="space-y-4">
                {notifications.map((n) => (
                  <div key={n.id} className="company-card p-5 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
                      <div className="space-y-3">
                        {(() => {
                          const isCompletion = n.type === "training_completion";
                          const isSummary = n.type === "training_summary_report";
                          const badgeLabel = isSummary || isCompletion ? "Update" : "Action Required";
                          const title = isSummary
                            ? "Training Summary Report"
                            : isCompletion
                            ? "Training Completed"
                            : "Module Lock Alert";
                          return (
                            <>
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${isCompletion ? "bg-emerald-500/15 text-emerald-300" : "bg-[#00FFFF]/15 text-[#00FFFF]"}`}>
                            {badgeLabel}
                          </span>
                          <h3 className="text-lg font-semibold text-[#00FFFF]">{title}</h3>
                        </div>

                        <p className="text-[#AFCBE3] text-sm">{n.message}</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <p><span className="text-[#AFCBE3]">User:</span> {n.userName || "Unknown"}</p>
                          <p><span className="text-[#AFCBE3]">Email:</span> {n.userEmail || "Unknown"}</p>
                          <p><span className="text-[#AFCBE3]">Department:</span> {n.deptId || "Unknown"}</p>
                          {!isCompletion && !isSummary && <p><span className="text-[#AFCBE3]">Module:</span> {n.moduleTitle || n.moduleId || "N/A"}</p>}
                          {!isCompletion && !isSummary && <p><span className="text-[#AFCBE3]">Attempt:</span> {n.attemptNumber || "N/A"}</p>}
                          {isSummary && <p><span className="text-[#AFCBE3]">Modules:</span> {n?.summary?.completedModules || "N/A"}/{n?.summary?.totalModules || "N/A"}</p>}
                          {isSummary && <p><span className="text-[#AFCBE3]">Total Attempts:</span> {n?.summary?.totalQuizAttempts ?? "N/A"}</p>}
                          <p><span className="text-[#AFCBE3]">Score:</span> {typeof n.score === "number" ? `${n.score}%` : "N/A"}</p>
                        </div>
                            </>
                          );
                        })()}
                      </div>

                      <div className="shrink-0">
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleViewProfile(n)}
                            className="company-primary-btn"
                          >
                            View Profile
                          </button>
                          {n.type === "training_summary_report" && n.reportDownloadUrl && (
                            <a
                              href={n.reportDownloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="company-outline-btn text-center"
                            >
                              Download Report PDF
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
    </CompanyShellLayout>
  );
}
