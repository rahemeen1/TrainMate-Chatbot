// Roadmap.jsx
import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import axios from "axios";
import { FresherSideMenu } from "./FresherSideMenu";
import FresherTraining from "./FresherTraining";


export default function Roadmap() {
  const { companyId, deptId, userId,companyName } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);

  // Update overall progress after marking module done
  const updateProgress = async () => {
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
      const roadmapSnap = await getDocs(roadmapRef);
      const modules = roadmapSnap.docs.map((doc) => doc.data());

      const totalModules = modules.length;
      const completedModules = modules.filter((m) => m.completed).length;
      const progressPercent = Math.round((completedModules / totalModules) * 100);

      const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
      await updateDoc(userRef, { progress: progressPercent });

      return progressPercent;
    } catch (err) {
      console.error("❌ Error updating progress:", err);
      return 0;
    }
  };

  useEffect(() => {
    if (!companyId || !deptId || !userId) return;

    const loadRoadmap = async () => {
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

        let roadmapSnap = await getDocs(roadmapRef);

        if (roadmapSnap.empty) {
          // Generate roadmap if it does not exist
          const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) throw new Error("Fresher not found");

          const userData = userSnap.data();
          const expertiseScore = userData.onboarding?.expertise ?? 1;
          const expertiseLevel = userData.onboarding?.level ?? "Beginner";
          const trainingOn = userData.trainingOn ?? "General";
          const trainingDuration = userData.trainingDuration || "1 month";

          await axios.post("http://localhost:5000/api/roadmap/generate", {
            companyId,
            deptId,
            userId,
            trainingDuration,
            expertiseScore,
            expertiseLevel,
            trainingOn,
          });

          roadmapSnap = await getDocs(roadmapRef);
        }

        const modules = roadmapSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setRoadmap(modules); // Show all modules
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadRoadmap();
  }, [companyId, deptId, userId]);

  // Mark module as done
  const markDone = async (moduleId) => {
    try {
      const moduleRef = doc(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId,
        "roadmap",
        moduleId
      );

      await updateDoc(moduleRef, { completed: true });

      setRoadmap((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, completed: true } : m))
      );

      await updateProgress();
    } catch (err) {
      console.error(err);
    }
  };

  // Navigate to fresher training page
  const viewDetails = (moduleId) => {
    navigate(`/fresher-training/${companyId}/${deptId}/${userId}/${moduleId}`);
  };

if (loading)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#031C3A] text-white">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00FFFF] mb-6"></div>
      <p className="text-lg font-semibold">Generating roadmap modules...</p>
      <p className="text-sm text-[#AFCBE3] mt-2">Please wait, this may take a few seconds.</p>
    </div>
  );

if (!roadmap.length)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#031C3A] text-white p-8">
      <div className="text-[#00FFFF] mb-4">
        <svg
          className="w-20 h-20 mx-auto animate-bounce"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 17v-6h6v6m2 4H7a2 2 0 01-2-2V7a2 2 0 012-2h5l2 2h5a2 2 0 012 2v10a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <p className="text-lg font-semibold mb-2">No modules found for this fresher</p>
      <p className="text-sm text-[#AFCBE3] mb-4">Roadmap will be generated once onboarding starts.</p>
      <button
        onClick={() => window.location.reload()}
        className="px-5 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold hover:bg-white transition"
      >
        Retry / Refresh
      </button>
    </div>
  );


  return (
    <div className="min-h-screen bg-[#031C3A] text-white flex">
      {/* Sidebar */}
      <div className="w-64 bg-[#021B36]/90 p-4">
       <div className="w-64 sticky top-0 h-screen overflow-y-auto">
        <FresherSideMenu
                  userId={userId}
                  companyId={companyId}
                  deptId={deptId}
                  companyName={companyName}
                />
        </div>
      </div>

      {/* Modules */}
      <div className="flex-1 p-8 space-y-6">
        <h2 className="text-3xl font-bold text-[#00FFFF] mb-6">Your Personalized Roadmap</h2>
        {roadmap.map((module) => (
          <div
            key={module.id}
            className={`bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 shadow-md flex justify-between items-center ${
              module.completed ? "opacity-50 line-through" : ""
            }`}
          >
            {/* Module info */}
            <div className="flex-1">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm px-3 py-1 rounded-full bg-[#00FFFF] text-[#031C3A]">
                  {module.phase ? `Phase ${module.phase}` : ""}
                </span>
                <span className="text-xs text-[#AFCBE3]">⏱ {module.estimatedDays} days</span>
              </div>
              <h3 className="text-xl font-semibold text-[#00FFFF] mb-2">{module.moduleTitle}</h3>
              <p className="text-[#AFCBE3] text-sm">{module.description}</p>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2 ml-6">
              {!module.completed ? (
                <button
                  onClick={() => markDone(module.id)}
                  className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold hover:bg-white"
                >
                  Mark Done
                </button>
              ) : (
                <span className="text-green-400 font-semibold">✅ Completed</span>
              )}
              <button
  onClick={() =>
    navigate(`/fresher-training/${companyId}/${deptId}/${userId}`, {
      state: { moduleId: module.id }, // pass selected module ID
    })
  }
  className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded hover:bg-[#00FFFF] hover:text-[#031C3A] font-semibold"
>
  View Details
</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
