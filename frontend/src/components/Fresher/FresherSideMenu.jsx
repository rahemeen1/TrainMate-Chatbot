import { useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useState } from "react";

export function FresherSideMenu({ userId, companyId, deptId, companyName }) {
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
        onClick={() =>
          navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`)
        }
        className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition font-medium"
      >
        RoadMap
      </button>
       <button
        onClick={() =>
          navigate("/chatbot", { state: { userId, companyId, deptId, companyName, email } })}
        className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition font-medium"
      >
        Training Assistant
      </button>

      <button
        onClick={() =>
          navigate("/fresher-progress", { state: { userId, companyId, deptId, companyName } })
        }
        className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition font-medium"
      >
        Progress
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
