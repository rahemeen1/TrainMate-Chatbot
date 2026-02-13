// src/components/Fresher/FresherAccomplishments.jsx

import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { FresherSideMenu } from "./FresherSideMenu";

// backend service
import { generateAccomplishment } from "../../services/accomplishment.service";

export default function FresherAccomplishments() {
  const { companyId, deptId, userId } = useParams();
  const location = useLocation();
  const companyName = location.state?.companyName || "";

  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState(null);

  // -----------------------------
  // Load roadmap + agent summary
  // -----------------------------
  useEffect(() => {
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

        const data = await Promise.all(
          snap.docs.map(async (d) => {
            const summaryRef = doc(
              db,
              "freshers",
              companyId,
              "departments",
              deptId,
              "users",
              userId,
              "roadmap",
              d.id,
              "agentMemory",
              "summary"
            );

            const summarySnap = await getDoc(summaryRef);

            return {
              id: d.id,
              ...d.data(),
              agentSummary: summarySnap.exists()
                ? summarySnap.data()
                : null,
            };
          })
        );

        setModules(data);
      } catch (err) {
        console.error("Failed to load accomplishments", err);
      } finally {
        setLoading(false);
      }
    };

    loadRoadmap();
  }, [companyId, deptId, userId]);

  // -----------------------------
  // Helpers
  // -----------------------------
  const getStatusLabel = (m) => {
    if (m.completed) return "✅ Completed";
    if (m.quizGenerated) return "⏳ In Progress";
    return "🕒 Not Started";
  };

  const handleGenerate = async (moduleId) => {
    try {
      setGeneratingId(moduleId);

      await generateAccomplishment({
        companyId,
        deptId,
        userId,
        moduleId,
      });

      // reload data after generation
      const summaryRef = doc(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId,
        "roadmap",
        moduleId,
        "agentMemory",
        "summary"
      );

      const summarySnap = await getDoc(summaryRef);

      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                agentSummary: summarySnap.exists()
                  ? summarySnap.data()
                  : m.agentSummary,
              }
            : m
        )
      );
    } catch (err) {
      console.error("Failed to generate accomplishment", err);
    } finally {
      setGeneratingId(null);
    }
  };

  // -----------------------------
  // Loading UI
  // -----------------------------
  if (loading) {
    return (
      <div className="flex h-screen bg-[#031C3A] text-white">
        <div className="w-64 bg-[#021B36]/90 p-4">
          <FresherSideMenu {...{ userId, companyId, deptId, companyName }} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-10 w-10 border-4 border-[#00FFFF] border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  // -----------------------------
  // Main UI
  // -----------------------------
  return (
    <div className="flex h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu {...{ userId, companyId, deptId, companyName }} />
      </div>

      {/* Content */}
      <div className="flex-1 p-8 space-y-6 overflow-y-auto">
        <h1 className="text-3xl font-bold text-[#00FFFF]">
          Your Learning Accomplishments
        </h1>

        {modules.map((m) => (
          <div
            key={m.id}
            className="bg-[#021B36]/90 border border-[#00FFFF30]
                       rounded-xl p-6 space-y-4"
          >
            {/* Header */}
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-[#00FFFF]">
                {m.moduleTitle}
              </h2>
              <span className="text-sm">{getStatusLabel(m)}</span>
            </div>

            {/* Description */}
            <p className="text-[#AFCBE3] text-sm">{m.description}</p>

            {/* Accomplishments */}
            <div className="bg-[#031C3A] rounded-lg p-4 text-sm space-y-2">
              <p className="text-[#00FFFF] font-semibold">
                📌 What you’ve accomplished so far
              </p>

              {m.agentSummary?.generatedAccomplishment ? (
                m.agentSummary.generatedAccomplishment
                  .split("•")
                  .filter(Boolean)
                  .map((line, i) => (
                    <p key={i}>• {line.trim()}</p>
                  ))
              ) : (
                <button
                  onClick={() => handleGenerate(m.id)}
                  disabled={generatingId === m.id}
                  className="text-xs text-[#00FFFF] underline disabled:opacity-60"
                >
                  {generatingId === m.id
                    ? "Generating summary..."
                    : "Generate accomplishment summary"}
                </button>
              )}
            </div>

            {/* Meta */}
            <p className="text-xs text-[#AFCBE3]">
              ⏱ Estimated time: {m.estimatedDays} days
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
