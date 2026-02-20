//FresherProgress.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
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

        // ✅ Get all modules with their chat session counts
        const roadmapRef = collection(db, "freshers", companyId, "departments", deptId, "users", userId, "roadmap");
        const roadmapSnap = await getDocs(roadmapRef);
        
        // Calculate progress for each module based on days used
        const modulesWithProgress = await Promise.all(
          roadmapSnap.docs.map(async (moduleDoc) => {
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
            const daysUsed = chatSessionsSnap.size; // Each doc represents a unique day
            
            const estimatedDays = moduleData.estimatedDays || 1;
            const moduleProgress = Math.min(Math.round((daysUsed / estimatedDays) * 100), 100);
            
            return {
              ...moduleData,
              daysUsed,
              estimatedDays,
              moduleProgress,
            };
          })
        );

        // Calculate overall progress as (total days used / total estimated days) * 100
        const totalDaysUsed = modulesWithProgress.reduce((sum, m) => sum + m.daysUsed, 0);
        const totalEstimatedDays = modulesWithProgress.reduce((sum, m) => sum + m.estimatedDays, 0);
        const overallPercent = totalEstimatedDays > 0 
          ? Math.min(Math.round((totalDaysUsed / totalEstimatedDays) * 100), 100)
          : 0;
        setOverallProgress(overallPercent);

        // Update progress in user document
        await updateDoc(userRef, { progress: overallPercent });

        // ✅ Group modules by phase (order)
        const phaseMap = {};

        modulesWithProgress.forEach((module) => {
          const phase = module.order || 1; 
          if (!phaseMap[phase]) phaseMap[phase] = [];
          phaseMap[phase].push(module);
        });

        // ✅ Build phase progress dynamically based on chatbot usage
        const phases = Object.keys(phaseMap)
          .sort((a, b) => a - b)
          .map((phaseNumber) => {
            const phaseModules = phaseMap[phaseNumber];

            // Calculate average progress for modules in this phase
            const totalPhaseProgress = phaseModules.reduce((sum, m) => sum + m.moduleProgress, 0);
            const percent = phaseModules.length > 0
              ? Math.round(totalPhaseProgress / phaseModules.length)
              : 0;

            return {
              name: `Phase ${phaseNumber}`,
              progress: percent,
            };
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
      <div className="w-64 flex-shrink-0 bg-[#021B36]/90">
        <div className="sticky top-0 h-screen p-4">
          <FresherSideMenu userId={userId} companyId={companyId} deptId={deptId} companyName={companyName} roadmapGenerated={true} />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00FFFF]" />
          <p className="text-lg font-semibold">Loading progress data...</p>
          <p className="text-sm text-[#AFCBE3]">Please wait, this may take a few seconds.</p>
        </div>
      </div>
    </div>
  );
}


if (!userData) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu userId={userId} companyId={companyId} deptId={deptId} companyName={companyName} roadmapGenerated={true} />
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
        <FresherSideMenu userId={userId} companyId={companyId} deptId={deptId} companyName={companyName} roadmapGenerated={true} />
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
              <YAxis stroke="#ffffffff" domain={[0, 100]} />
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
