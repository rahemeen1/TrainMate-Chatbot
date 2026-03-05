import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CompanySidebar from "./CompanySidebar";

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
      const res = await fetch(`http://localhost:5000/api/company/notifications/module-lock/${companyId}?status=pending`);
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
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="flex-1 p-6 md:p-8">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
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
            <p className="text-base font-medium text-white">Loading Notifications...</p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="rounded-2xl border border-[#00FFFF30] bg-[#021B36]/80 shadow-lg p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-[#00FFFF]">Admin Notifications</h1>
                  <p className="text-[#AFCBE3] mt-2 text-sm">
                    Review locked-quiz alerts and open the fresher profile to take action.
                  </p>
                </div>
                <button
                  onClick={loadNotifications}
                  className="px-4 py-2 rounded-lg border border-[#00FFFF] text-[#00FFFF] font-semibold hover:bg-[#00FFFF]/10"
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
              <div className="rounded-2xl border border-[#00FFFF30] bg-[#021B36]/70 p-6 text-[#AFCBE3]">
                No pending notifications.
              </div>
            ) : (
              <div className="space-y-4">
                {notifications.map((n) => (
                  <div key={n.id} className="rounded-2xl border border-[#00FFFF30] bg-[#021B36]/80 p-5 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-[#00FFFF]/15 text-[#00FFFF]">
                            Action Required
                          </span>
                          <h3 className="text-lg font-semibold text-[#00FFFF]">Module Lock Alert</h3>
                        </div>

                        <p className="text-[#AFCBE3] text-sm">{n.message}</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <p><span className="text-[#AFCBE3]">User:</span> {n.userName || "Unknown"}</p>
                          <p><span className="text-[#AFCBE3]">Email:</span> {n.userEmail || "Unknown"}</p>
                          <p><span className="text-[#AFCBE3]">Module:</span> {n.moduleTitle || n.moduleId}</p>
                          <p><span className="text-[#AFCBE3]">Attempt:</span> {n.attemptNumber || "N/A"}</p>
                          <p><span className="text-[#AFCBE3]">Score:</span> {typeof n.score === "number" ? `${n.score}%` : "N/A"}</p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <button
                          onClick={() => handleViewProfile(n)}
                          className="px-4 py-2 rounded-lg bg-[#00FFFF] text-[#031C3A] font-semibold hover:opacity-90"
                        >
                          View Profile
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
