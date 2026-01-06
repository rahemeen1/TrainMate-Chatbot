// Roadmap.jsx
import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import axios from "axios";

export default function Roadmap() {
  const { companyId, deptId, userId } = useParams();
  const location = useLocation();
  const selectedPhase = location.state?.phase || 1;

  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Update overall progress after marking module done
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

        // ✅ Phase slicing
        const phaseCount = 3;
        const totalModules = modules.length;
        const modulesPerPhase = Math.ceil(totalModules / phaseCount);
        const start = (selectedPhase - 1) * modulesPerPhase;
        const end = selectedPhase * modulesPerPhase;
        setRoadmap(modules.slice(start, end));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadRoadmap();
  }, [companyId, deptId, userId, selectedPhase]);

  // ✅ Mark module as done
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

  if (loading) return <p className="text-white p-10">Loading Phase {selectedPhase} modules...</p>;
  if (!roadmap.length) return <p className="text-white p-10">No modules for Phase {selectedPhase}</p>;

  return (
    <div className="min-h-screen bg-[#031C3A] text-white p-10">
      <h2 className="text-3xl font-bold text-[#00FFFF] mb-4">Phase {selectedPhase} Modules</h2>
      <div className="space-y-8">
        {roadmap.map((module) => (
          <div
            key={module.id}
            className={`bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 shadow-md ${
              module.completed ? "opacity-50 line-through" : ""
            }`}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm px-3 py-1 rounded-full bg-[#00FFFF] text-[#031C3A]">
                Phase {selectedPhase}
              </span>
              <span className="text-xs text-[#AFCBE3]">⏱ {module.estimatedDays} days</span>
            </div>
            <h3 className="text-xl font-semibold text-[#00FFFF] mb-2">{module.moduleTitle}</h3>
            <p className="text-[#AFCBE3] text-sm mb-4">{module.description}</p>
            {!module.completed ? (
              <button
                onClick={() => markDone(module.id)}
                className="px-5 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold hover:bg-white"
              >
                Mark Done
              </button>
            ) : (
              <span className="text-green-400 font-semibold">✅ Completed</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
