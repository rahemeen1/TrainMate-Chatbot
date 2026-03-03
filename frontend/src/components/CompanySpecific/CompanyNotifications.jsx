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
  const [actionLoadingId, setActionLoadingId] = useState("");
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

  const handleReject = async (notificationId) => {
    try {
      setActionLoadingId(notificationId);
      const res = await fetch(
        `http://localhost:5000/api/company/notifications/module-lock/${companyId}/${notificationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rejected" }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update notification");
      await loadNotifications();
    } catch (err) {
      setError(err.message || "Failed to update notification");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleApproveFinalRetry = async (notification) => {
    try {
      setActionLoadingId(notification.id);

      const unlockRes = await fetch("http://localhost:5000/api/quiz/admin-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          deptId: notification.deptId,
          userId: notification.userId,
          moduleId: notification.moduleId,
          notificationId: notification.id,
        }),
      });

      const unlockData = await unlockRes.json();
      if (!unlockRes.ok) throw new Error(unlockData?.error || "Failed to grant final retry");

      await loadNotifications();
    } catch (err) {
      setError(err.message || "Failed to grant final retry");
    } finally {
      setActionLoadingId("");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="flex-1 p-6 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-[#00FFFF]">Admin Notifications</h1>
            <button
              onClick={loadNotifications}
              className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded hover:bg-[#00FFFF]/10"
            >
              Refresh
            </button>
          </div>

          {error && (
            <div className="p-3 rounded border border-red-400/40 bg-red-500/10 text-red-300 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-[#AFCBE3]">Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <div className="p-5 rounded-xl border border-[#00FFFF30] bg-[#021B36]/70 text-[#AFCBE3]">
              No pending notifications.
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((n) => (
                <div key={n.id} className="p-5 rounded-xl border border-[#00FFFF30] bg-[#021B36]/80">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-[#00FFFF]">Module Lock Alert</h3>
                      <p className="text-[#AFCBE3] text-sm mt-1">{n.message}</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-sm">
                        <p><span className="text-[#AFCBE3]">User:</span> {n.userName || "Unknown"}</p>
                        <p><span className="text-[#AFCBE3]">Email:</span> {n.userEmail || "Unknown"}</p>
                        <p><span className="text-[#AFCBE3]">Module:</span> {n.moduleTitle || n.moduleId}</p>
                        <p><span className="text-[#AFCBE3]">Attempt:</span> {n.attemptNumber || "N/A"}</p>
                        <p><span className="text-[#AFCBE3]">Score:</span> {typeof n.score === "number" ? `${n.score}%` : "N/A"}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleApproveFinalRetry(n)}
                        disabled={actionLoadingId === n.id}
                        className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold disabled:opacity-60"
                      >
                        {actionLoadingId === n.id ? "Processing..." : "Yes, give final retry"}
                      </button>
                      <button
                        onClick={() => handleReject(n.id)}
                        disabled={actionLoadingId === n.id}
                        className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded disabled:opacity-60"
                      >
                        No
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
