//FresherDashboard.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";

import { db } from "../../firebase";
import OnboardingPage from "./OnboardingPage";
import { FresherSideMenu } from "./FresherSideMenu";

export default function FresherDashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [roadmap, setRoadmap] = useState([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [userData, setUserData] = useState(null);
  

  const state = location.state || {};

// Try to get values from state first, fallback to localStorage
const [userId, setUserId] = useState(state.userId || localStorage.getItem("userId"));
const [companyId, setCompanyId] = useState(state.companyId || localStorage.getItem("companyId"));
const [deptId, setDeptId] = useState(state.deptId || localStorage.getItem("deptId"));
const [companyName, setCompanyName] = useState(state.companyName || localStorage.getItem("companyName"));
const [email, setEmail] = useState(state.email || localStorage.getItem("email"));

// Save to localStorage if state exists
useEffect(() => {
  if (state.userId) localStorage.setItem("userId", state.userId);
  if (state.companyId) localStorage.setItem("companyId", state.companyId);
  if (state.deptId) localStorage.setItem("deptId", state.deptId);
  if (state.companyName) localStorage.setItem("companyName", state.companyName);
  if (state.email) localStorage.setItem("email", state.email);
}, [state]);

//progress calculation
useEffect(() => {
  if (!companyId || !deptId || !userId) return;

  const loadRoadmapProgress = async () => {
    try {
      const roadmapRef = collection(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId,
        "roadmap"
      );

      const snap = await getDocs(roadmapRef);
      
      // Calculate progress based on chatbot usage days
      const modulesWithProgress = await Promise.all(
        snap.docs.map(async (moduleDoc) => {
          const moduleData = { id: moduleDoc.id, ...moduleDoc.data() };
          
          // Count unique chat session days for this module
          const chatSessionsRef = collection(
            db,
            "freshers",
            companyId,
            "departments",
            deptId,
            "users",
            userId,
            "roadmap",
            moduleDoc.id,
            "chatSessions"
          );
          
          const chatSessionsSnap = await getDocs(chatSessionsRef);
          const daysUsed = chatSessionsSnap.size;
          
          const estimatedDays = moduleData.estimatedDays || 1;
          
          return {
            ...moduleData,
            daysUsed,
            estimatedDays,
          };
        })
      );

      setRoadmap(modulesWithProgress);

      // Calculate overall progress as (total days used / total estimated days) * 100
      const totalDaysUsed = modulesWithProgress.reduce((sum, m) => sum + m.daysUsed, 0);
      const totalEstimatedDays = modulesWithProgress.reduce((sum, m) => sum + m.estimatedDays, 0);
      const percent = totalEstimatedDays > 0 
        ? Math.min(Math.round((totalDaysUsed / totalEstimatedDays) * 100), 100)
        : 0;

      setProgressPercent(percent);

      // Update progress in user document
      const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
      await updateDoc(userRef, { progress: percent });
      
    } catch (err) {
      console.error("❌ Error loading roadmap progress:", err);
    }
  };

  loadRoadmapProgress();
}, [companyId, deptId, userId]);


// Redirect if essential info missing
useEffect(() => {
  if (!userId || !companyId || !deptId) {
    navigate("/", { replace: true });
  }
}, [userId, companyId, deptId, navigate]);

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
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <div className="w-64 flex-shrink-0 bg-[#021B36]/90">
        <div className="sticky top-0 h-screen p-4">
          <FresherSideMenu userId={userId} companyId={companyId} deptId={deptId} companyName={companyName} />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00FFFF]" />
          <p className="text-lg font-semibold">Loading your dashboard...</p>
          <p className="text-sm text-[#AFCBE3]">Please wait, this may take a few seconds.</p>
        </div>
      </div>
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

        <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30] mb-6">
  <h3 className="text-[#00FFFF] font-semibold mb-4">
    Training Progress
  </h3>

  <div className="w-full h-4 bg-[#031C3A] rounded-full overflow-hidden">
    <div
      className={`h-full bg-gradient-to-r ${getProgressColor(progressPercent)}`}
      style={{ width: `${progressPercent}%` }}
    />
  </div>

  <p className="text-[#AFCBE3] mt-2">
    {progressPercent}% completed
  </p>
</div>

           <div className="flex gap-4 mt-4">
  {/* View Roadmap Button */}
  <button
    onClick={() => navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`)}
    className="px-6 py-3 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] font-semibold rounded-xl shadow-lg hover:scale-105 hover:shadow-2xl transition-transform duration-200"
  >
    View Roadmap
  </button>

 
</div>
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
