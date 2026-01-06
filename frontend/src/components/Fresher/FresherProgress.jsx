import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { FresherSideMenu } from "./FresherSideMenu";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function FresherProgress() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, companyId, deptId, companyName } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [phaseProgress, setPhaseProgress] = useState([]);
  const [overallProgress, setOverallProgress] = useState(0);

  useEffect(() => {
    if (!userId || !companyId || !deptId) {
      navigate("/fresher-dashboard");
      return;
    }

    const fetchProgress = async () => {
      try {
        // ✅ Get fresher data
        const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          alert("Fresher data not found!");
          navigate("/fresher-dashboard");
          return;
        }

        const data = snap.data();
        setUserData(data);

        // ✅ Get all modules
        const roadmapRef = collection(db, "freshers", companyId, "departments", deptId, "users", userId, "roadmap");
        const roadmapSnap = await getDocs(roadmapRef);
        const modules = roadmapSnap.docs.map((doc) => doc.data());

        const totalModules = modules.length;
        const completedModules = modules.filter((m) => m.completed).length;

        const overallPercent = Math.round((completedModules / totalModules) * 100) || 0;
        setOverallProgress(overallPercent);

        // ✅ Phase-wise progress
        const phaseCount = 3;
        const modulesPerPhase = Math.ceil(totalModules / phaseCount);
        const phases = Array.from({ length: phaseCount }, (_, i) => {
          const start = i * modulesPerPhase;
          const end = start + modulesPerPhase;
          const phaseModules = modules.slice(start, end);
          const completedPhase = phaseModules.filter((m) => m.completed).length;
          const percent = phaseModules.length > 0 ? Math.round((completedPhase / phaseModules.length) * 100) : 0;
          return { name: `Phase ${i + 1}`, progress: percent };
        });

        setPhaseProgress(phases);
      } catch (err) {
        console.error(err);
        alert("Error fetching fresher progress");
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();
  }, [userId, companyId, deptId, navigate]);

  // if (loading) return <p className="text-white p-10">Loading fresher progress...</p>;
  // if (!userData) return <p className="text-white p-10">No data available.</p>;
  
if (loading) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
     <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu userId={userId} companyId={companyId} deptId={deptId} companyName={companyName} />
      </div>
      {/* Center Loader */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          
          {/* ⏳ Hourglass Loader */}
          <div className="hourglass-loader" />

          <p className="text-[#00FFFF] tracking-wide text-sm">
            Preparing your workspace...
          </p>
        </div>
      </div>

      {/* Loader Styles */}
      <style>
        {`
          .hourglass-loader {
            width: 40px;
            height: 40px;
            border: 3px solid #00FFFF30;
            border-top: 3px solid #00FFFF;
            border-bottom: 3px solid #00FFFF;
            border-radius: 50%;
            animation: hourglassSpin 1.2s linear infinite;
            box-shadow: 0 0 12px #00FFFF40;
          }

          @keyframes hourglassSpin {
            0% { transform: rotate(0deg); }
            50% { transform: rotate(180deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}


if (!userData) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu userId={userId} companyId={companyId} deptId={deptId} companyName={companyName} />
      </div>
      <div className="flex-1 p-10 flex items-center justify-center text-[#AFCBE3]">
        No data available.
      </div>
    </div>
  );
}


  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu userId={userId} companyId={companyId} deptId={deptId} companyName={companyName} />
      </div>

      <div className="flex-1 p-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#00FFFF]">{userData.name}'s Progress</h1>
          <p className="text-[#AFCBE3] mt-1">
            Department: {userData.deptName} | Level: {userData.onboarding?.level} | Expertise: {userData.onboarding?.expertise}
          </p>
        </div>

        {/* Overall Progress */}
        <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30] mb-6">
          <h2 className="text-xl text-[#00FFFF] font-semibold mb-2">Overall Training Progress</h2>
          <div className="w-full h-6 bg-[#031C3A] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#00FFFF] to-green-400" style={{ width: `${overallProgress}%` }} />
          </div>
          <p className="mt-2 text-[#AFCBE3]">{overallProgress}% completed</p>
        </div>

        {/* Phase-wise Chart */}
        <div className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30] mb-6">
          <h2 className="text-xl text-[#00FFFF] font-semibold mb-4">Phase-wise Progress</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={phaseProgress}>
              <XAxis dataKey="name" stroke="#ffffffff" />
              <YAxis stroke="#ffffffff" />
              <Tooltip />
              <Bar dataKey="progress" fill="#1c5252ff" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-center text-xs text-[#AFCBE3] mt-10">Powered by TrainMate</p>
      </div>
    </div>
  );
}
