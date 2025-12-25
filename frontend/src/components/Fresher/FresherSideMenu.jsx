import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
export function FresherSideMenu({ companyId }) {
  const navigate = useNavigate();
console.log("FresherSideMenu companyId:", companyId);
  const handleLogout = async () => {
    await signOut(auth);
    navigate("/"); // Redirect to login page
  };

  return (
    <div className="flex-1 flex flex-col gap-3 text-[#AFCBE3]">
       <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto bg-[#00FFFF]/20 rounded-2xl flex items-center justify-center shadow-[0_0_18px_#00FFFF50] border border-[#00FFFF30]">
                  <span className="text-[#00FFFF] font-extrabold text-xl">TM</span>
                </div>
                <h1 className="text-[#00FFFF] font-bold text-xl mt-2">TrainMate</h1>
                <p className="text-sm text-[#AFCBE3] mt-1">{companyId}</p>
              </div>
      <button
        onClick={() => navigate("/fresher-dashboard")}
        className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition font-medium"
      >
        Dashboard
      </button>

      <button
        onClick={() => navigate("/fresher-training")}
        className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition font-medium"
      >
        RoadMap
      </button>

      <button
        onClick={() => navigate("/fresher-progress")}
        className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition font-medium"
      >
        Progress
      </button>

      <button
        onClick={() => navigate("/fresher-settings")}
        className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition font-medium"
      >
        Settings
      </button>
       {/* Logout */}
  <button
    onClick={handleLogout}
    className="mt-4 text-left px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-500 transition font-medium"
  >
    Logout
  </button>
    </div>
  );
}
