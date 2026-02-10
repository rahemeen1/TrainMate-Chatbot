import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { FresherSideMenu } from "./FresherSideMenu";
import { motion } from "framer-motion";

export default function ViewModuleDetails() {
  const { companyId, deptId, userId, moduleId } = useParams();
  const navigate = useNavigate();

  const [module, setModule] = useState(null);
  const [loading, setLoading] = useState(true);

  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);

  // ===============================
  // 🔄 Load module from Firestore
  // ===============================
  useEffect(() => {
    const loadModule = async () => {
      try {
        setLoading(true);
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
          const moduleData = { id: snap.id, ...snap.data() };
          setModule(moduleData);
        } else {
          setModule(null);
        }
      } catch (err) {
        console.error(err);
        setModule(null);
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
        setAiError(false);

        const res = await fetch("http://localhost:5000/api/module/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moduleTitle: module.moduleTitle,
            description: module.description,
            skillsCovered: module.skillsCovered || [],
            estimatedDays: module.estimatedDays,
          }),
        });

        const data = await res.json();
        const parsed = typeof data.content === "string" ? JSON.parse(data.content) : data.content;
        setAiData(parsed);
      } catch (err) {
        console.error(err);
        setAiError(true);
        setAiData(null);
      } finally {
        setAiLoading(false);
      }
    };

    fetchAIExplanation();
  }, [module]);

  // ===============================
  // ⏳ Animated Loader
  // ===============================
  const Loader = () => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#031C3A] to-[#021B36] text-white">
      <div className="w-16 h-16 border-4 border-t-[#00FFFF] border-white border-solid rounded-full animate-spin mb-6"></div>
      <p className="text-xl font-medium tracking-wide animate-pulse">Loading module...</p>
    </div>
  );

  if (loading) return <Loader />;
  if (!module)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#031C3A] text-white">
        <p className="text-2xl font-semibold">Module not found ❌</p>
      </div>
    );

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* ===== Sidebar ===== */}
      <motion.div
        className="w-64 bg-[#021B36]/90 p-4"
        initial={{ x: -200 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <FresherSideMenu userId={userId} companyId={companyId} deptId={deptId} />
      </motion.div>

      {/* ===== Main Content ===== */}
      <motion.div
        className="flex-1 p-10 space-y-8 overflow-y-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        {/* Title */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold text-[#00FFFF]">{module.moduleTitle}</h1>
          <p className="text-[#AFCBE3] mt-1">
            ⏱ {module.estimatedDays || "N/A"} days • Status: {module.status || "N/A"}
          </p>
        </motion.div>

        {/* AI Loading */}
        {aiLoading && (
          <motion.div
            className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 animate-pulse"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-[#AFCBE3]"> AI is preparing a detailed explanation...</p>
          </motion.div>
        )}

        {/* AI Error */}
        {!aiLoading && aiError && (
          <motion.div
            className="bg-[#021B36]/80 border border-[#FF5555]/30 rounded-xl p-6"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <p className="text-[#FFAAAA]">❌ Could not load AI explanation. Please try again later.</p>
          </motion.div>
        )}

        {/* AI Content */}
        {!aiLoading && !aiError && aiData && (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ staggerChildren: 0.2 }}
          >
            {/* Overview */}
            {aiData.overview && (
              <motion.div
                className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 hover:scale-[1.02] transition-transform duration-300"
              >
                <h3 className="text-lg text-[#00FFFF] font-semibold mb-2">📘 Module Overview</h3>
                <p className="text-[#AFCBE3] leading-relaxed">{aiData.overview}</p>
              </motion.div>
            )}

            {/* What You Will Learn */}
            {aiData.whatYouWillLearn?.length > 0 && (
              <motion.div
                className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 hover:scale-[1.02] transition-transform duration-300"
              >
                <h3 className="text-lg text-[#00FFFF] font-semibold mb-3">🧠 What You Will Learn</h3>
                <ul className="list-disc list-inside text-[#AFCBE3] space-y-1">
                  {aiData.whatYouWillLearn.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Skills Breakdown */}
            {aiData.skillsBreakdown?.length > 0 && (
              <motion.div
                className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 hover:scale-[1.02] transition-transform duration-300"
              >
                <h3 className="text-lg text-[#00FFFF] font-semibold mb-3">🛠 Skills Breakdown</h3>
                <ul className="list-disc list-inside text-[#AFCBE3] space-y-1">
                  {aiData.skillsBreakdown.map((skill, i) => (
                    <li key={i}>{skill}</li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Learning Outcome */}
            {aiData.learningOutcome && (
              <motion.div
                className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 hover:scale-[1.02] transition-transform duration-300"
              >
                <h3 className="text-lg text-[#00FFFF] font-semibold mb-2">🎯 Learning Outcome</h3>
                <p className="text-[#AFCBE3]">{aiData.learningOutcome}</p>
              </motion.div>
            )}

            {/* Real World Application */}
            {aiData.realWorldApplication && (
              <motion.div
                className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 hover:scale-[1.02] transition-transform duration-300"
              >
                <h3 className="text-lg text-[#00FFFF] font-semibold mb-2">🌍 Real-World Application</h3>
                <p className="text-[#AFCBE3]">{aiData.realWorldApplication}</p>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 border border-[#00FFFF] text-[#00FFFF] rounded hover:bg-[#00FFFF]/20 transition-all duration-300"
          >
            ← Back to Roadmap
          </button>

          <button
            onClick={() =>
              navigate("/chatbot", {
                state: { userId, companyId, deptId },
              })
            }
            className="px-6 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold hover:bg-[#00FFFF]/90 transition-all duration-300"
          >
            Chat with AI
          </button>
        </div>
      </motion.div>
    </div>
  );
}
