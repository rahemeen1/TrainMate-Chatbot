import { useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useState } from "react";

export function FresherSideMenu({ userId, companyId, deptId, companyName, roadmapGenerated = false }) {
  const location = useLocation();
  const state = location.state || {};

  const navigate = useNavigate();
const [email, setEmail] = useState(state.email || localStorage.getItem("email"));
console.log(email);
  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to logout?")) {
      await signOut(auth);
      navigate("/"); // Redirect to login
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-3 text-[#AFCBE3]">
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto bg-[#00FFFF]/20 rounded-2xl flex items-center justify-center shadow-[0_0_18px_#00FFFF50] border border-[#00FFFF30]">
          <span className="text-[#00FFFF] font-extrabold text-xl">TM</span>
        </div>
        <h1 className="text-[#00FFFF] font-bold text-xl mt-2">TrainMate</h1>
        <p className="text-sm text-[#AFCBE3] mt-1">{companyName || "Company"}</p>
      </div>

      {/* Fresher routes - pass companyName */}
      <button
        onClick={() =>
          navigate("/fresher-dashboard", { state: { userId, companyId, deptId, companyName } })
        }
        className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition font-medium"
      >
        Dashboard
      </button>

      <button
        onClick={() => {
          if (!roadmapGenerated) return;
          navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`);
        }}
        className={`text-left px-4 py-2 rounded-lg transition font-medium relative group ${
          roadmapGenerated
            ? "hover:bg-[#00FFFF]/20 cursor-pointer text-[#AFCBE3]"
            : "opacity-60 cursor-not-allowed text-[#AFCBE3] bg-gray-500/10"
        }`}
      >
        {!roadmapGenerated && <span className="absolute top-1 left-1 text-xs">🔒</span>}
        <span className={roadmapGenerated ? "" : "ml-2"}>RoadMap</span>
        {!roadmapGenerated && (
          <div className="absolute left-0 top-full mt-1 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] text-xs font-semibold whitespace-nowrap px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none shadow-lg z-50">
            Generate roadmap to unlock
          </div>
        )}
      </button>
       <button
        onClick={() => {
          if (!roadmapGenerated) return;
          navigate("/chatbot", { state: { userId, companyId, deptId, companyName, email } });
        }}
        className={`text-left px-4 py-2 rounded-lg transition font-medium relative group ${
          roadmapGenerated
            ? "hover:bg-[#00FFFF]/20 cursor-pointer text-[#AFCBE3]"
            : "opacity-60 cursor-not-allowed text-[#AFCBE3] bg-gray-500/10"
        }`}
      >
        {!roadmapGenerated && <span className="absolute top-1 left-1 text-xs">🔒</span>}
        <span className={roadmapGenerated ? "" : "ml-2"}>Training Assistant</span>
        {!roadmapGenerated && (
          <div className="absolute left-0 top-full mt-1 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] text-xs font-semibold whitespace-nowrap px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none shadow-lg z-50">
            Generate roadmap to unlock
          </div>
        )}
      </button>

      <button
        onClick={() => {
          if (!roadmapGenerated) return;
          navigate("/fresher-progress", { state: { userId, companyId, deptId, companyName } });
        }}
        className={`text-left px-4 py-2 rounded-lg transition font-medium relative group ${
          roadmapGenerated
            ? "hover:bg-[#00FFFF]/20 cursor-pointer text-[#AFCBE3]"
            : "opacity-60 cursor-not-allowed text-[#AFCBE3] bg-gray-500/10"
        }`}
      >
        {!roadmapGenerated && <span className="absolute top-1 left-1 text-xs">🔒</span>}
        <span className={roadmapGenerated ? "" : "ml-2"}>Progress Details</span>
        {!roadmapGenerated && (
          <div className="absolute left-0 top-full mt-1 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] text-xs font-semibold whitespace-nowrap px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none shadow-lg z-50">
            Generate roadmap to unlock
          </div>
        )}
      </button>

      <button
        onClick={() =>
          navigate("/fresher-settings", { state: { userId, companyId, deptId, companyName } })
        }
        className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition font-medium"
      >
        Settings
      </button>

      <button
        onClick={handleLogout}
        className="mt-4 text-left px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-500 transition font-medium"
      >
        Logout
      </button>
    </div>
  );
}
