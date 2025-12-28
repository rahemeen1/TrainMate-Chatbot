import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  collectionGroup,
  query,
  where,
  getDocs,
} from "firebase/firestore";
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

  // 🔹 Progress color
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

        const q = query(
          collectionGroup(db, "users"),
          where("email", "==", email)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          alert("User not found");
          navigate("/");
          return;
        }

        const userDoc = snap.docs[0];
        const data = userDoc.data();

          // Extract IDs from path
        const pathParts = userDoc.ref.path.split("/");
        const companyIdFromPath = pathParts[1];
        const deptIdFromPath = pathParts[3];
        const userIdFromPath = pathParts[5];

        setUserId(userIdFromPath);
        setCompanyId(companyIdFromPath);
        setDeptId(deptIdFromPath);

        setUserData(data);
        setCompanyName(data.companyName);

        //  Onboarding check
        if (!data.onboarding || !data.onboarding.onboardingCompleted) {
          setShowOnboarding(true);
        }
      } catch (err) {
        console.error("❌ Error fetching fresher:", err);
        alert("Error loading dashboard");
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [email, navigate]);

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
        companyId={companyId}
        deptId={deptId}
        companyName={companyName}
        onFinish={async () => {
          const userRef = doc(
            db,
            "freshers",
            companyId,
            "departments",
            deptId,
            "users",
            userId
          );
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
        <FresherSideMenu
          userId={userId}
          companyId={companyId}
          deptId={deptId}
          companyName={companyName}
        />
      </div>

      {/* MAIN */}
      <div className="flex-1 p-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#00FFFF]">
            Welcome {userData?.name || "Fresher"}!
          </h1>
          <p className="text-[#AFCBE3] mt-1">
            Your training journey starts here
          </p>
        </div>

        {/* INFO CARDS */}
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

        {/* PROGRESS */}
        <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30] mb-6">
          <h3 className="text-[#00FFFF] font-semibold mb-4">
            Training Progress
          </h3>
          <div className="w-full h-4 bg-[#031C3A] rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${getProgressColor(
                userData?.progress || 0
              )}`}
              style={{ width: `${userData?.progress || 0}%` }}
            />
          </div>
          <p className="text-[#AFCBE3] mt-2">
            {userData?.progress || 0}% completed
          </p>
        </div>

        <button
          onClick={() =>
            navigate("/fresher-roadmap", {
              state: { userId, companyId, deptId },
            })
          }
          className="px-5 py-2 rounded-lg bg-[#00FFFF] text-[#031C3A] font-semibold mb-4"
        >
          View Your Roadmap →
        </button>

        <p className="italic text-[#AFCBE3] mt-2">
          Best of luck with your journey
        </p>

        <p className="text-center text-xs text-[#AFCBE3] mt-10">
          Powered by TrainMate
        </p>
      </div>
    </div>
  );
}
