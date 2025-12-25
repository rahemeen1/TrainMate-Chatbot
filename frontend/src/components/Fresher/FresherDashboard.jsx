import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

import OnboardingPage from "./OnboardingPage";
import { FresherSideMenu } from "./FresherSideMenu";

export default function FresherDashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const { userId, companyId: stateCompanyId, deptId } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userData, setUserData] = useState(null);
  const [companyName, setCompanyName] = useState(stateCompanyId || "Company");

  // 🎯 Progress color logic
  const getProgressColor = (progress = 0) => {
    if (progress < 30) return "from-red-500 to-orange-500";
    if (progress < 70) return "from-yellow-400 to-[#00FFFF]";
    return "from-[#00FFFF] to-green-400";
  };

  useEffect(() => {
    if (!userId || !stateCompanyId || !deptId) {
      navigate("/login");
      return;
    }

    const fetchData = async () => {
      try {
        // User data
        const userRef = doc(db, "companies", stateCompanyId, "departments", deptId, "users", userId);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          navigate("/login");
          return;
        }

        const data = snap.data();

        // Check onboarding
        if (!data.onboarding || !data.onboarding.onboardingCompleted) {
          setShowOnboarding(true);
        } else {
          setUserData(data);
        }

        // Company name
        const companyRef = doc(db, "companies", stateCompanyId);
        const companySnap = await getDoc(companyRef);
        if (companySnap.exists()) {
          setCompanyName(companySnap.data().name || stateCompanyId);
        }

      } catch (err) {
        console.error("Error fetching data:", err);
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, stateCompanyId, deptId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#031C3A] flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <OnboardingPage
        userId={userId}
        companyId={stateCompanyId}
        deptId={deptId}
        companyName={companyName}
        onFinish={async () => {
          const userRef = doc(db, "companies", stateCompanyId, "departments", deptId, "users", userId);
          const snap = await getDoc(userRef);
          setUserData(snap.data());
          setShowOnboarding(false);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* SIDE MENU */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu companyId={companyName} />
      </div>

      {/* MAIN */}
      <div className="flex-1 p-10">
        {/* HEADER */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#00FFFF]">
            Welcome {userData?.name || "Fresher"}!
          </h1>
          <p className="text-[#AFCBE3] mt-1">
            Your training journey starts here at {companyName}
          </p>
        </div>

        {/* INFO CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
            <h3 className="text-[#00FFFF] font-semibold mb-2">Training Program</h3>
            <p>{userData?.trainingOn || "Not assigned yet"}</p>
          </div>

          <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
            <h3 className="text-[#00FFFF] font-semibold mb-2">Department</h3>
            <p>{deptId}</p>
          </div>
        </div>

        {/* FULL WIDTH PROGRESS BAR */}
        <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]
          shadow-[0_0_25px_rgba(0,255,255,0.15)] mb-4">

          <h3 className="text-[#00FFFF] font-semibold mb-4">
            Training Progress
          </h3>

          <div className="w-full h-4 bg-[#031C3A] rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${getProgressColor(userData?.progress || 0)} transition-all duration-700`}
              style={{ width: `${userData?.progress || 0}%` }}
            />
          </div>

          <div className="flex justify-between items-center mt-4">
            <p className="text-[#AFCBE3]">{userData?.progress || 0}% completed</p>
          </div>
        </div>

        <button
          onClick={() => navigate("/fresher-roadmap", { state: { userId, companyId: stateCompanyId, deptId } })}
          className="px-5 py-2 rounded-lg bg-[#00FFFF] text-[#031C3A] font-semibold hover:opacity-90 transition shadow-[0_0_12px_#00FFFF80] mb-6"
        >
          View Your Roadmap →
        </button>

        <p className="italic text-[#AFCBE3]">Best of luck with your journey 🤖</p>
       
    </div>
      
    </div>
    
  );
}
