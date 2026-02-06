import { useNavigate } from "react-router-dom";

const MENU_OPTIONS = [
  { label: "Dashboard", path: "/CompanySpecific/CompanyDashboard" },
  { label: "Manage Departments", path: "/manage-departments" },
  { label: "Manage Users", path: "/CompanySpecific/Manageuser" },,
  { label: "Settings", path: "/CompanySpecific/CompanySettings" },
  { label: "Logout", path: "/" },

];

export default function CompanySidebar({ companyId, companyName }) {
  const navigate = useNavigate();

  const handleNavigation = (opt) => {
    if (opt.label === "Logout") {
      const confirmed = window.confirm("Do you really want to logout?");
      if (confirmed) navigate("/");
    } else {
      navigate(opt.path, {
        state: { companyId, companyName },
      });
    }
  };

  return (
    <div className="w-64 bg-[#021B36]/90 flex flex-col p-4 shadow-lg">
      {/* Logo */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto bg-[#00FFFF]/20 rounded-2xl flex items-center justify-center shadow-[0_0_18px_#00FFFF50] border border-[#00FFFF30]">
          <span className="text-[#00FFFF] font-extrabold text-xl">TM</span>
        </div>
        <h1 className="text-[#00FFFF] font-bold text-xl mt-1">TrainMate</h1>
      </div>

      {/* Menu */}
      <div className="flex flex-col gap-2">
        {MENU_OPTIONS.map((opt) => (
          <button
            key={opt.path}
            onClick={() => handleNavigation(opt)}
            className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition text-[#AFCBE3] font-medium"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
