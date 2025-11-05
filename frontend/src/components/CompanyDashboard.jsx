import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";

export default function CompanyDashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  // Get username/company name from state
  const companyName = location.state?.username || "Admin";

  // Redirect to login if no state passed (not logged in)
  useEffect(() => {
    if (!location.state) {
      navigate("/", { replace: true });
    }
  }, [location.state, navigate]);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-[#031C3A] text-white">
      {/* Sidebar */}
      <div
        className={`flex flex-col bg-[#021B36] w-64 p-6 space-y-6 ${
          sidebarOpen ? "block" : "hidden"
        }`}
      >
        <h2 className="text-2xl font-bold text-[#00FFFF] mb-6">{companyName}</h2>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 py-2 px-4 bg-red-600 rounded-lg hover:bg-red-700 transition"
        >
          <LogOut size={18} />
          Logout
        </button>

        <button
          onClick={() => alert("Settings clicked!")}
          className="flex items-center gap-2 py-2 px-4 bg-[#00FFFF]/20 rounded-lg hover:bg-[#00FFFF]/30 transition"
        >
          <Settings size={18} />
          Settings
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center items-center p-6">
        <h1 className="text-4xl font-bold text-[#00FFFF] mb-4 text-center">
          Welcome, {companyName}!
        </h1>
        <p className="text-[#AFCBE3] text-lg mb-8 text-center">
          You are now logged into your Company Dashboard.
        </p>

        {/* Dashboard content */}
        <div className="w-full max-w-4xl">
          <div className="bg-[#021B36]/70 rounded-xl p-6 shadow-lg border border-[#00FFFF30]">
            <h2 className="text-2xl font-semibold text-[#00FFFF] mb-3">
              Dashboard Overview
            </h2>
            <p className="text-[#AFCBE3]">
              This is where you can manage your company, view fresher registrations, and more.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
