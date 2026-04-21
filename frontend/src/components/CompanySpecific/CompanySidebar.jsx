import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../../services/api";

const MENU_OPTIONS = [
  { label: "Dashboard", path: "/CompanySpecific/CompanyDashboard" },
  { label: "Manage Departments", path: "/manage-departments" },
  { label: "Manage Users", path: "/CompanySpecific/Manageuser" },
  { label: "Notifications", path: "/CompanySpecific/CompanyNotifications" },
  { label: "Company Details", path: "/CompanySpecific/CompanyDetails" }, 
  { label: "Settings", path: "/CompanySpecific/CompanySettings" },
  { label: "Logout", path: "/" },
];

export default function CompanySidebar({ companyId, companyName, className = "", onItemClick }) {
  const navigate = useNavigate();
  const [pendingNotifications, setPendingNotifications] = useState(0);

  const resolvedCompanyId = useMemo(
    () => companyId || localStorage.getItem("companyId") || "",
    [companyId]
  );

  const resolvedCompanyName = useMemo(
    () => companyName || localStorage.getItem("companyName") || "Company",
    [companyName]
  );

  useEffect(() => {
    if (!resolvedCompanyId) return;

    let isMounted = true;

    const fetchPendingNotifications = async () => {
      try {
        const response = await fetch(
          apiUrl(`/api/company/notifications/module-lock/${resolvedCompanyId}?status=pending`)
        );
        const data = await response.json();
        if (!response.ok) return;
        if (isMounted) {
          setPendingNotifications(Array.isArray(data.notifications) ? data.notifications.length : 0);
        }
      } catch (err) {
      }
    };

    fetchPendingNotifications();
    const intervalId = setInterval(fetchPendingNotifications, 30000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [resolvedCompanyId]);

  const handleNavigation = (opt) => {
    if (opt.label === "Logout") {
      const confirmed = window.confirm("Do you really want to logout?");
      if (confirmed) {
        navigate("/");
        onItemClick?.();
      }
    } else {
      navigate(opt.path, {
        state: { companyId: resolvedCompanyId, companyName: resolvedCompanyName },
      });
      onItemClick?.();
    }
  };

  return (
    <div className={`w-full bg-[#021B36]/90 flex flex-col p-4 shadow-lg ${className}`}>
      {/* Logo */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto bg-[#00FFFF]/20 rounded-2xl flex items-center justify-center shadow-[0_0_18px_#00FFFF50] border border-[#00FFFF30]">
          <span className="text-[#00FFFF] font-extrabold text-xl">TM</span>
        </div>
        <h1 className="text-[#00FFFF] font-bold text-xl mt-1">TrainMate</h1>
        <p className="text-[11px] text-[#8A97A8] mt-0.5 truncate px-2" title={resolvedCompanyName}>
          {resolvedCompanyName}
        </p>
      </div>

      {/* Menu */}
      <div className="flex flex-col gap-2">
        {MENU_OPTIONS.map((opt) => (
          <button
            key={opt.path}
            onClick={() => handleNavigation(opt)}
            className={`text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition font-medium flex items-center justify-between gap-2 ${
              opt.label === "Logout" ? "text-red-400" : "text-[#AFCBE3]"
            }`}
          >
            <span>{opt.label}</span>
            {opt.label === "Notifications" && pendingNotifications > 0 && (
              <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-[#00FFFF] text-[#031C3A] text-xs font-bold flex items-center justify-center">
                {pendingNotifications > 9 ? "9+" : pendingNotifications}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
