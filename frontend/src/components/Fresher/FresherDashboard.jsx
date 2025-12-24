// Fresher.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

import OnboardingPage from "./OnboardingPage";
import { FresherSideMenu } from "./FresherSideMenu";

export default function FresherDashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const { userId, companyId, deptId } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    if (!userId || !companyId || !deptId) {
      navigate("/login");
      return;
    }

    const fetchUser = async () => {
      try {
        const userRef = doc(
          db,
          "companies",
          companyId,
          "departments",
          deptId,
          "users",
          userId
        );

        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          console.error("User not found");
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
      } catch (err) {
        console.error("Error fetching fresher data:", err);
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, companyId, deptId, navigate]);

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
        onFinish={async () => {
          // After onboarding, fetch updated user data
          const userRef = doc(
            db,
            "companies",
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

  // Fresher Dashboard
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* SIDE MENU */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu />
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 p-8">
        <h1 className="text-3xl font-bold text-[#00FFFF] mb-2">
          Welcome {userData?.name || "Fresher"} 👋
        </h1>

        <p className="text-[#AFCBE3] mb-6">
          Your training journey starts here
        </p>

        {/* INFO CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
            <h3 className="text-[#00FFFF] font-semibold mb-2">Training</h3>
            <p>{userData?.trainingOn || "Not assigned yet"}</p>
          </div>

          <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
            <h3 className="text-[#00FFFF] font-semibold mb-2">Progress</h3>
            <p>{userData?.progress || 0}% completed</p>
          </div>

          <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30]">
            <h3 className="text-[#00FFFF] font-semibold mb-2">Department</h3>
            <p>{deptId}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
