// Roadmap.jsx
import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import axios from "axios";
import { FresherSideMenu } from "./FresherSideMenu";

export default function Roadmap() {
  const { companyId, deptId, userId,companyName } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingModuleId, setLoadingModuleId] = useState(null);
  // 📊 Progress calculation
const completedCount = roadmap.filter((m) => m.completed).length;
const progressPercent = roadmap.length
  ? Math.round((completedCount / roadmap.length) * 100)
  : 0;
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
      const payload = { progress: progressPercent };
      if (progressPercent === 100) payload.trainingStatus = "completed";
      await updateDoc(userRef, payload);

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
          const trainingDuration = userData.trainingDuration;

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
  const modules = roadmapSnap.docs
  .map((doc) => ({ id: doc.id, ...doc.data() }))
  .sort((a, b) => a.order - b.order);

  setRoadmap(modules);

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadRoadmap();
  }, [companyId, deptId, userId]);

  const markDone = async (moduleId) => {
  try {
    setLoadingModuleId(moduleId);

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

    await updateDoc(moduleRef, {
      completed: true,
      status: "completed",
    });

    // ✅ Update roadmap list only
    setRoadmap((prev) =>
      prev.map((m) =>
        m.id === moduleId
          ? { ...m, completed: true, status: "completed" }
          : m
      )
    );
    // Update overall progress in user doc
    try {
      await updateProgress();
    } catch (err) {
      console.error("❌ Error updating overall progress after markDone:", err);
    }
  } catch (err) {
    console.error("❌ Error marking module done:", err);
  } finally {
    setLoadingModuleId(null);
  }
};
const markInProgress = async (module) => {
  // ❌ Do nothing if already in-progress or completed
  if (module.status === "in-progress" || module.completed) return;

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
      module.id
    );

    await updateDoc(moduleRef, {
      status: "in-progress",
    });

    // ✅ Update local state
    setRoadmap((prev) =>
      prev.map((m) =>
        m.id === module.id
          ? { ...m, status: "in-progress" }
          : m
      )
    );
  } catch (err) {
    console.error("❌ Error updating module status:", err);
  }
};

const getUnlockedModules = () => {
  let unlockedNext = true;

  return roadmap.map((module) => {
    const unlocked = unlockedNext;
    if (!module.completed) unlockedNext = false;

    return {
      ...module,
      locked: !unlocked,
    };
  });
};
  // Navigate to fresher training page
  const viewDetails = (moduleId) => {
    navigate(`/fresher-training/${companyId}/${deptId}/${userId}/${moduleId}`);
  };
  
if (loading)
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      
      {/* ✅ Sidebar — fixed width, unchanged */}
      <div className="w-64 flex-shrink-0 bg-[#021B36]/90">
        <div className="sticky top-0 h-screen p-4">
          <FresherSideMenu
            userId={userId}
            companyId={companyId}
            deptId={deptId}
            companyName={companyName}
          />
        </div>
      </div>

      {/* ✅ Right content area — loader centered */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00FFFF]" />
          
          <p className="text-lg font-semibold">
            Generating roadmap modules...
          </p>
          
          <p className="text-sm text-[#AFCBE3]">
            Please wait, this may take a few seconds.
          </p>
        </div>
      </div>

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
  const unlockedModules = getUnlockedModules();
  return (
    <div className="min-h-screen bg-[#031C3A] text-white flex">
      {/* Sidebar */}
<div className="w-64 flex-shrink-0 bg-[#021B36]/90">
  <div className="sticky top-0 h-screen p-4 overflow-y-auto">
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
        {/* 📊 Learning Progress */}
<div className="mb-8">
  <div className="flex justify-between text-sm mb-2 text-[#AFCBE3]">
    <span>Learning Progress</span>
    <span>{progressPercent}%</span>
  </div>

  <div className="w-full bg-[#012244] rounded-full h-3">
    <div
      className="bg-[#00FFFF] h-3 rounded-full transition-all duration-500"
      style={{ width: `${progressPercent}%` }}
    />
  </div>
</div>
        {unlockedModules.map((module) => (
<div
  key={module.id}
  className={`relative bg-[#021B36]/80 border border-[#00FFFF30]
  rounded-xl p-6 shadow-md transition
  ${module.completed ? "opacity-60" : ""}
  ${module.locked ? "opacity-40" : ""}`}
>
  {/* Lock icon */}
  {module.locked && (
    <div className="absolute inset-0 flex items-center justify-center text-4xl">
      🔒
    </div>
  )}

  {/* Content */}
  <div className="flex-1">
    <h3 className="text-xl font-semibold text-[#00FFFF] mb-2">
      {module.moduleTitle}
    </h3>

    <p className="text-[#AFCBE3] text-sm mb-3">
      {module.description}
    </p>

    <p className="text-xs text-[#AFCBE3]">
      ⏱ {module.estimatedDays} days
    </p>
  </div>

  {/* Status Badge */}
  {!module.locked && (
    <span className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs
      ${module.completed
        ? "bg-green-500/20 text-green-400"
        : "bg-yellow-500/20 text-yellow-400"}`}
    >
      {module.completed ? "Completed" : "in-progress"}
    </span>
  )}

  {/* Actions */}
  {!module.locked && !module.completed && (
    <div className="flex gap-3 mt-4">
      {/* <button
        onClick={() =>
          navigate(`/fresher-training/${companyId}/${deptId}/${userId}`, {
            state: { moduleId: module.id, companyName },
          })
        }
        className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold"
      >
        Start Learning
      </button> */}
      <button
  onClick={async () => {
    await markInProgress(module);

    navigate(`/fresher-training/${companyId}/${deptId}/${userId}`,
      { state: { moduleId: module.id, companyName },} );}}
  className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold"
>Start Learning
</button>
      <button
        onClick={() =>
          navigate(`/fresher-training/${companyId}/${deptId}/${userId}`, {
            state: { moduleId: module.id, companyName },
          })
        }
        className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded"
      >
        View Details
      </button>
    </div>
  )}
</div>

        ))}
        {/* ===== Accomplishments Button (ALWAYS VISIBLE) ===== */}
<div className="pt-4">
  <button
    onClick={() =>
      navigate(
        `/accomplishments/${companyId}/${deptId}/${userId}`,
        { state: { companyName } }
      )
    }
    className="px-6 py-3 bg-[#021B36] border border-[#00FFFF]
    text-[#00FFFF] rounded-lg font-semibold
    hover:bg-[#00FFFF]/10 transition"
  >
    🏆 View Your Accomplishments
  </button>
</div>

      </div>
    </div>
  );
}
