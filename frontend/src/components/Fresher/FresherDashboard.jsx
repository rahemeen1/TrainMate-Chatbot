import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import OnboardingPage from "./OnboardingPage";
import { FresherSideMenu } from "./FresherSideMenu";

export default function FresherDashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const { email } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userData, setUserData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [deptId, setDeptId] = useState(null);
  const [companyName, setCompanyName] = useState(null);

  // Progress bar color
  const getProgressColor = (progress = 0) => {
    if (progress < 30) return "from-red-500 to-orange-500";
    if (progress < 70) return "from-yellow-400 to-[#00FFFF]";
    return "from-[#00FFFF] to-green-400";
  };

  useEffect(() => {
    if (!email) {
      navigate("/");
      return;
    }

    const fetchUser = async () => {
      try {
        // 1️⃣ Check `freshers` collection by email
        const freshersRef = collection(db, "freshers");
        const q = query(freshersRef, where("email", "==", email));
        const snap = await getDocs(q);

        if (snap.empty) {
          alert("User not found");
          navigate("/");
          return;
        }

        const userDoc = snap.docs[0];
        const data = userDoc.data();
        setUserId(userDoc.id);
        setUserData(data);
        setCompanyId(data.companyId);
        setDeptId(data.deptId);
        setCompanyName(data.companyName);

        // Onboarding check
        if (!data.onboarding || !data.onboarding.onboardingCompleted) {
          setShowOnboarding(true);
        }
      } catch (err) {
        console.error("Error fetching fresher data:", err);
        alert("Error loading user data");
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [email, navigate]);

  if (loading)
    return (
      <div className="min-h-screen bg-[#031C3A] flex items-center justify-center text-white">
        Loading...
      </div>
    );

  if (showOnboarding)
    return (
      <OnboardingPage
        userId={userId}
        companyId={companyId}
        companyName={companyName}
        deptId={deptId}
        onFinish={async () => {
          const userRef = doc(db, "freshers", userId);
          const snap = await getDoc(userRef);
          setUserData(snap.data());
          setShowOnboarding(false);
        }}
      />
    );

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Side Menu */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu userId={userId} companyId={companyId} deptId={deptId} companyName={companyName} />
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#00FFFF]">
            Welcome {userData?.name || "Fresher"}!
          </h1>
          <p className="text-[#AFCBE3] mt-1">
            Your training journey starts here
          </p>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
            <h3 className="text-[#00FFFF] font-semibold mb-2">
              Training Program
            </h3>
            <p>{userData?.trainingOn || "Not assigned yet"}</p>
          </div>
          <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
            <h3 className="text-[#00FFFF] font-semibold mb-2">Department</h3>
            <p>{userData?.deptName || "N/A"}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30] shadow-[0_0_25px_rgba(0,255,255,0.15)] mb-6">
          <h3 className="text-[#00FFFF] font-semibold mb-4">Training Progress</h3>
          <div className="w-full h-4 bg-[#031C3A] rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${getProgressColor(userData?.progress || 0)} transition-all duration-700`}
              style={{ width: `${userData?.progress || 0}%` }}
            />
          </div>
          <p className="text-[#AFCBE3] mt-2">{userData?.progress || 0}% completed</p>
        </div>

        <button
          onClick={() =>
            navigate("/fresher-roadmap", { state: { userId, companyId, deptId } })
          }
          className="px-5 py-2 rounded-lg bg-[#00FFFF] text-[#031C3A] font-semibold hover:opacity-90 transition shadow-[0_0_12px_#00FFFF80] mb-4"
        >
          View Your Roadmap →
        </button>

        <p className="italic text-[#AFCBE3] mt-2">Best of luck with your journey 🤖</p>
        <p className="text-center text-xs text-[#AFCBE3] mt-10">Powered by TrainMate</p>
      </div>
    </div>
  );
}
