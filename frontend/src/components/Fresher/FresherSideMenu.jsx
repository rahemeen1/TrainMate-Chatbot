import { useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { getCompanyLicensePlan } from "../../services/companyLicense";

export function FresherSideMenu({ userId, companyId, deptId, companyName, roadmapGenerated = false }) {
  const location = useLocation();
  const pathname = location.pathname || "";
  const state = location.state || {};

  const navigate = useNavigate();
const [email, setEmail] = useState(state.email || localStorage.getItem("email"));
const [finalStatus, setFinalStatus] = useState("locked");
const [certificateUnlocked, setCertificateUnlocked] = useState(false);
const [claimLoading, setClaimLoading] = useState(false);
const [licensePlan, setLicensePlan] = useState("License Basic");
const [allModulesCompleted, setAllModulesCompleted] = useState(false);
console.log(email);

  const isActive = (itemKey) => {
    if (itemKey === "dashboard") return pathname === "/fresher-dashboard";
    if (itemKey === "about") return pathname === "/about";
    if (itemKey === "roadmap") {
      return (
        pathname.startsWith("/roadmap") ||
        pathname.startsWith("/module-details") ||
        pathname.startsWith("/fresher-training") ||
        pathname.startsWith("/quiz/") ||
        pathname.startsWith("/quiz-results/")
      );
    }
    if (itemKey === "assistant") return pathname.startsWith("/chatbot");
    if (itemKey === "progress") return pathname.startsWith("/fresher-progress");
    if (itemKey === "settings") return pathname.startsWith("/fresher-settings");
    if (itemKey === "certificate") {
      return (
        pathname.startsWith("/certificate") ||
        pathname.startsWith("/final-quiz") ||
        pathname.startsWith("/final-quiz-instructions") ||
        pathname.startsWith("/final-quiz-results")
      );
    }
    return false;
  };

  const getMenuButtonClass = ({ active, disabled = false }) => {
    if (disabled) {
      return "text-left px-4 py-2 rounded-lg transition font-medium relative group opacity-60 cursor-not-allowed text-[#AFCBE3] bg-gray-500/10";
    }
    return `text-left px-4 py-2 rounded-lg transition font-medium border-b-2 ${
      active
        ? "border-[#00FFFF] text-[#00FFFF] bg-[#00FFFF]/10"
        : "border-transparent text-[#AFCBE3] hover:bg-[#00FFFF]/20"
    }`;
  };

  useEffect(() => {
    const loadUserState = async () => {
      if (!companyId || !deptId || !userId) return;
      try {
        // Fetch company license plan
        const detectedPlan = await getCompanyLicensePlan(companyId);
        setLicensePlan(detectedPlan);

        const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return;
        const userData = userSnap.data() || {};
        setCertificateUnlocked(!!userData.certificateUnlocked);
        setFinalStatus(userData?.finalAssessment?.status || "locked");

        // Check if all modules are completed (for Basic plan certificate unlock)
        const roadmapRef = collection(userRef, "roadmap");
        const roadmapSnap = await getDocs(roadmapRef);
        if (!roadmapSnap.empty) {
          const modules = roadmapSnap.docs.map(d => d.data());
          const allCompleted = modules.length > 0 && modules.every(m => m.modulePassed || m.moduleCompleted);
          setAllModulesCompleted(allCompleted);
        }

        console.log("[FINAL-QUIZ][UI] Side menu state loaded:", {
          certificateUnlocked: !!userData.certificateUnlocked,
          finalStatus: userData?.finalAssessment?.status || "locked",
          licensePlan: detectedPlan,
          allModulesCompleted,
        });
      } catch (err) {
        console.warn("[FINAL-QUIZ][UI] Failed to load user state:", err.message);
      }
    };
    loadUserState();
  }, [companyId, deptId, userId]);

  const handleClaimCertificate = async () => {
    if (!roadmapGenerated) return;

    // For Basic plan: check if all modules are completed to unlock certificate
    if (licensePlan === "License Basic") {
      if (certificateUnlocked || allModulesCompleted) {
        navigate("/certificate", { state: { userId, companyId, deptId, companyName } });
        return;
      }
      // Basic plan users don't need final quiz, just show them the alert
      alert("Complete all training modules to unlock your certificate.");
      return;
    }

    // For Pro plan: require final quiz assessment
    if (certificateUnlocked || finalStatus === "passed") {
      navigate("/certificate", { state: { userId, companyId, deptId, companyName } });
      return;
    }

    if (finalStatus === "open") {
      navigate(`/final-quiz-instructions/${companyId}/${deptId}/${userId}/${companyName}`);
      return;
    }

    try {
      setClaimLoading(true);
      console.log("[FINAL-QUIZ][UI] Attempting to open final quiz from sidebar...");
      const res = await fetch("http://localhost:5000/api/quiz/final/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, deptId, userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.message || data?.error || "Final quiz is locked right now.");
        return;
      }

      setFinalStatus(data?.status || "open");
      console.log("[FINAL-QUIZ][UI] Final quiz open response:", data);
      navigate(`/final-quiz-instructions/${companyId}/${deptId}/${userId}/${companyName}`);
    } catch (err) {
      console.error("[FINAL-QUIZ][UI] Failed to open final quiz:", err);
      alert("Could not open final quiz. Please try again.");
    } finally {
      setClaimLoading(false);
    }
  };
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
        className={getMenuButtonClass({ active: isActive("dashboard") })}
      >
        Dashboard
      </button>

      <button
        onClick={() => navigate("/about")}
        className={getMenuButtonClass({ active: isActive("about") })}
      >
        About Us
      </button>

      <button
        onClick={() => {
          if (!roadmapGenerated) return;
          navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`);
        }}
        className={`${getMenuButtonClass({ active: isActive("roadmap"), disabled: !roadmapGenerated })} relative group`}
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
        className={`${getMenuButtonClass({ active: isActive("assistant"), disabled: !roadmapGenerated })} relative group`}
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
        className={`${getMenuButtonClass({ active: isActive("progress"), disabled: !roadmapGenerated })} relative group`}
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
        className={getMenuButtonClass({ active: isActive("settings") })}
      >
        Settings
      </button>

      <button
        onClick={handleClaimCertificate}
        className={`${getMenuButtonClass({ active: isActive("certificate"), disabled: !roadmapGenerated })} relative group`}
      >
        {!roadmapGenerated && <span className="absolute top-1 left-1 text-xs">🔒</span>}
        <span className={roadmapGenerated ? "" : "ml-2"}>
          {claimLoading ? "Opening Final Quiz..." : "Claim Certificate"}
        </span>
        <div className="absolute left-0 top-full mt-1 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] text-xs font-semibold whitespace-nowrap px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none shadow-lg z-50">
          {licensePlan === "License Basic"
            ? certificateUnlocked || allModulesCompleted
              ? "Certificate unlocked"
              : "Complete all modules to unlock certificate"
            : certificateUnlocked || finalStatus === "passed"
            ? "Certificate unlocked"
            : finalStatus === "open"
            ? "Final quiz is open"
            : "Complete final quiz to unlock certificate"}
        </div>
      </button>

      <button
        onClick={handleLogout}
        className="mt-4 text-left px-4 py-0 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-500 transition font-medium"
      >
        Logout
      </button>
    </div>
  );
}
