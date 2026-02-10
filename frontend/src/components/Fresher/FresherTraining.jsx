// FresherTraining.jsx
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
  const companyName = location.state?.companyName || "";


  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingModuleId, setLoadingModuleId] = useState(null);
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
      const modules = snap.docs.map((d) => d.data());

      const totalModules = modules.length;
      const completedModules = modules.filter((m) => m.completed).length;
      const percent = totalModules ? Math.round((completedModules / totalModules) * 100) : 0;

      const userRef = doc(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId
      );
      const payload = { progress: percent };
      if (percent === 100) payload.trainingStatus = "completed";
      await updateDoc(userRef, payload);
      return percent;
    } catch (err) {
      console.error("❌ Error updating progress:", err);
      return 0;
    }
  };

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

    // ✅ UPDATE BOTH completed + status
    await updateDoc(moduleRef, {
      completed: true,
      status: "completed",
    });

    // ✅ Update UI state
    setRoadmap((prev) =>
      prev.map((m) =>
        m.id === moduleId
          ? { ...m, completed: true, status: "completed" }
          : m
      )
    );

    if (selectedModule?.id === moduleId) {
      setSelectedModule({
        ...selectedModule,
        completed: true,
        status: "completed",
      });
    }

    await updateProgress();
  } catch (err) {
    console.error("❌ Error marking module done:", err);
  } finally {
    setLoadingModuleId(null);
  }
};


  // ===============================
  // ⏳ Skeleton Loader
  // ===============================
  if (loading) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 bg-[#021B36]/90 p-4">
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
return (
  <div className="flex h-screen bg-[#031C3A] text-white overflow-hidden">
    {/* ===== Sidebar (FIXED WIDTH) ===== */}
    <div className="w-64 h-screen flex-shrink-0 bg-[#021B36]/90 p-4">
      <FresherSideMenu
        userId={userId}
        companyId={companyId}
        deptId={deptId}
        companyName={companyName}
      />
    </div>

    {/* ===== Main Content ===== */}
    <div className="flex-1 p-8 space-y-8 overflow-y-auto">
      <h1 className="text-3xl font-bold text-[#00FFFF]">
        Module Details
      </h1>

      {/* ===== Progress Bar ===== */}
      <div>
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
      

      {/* ===== Module Details Card ===== */}
      {selectedModule && (
        <div className="bg-[#021B36]/90 border border-[#00FFFF30]
          rounded-xl p-8 shadow-lg space-y-6"
        >
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
                disabled={loadingModuleId === selectedModule.id}
                className="px-4 py-2 bg-[#00FFFF] text-[#031C3A]
                  rounded font-semibold flex items-center justify-center gap-2
                  disabled:opacity-60"
              >
                {loadingModuleId === selectedModule.id ? (
                  <>
                    <span className="h-4 w-4 border-2 border-[#031C3A]
                      border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Mark Module Done"
                )}
              </button>
            ) : (
              <span className="text-green-400 font-semibold">
                ✅ Module Completed
              </span>
            )}

            {/* Chatbot Button */}
            <button
              onClick={() =>
                navigate("/chatbot", {
                  state: { userId, companyId, deptId, companyName },
                })
              }
              className="flex items-center justify-center gap-2 px-6 py-3
                bg-gradient-to-r from-cyan-400 to-blue-500
                rounded-lg text-white font-semibold hover:scale-105 transition"
            >
              Chat with AI Assistant
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
  // ===============================
}