// Roadmap.jsx – Enhanced Fresher Training View

import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { FresherSideMenu } from "./FresherSideMenu";

export default function FresherTraining() {
  const { companyId, deptId, userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const selectedModuleId = location.state?.moduleId || null;

  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState(null);

  // ===============================
  // 🔄 Load Roadmap
  // ===============================
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

        const snap = await getDocs(roadmapRef);
        const modules = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRoadmap(modules);

        if (selectedModuleId) {
          setSelectedModule(modules.find((m) => m.id === selectedModuleId));
        }
      } catch (err) {
        console.error("❌ Error loading roadmap:", err);
      } finally {
        setLoading(false);
      }
    };

    loadRoadmap();
  }, [companyId, deptId, userId, selectedModuleId]);

  // ===============================
  // 📊 Progress Calculation
  // ===============================
  const completedCount = roadmap.filter((m) => m.completed).length;
  const progressPercent = roadmap.length
    ? Math.round((completedCount / roadmap.length) * 100)
    : 0;

  const updateProgress = async () => {
    const userRef = doc(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId
    );
    await updateDoc(userRef, { progress: progressPercent });
  };

  // ===============================
  // ✅ Mark Module Done
  // ===============================
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
        prev.map((m) =>
          m.id === moduleId ? { ...m, completed: true } : m
        )
      );

      if (selectedModule?.id === moduleId) {
        setSelectedModule({ ...selectedModule, completed: true });
      }

      await updateProgress();
    } catch (err) {
      console.error("❌ Error marking module done:", err);
    }
  };

  // ===============================
  // ⏳ Skeleton Loader
  // ===============================
  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#031C3A] text-white">
        <div className="w-64 bg-[#021B36]" />
        <div className="flex-1 p-10 space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-[#021B36] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
      <div className="w-64 sticky top-0 h-screen">
        <FresherSideMenu
          companyId={companyId}
          deptId={deptId}
          userId={userId}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 space-y-8 overflow-y-auto">

        {/* 🔹 Progress Bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
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

        {/* ===============================
            📦 MODULE LIST VIEW
        =============================== */}
        {!selectedModule ? (
          <div className="space-y-6">
            {roadmap.map((module) => (
              <div
                key={module.id}
                className={`relative bg-[#021B36]/80 border border-[#00FFFF30]
                rounded-xl p-6 shadow-md transition hover:scale-[1.02]
                ${module.completed ? "opacity-60" : ""}`}
              >
                {/* Status Badge */}
                <span
                  className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold
                  ${
                    module.completed
                      ? "bg-green-500/20 text-green-400"
                      : "bg-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {module.completed ? "Completed" : "Pending"}
                </span>

                <h3 className="text-xl font-semibold text-[#00FFFF] mb-2">
                  {module.moduleTitle}
                </h3>
                <p className="text-[#AFCBE3] mb-2">{module.description}</p>
                <p className="text-xs text-[#AFCBE3]">
                  ⏱ {module.estimatedDays} days
                </p>

                <div className="flex gap-3 mt-4">
                  {!module.completed && (
                    <button
                      onClick={() => markDone(module.id)}
                      className="px-4 py-2 bg-[#00FFFF] text-[#031C3A]
                      rounded font-semibold hover:bg-white"
                    >
                      Mark Done
                    </button>
                  )}

                  <button
                    onClick={() =>
                      navigate(
                        `/roadmap/${companyId}/${deptId}/${userId}`,
                        { state: { moduleId: module.id } }
                      )
                    }
                    className="px-4 py-2 border border-[#00FFFF]
                    text-[#00FFFF] rounded hover:bg-[#00FFFF]
                    hover:text-[#031C3A] font-semibold"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ===============================
              📘 MODULE DETAIL VIEW
          =============================== */
          <div className="bg-[#021B36]/90 border border-[#00FFFF30]
          rounded-xl p-8 shadow-lg space-y-6">

            <h2 className="text-3xl font-bold text-[#00FFFF]">
              {selectedModule.moduleTitle}
            </h2>

            <p className="text-[#AFCBE3]">
              {selectedModule.description}
            </p>

            <p className="text-sm text-[#AFCBE3]">
              ⏱ Estimated Days: {selectedModule.estimatedDays}
            </p>

            {/* Learning Outcomes */}
            <div className="border border-[#00FFFF20] rounded-lg p-5">
              <h4 className="text-lg text-[#00FFFF] font-semibold mb-2">
                What you will learn
              </h4>
              <ul className="list-disc list-inside text-[#AFCBE3] text-sm space-y-1">
                <li>Core fundamentals</li>
                <li>Hands-on understanding</li>
                <li>Industry best practices</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-4">
              {!selectedModule.completed ? (
                <button
                  onClick={() => markDone(selectedModule.id)}
                  className="px-6 py-3 bg-[#00FFFF]
                  text-[#031C3A] rounded-lg font-semibold hover:bg-white"
                >
                  Mark Module Completed
                </button>
              ) : (
                <span className="text-green-400 font-semibold">
                  ✅ Module Completed
                </span>
              )}

              <button
                onClick={() =>
                  navigate(
                    `/mentor/${companyId}/${deptId}/${userId}/${selectedModule.id}`
                  )
                }
                className="flex items-center justify-center gap-2 px-6 py-3
                bg-gradient-to-r from-pink-500 to-red-500
                rounded-lg text-white font-semibold hover:scale-105 transition"
              >
                🤖 Start AI Mentor Session
              </button>

              <button
                onClick={() => navigate(-1)}
                className="text-sm text-[#00FFFF] underline"
              >
                ← Back to roadmap
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
