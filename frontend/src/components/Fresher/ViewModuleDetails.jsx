import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { FresherSideMenu } from "./FresherSideMenu";

export default function ViewModuleDetails() {
  const { companyId, deptId, userId, moduleId } = useParams();
  const navigate = useNavigate();

  const [module, setModule] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔮 Gemini AI states
  const [aiLoading, setAiLoading] = useState(true);
  const [aiData, setAiData] = useState(null);

  // ===============================
  // 🔄 Load module from Firestore
  // ===============================
  useEffect(() => {
    const loadModule = async () => {
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

        const snap = await getDoc(moduleRef);
        if (snap.exists()) {
          setModule({ id: snap.id, ...snap.data() });
        }
      } catch (err) {
        console.error("❌ Error loading module:", err);
      } finally {
        setLoading(false);
      }
    };

    loadModule();
  }, [companyId, deptId, userId, moduleId]);

  // ===============================
  // 🤖 Call Gemini API
  // ===============================
  useEffect(() => {
    if (!module) return;

    const fetchAIExplanation = async () => {
      try {
        setAiLoading(true);

        const res = await fetch("http://localhost:5000/api/module/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moduleTitle: module.moduleTitle,
            description: module.description,
            skillsCovered: module.skillsCovered,
            estimatedDays: module.estimatedDays,
          }),
        });

        const data = await res.json();

        // ✅ Gemini returns JSON string
        const parsed = JSON.parse(data.content);
        setAiData(parsed);
      } catch (err) {
        console.error("❌ Gemini error:", err);
      } finally {
        setAiLoading(false);
      }
    };

    fetchAIExplanation();
  }, [module]);

  // ===============================
  // ⏳ Loaders
  // ===============================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#031C3A] text-white">
        Loading module...
      </div>
    );
  }

  if (!module) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#031C3A] text-white">
        Module not found
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* ===== Sidebar ===== */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu
          userId={userId}
          companyId={companyId}
          deptId={deptId}
        />
      </div>

      {/* ===== Main Content ===== */}
      <div className="flex-1 p-10 space-y-8 overflow-y-auto">

        {/* Title */}
        <div>
          <h1 className="text-4xl font-bold text-[#00FFFF]">
            {module.moduleTitle}
          </h1>
          <p className="text-[#AFCBE3] mt-1">
            ⏱ {module.estimatedDays} days • Status: {module.status}
          </p>
        </div>

        {/* ===== AI Loading ===== */}
        {aiLoading && (
          <div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6">
            <p className="text-[#AFCBE3]">
              🤖 AI is preparing detailed explanation for this module...
            </p>
          </div>
        )}

        {/* ===== AI Content ===== */}
        {!aiLoading && aiData && (
          <>
            {/* Overview */}
            <div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6">
              <h3 className="text-lg text-[#00FFFF] font-semibold mb-2">
                📘 Module Overview
              </h3>
              <p className="text-[#AFCBE3] leading-relaxed">
                {aiData.overview}
              </p>
            </div>

            {/* What You Will Learn */}
            <div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6">
              <h3 className="text-lg text-[#00FFFF] font-semibold mb-3">
                🧠 What You Will Learn
              </h3>
              <ul className="list-disc list-inside text-[#AFCBE3] space-y-1">
                {aiData.whatYouWillLearn.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>

            {/* Skills Breakdown */}
            <div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6">
              <h3 className="text-lg text-[#00FFFF] font-semibold mb-3">
                🛠 Skills Breakdown
              </h3>
              <ul className="list-disc list-inside text-[#AFCBE3] space-y-1">
                {aiData.skillsBreakdown.map((skill, i) => (
                  <li key={i}>{skill}</li>
                ))}
              </ul>
            </div>

            {/* Learning Outcome */}
            <div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6">
              <h3 className="text-lg text-[#00FFFF] font-semibold mb-2">
                🎯 Learning Outcome
              </h3>
              <p className="text-[#AFCBE3]">
                {aiData.learningOutcome}
              </p>
            </div>

            {/* Real World Application */}
            <div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6">
              <h3 className="text-lg text-[#00FFFF] font-semibold mb-2">
                🌍 Real-World Application
              </h3>
              <p className="text-[#AFCBE3]">
                {aiData.realWorldApplication}
              </p>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 border border-[#00FFFF] text-[#00FFFF] rounded"
          >
            ← Back to Roadmap
          </button>

          <button
            onClick={() =>
              navigate("/chatbot", {
                state: { userId, companyId, deptId },
              })
            }
            className="px-6 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold"
          >
            Chat with AI about this module
          </button>
        </div>
      </div>
    </div>
  );
}
