import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import FresherShellLayout from "./FresherShellLayout";
import { motion } from "framer-motion";
import TrainingLockedScreen from "./TrainingLockedScreen";
import CompanyPageLoader from "../CompanySpecific/CompanyPageLoader";

export default function ViewModuleDetails() {
  const { companyId, deptId, userId, moduleId, companyName } = useParams();
    const navigate = useNavigate();

  const [module, setModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);

  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);

  // ===============================
  // 🔄 Load module from Firestore
  // ===============================
  useEffect(() => {
    const loadModuleAndAI = async () => {
      try {
        setLoading(true);

        // 0️⃣ Load user document to check training lock status
        const userRef = doc(
          db,
          "freshers",
          companyId,
          "departments",
          deptId,
          "users",
          userId
        );
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserData(userSnap.data());
        }

        // 1️⃣ Load module doc
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

        const moduleSnap = await getDoc(moduleRef);

        if (!moduleSnap.exists()) {
          setModule(null);
          setAiData(null);
          return;
        }

        const moduleData = { id: moduleSnap.id, ...moduleSnap.data() };
        setModule(moduleData);

        // 2️⃣ Check if AI data already exists
        const aiRef = doc(moduleRef, "moduleDetails", "aiData");
        const aiSnap = await getDoc(aiRef);

        if (aiSnap.exists()) {
          // ✅ Use cached AI data
          setAiData(aiSnap.data());
        } else {
          // ⚡ Call backend to generate AI content
          setAiLoading(true);
          setAiError(false);

          const res = await fetch("http://localhost:5000/api/module/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fresherId: companyId,
              department: deptId,
              userId,
              moduleId,
              moduleTitle: moduleData.moduleTitle,
              description: moduleData.description,
              skillsCovered: moduleData.skillsCovered || [],
              estimatedDays: moduleData.estimatedDays,
            }),
          });

          if (!res.ok) throw new Error("AI request failed");

          const data = await res.json();

          setAiData(data.content);
        }

      } catch (err) {
        console.error(err);
        setAiError(true);
      } finally {
        setLoading(false);
        setAiLoading(false);
      }
    };

    loadModuleAndAI();
  }, [companyId, deptId, userId, moduleId]);

  // Calculate training progress for this module
  const calculateTrainingProgress = () => {
    if (!module?.estimatedDays) return null;

    const totalDays = module.estimatedDays;

    // Prioritize actual start time when module was unlocked
    const startDateBase = module.startedAt || module.createdAt;
    
    if (!startDateBase) {
      return {
        completedDays: 0,
        remainingDays: totalDays,
      };
    }

    const startDate = startDateBase.toDate
      ? startDateBase.toDate()
      : new Date(startDateBase);

    const today = new Date();

    // normalize both to midnight (CRITICAL)
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    // Only count full completed days (not including today)
    const diffMs = today - startDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // If module started today, 0 days completed
    // If module started yesterday, 1 day completed, etc.
    const completedDays = Math.max(0, Math.min(diffDays, totalDays));
    const remainingDays = Math.max(totalDays - completedDays, 0);

    return {
      completedDays,
      remainingDays,
    };
  };

  if (loading) return <CompanyPageLoader message="Loading module details..." layout="page" />;
  
  // Check if training is locked
  if (userData?.trainingLocked) {
    return <TrainingLockedScreen userData={userData} />;
  }
  
  if (!module)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#031C3A] text-white">
        <p className="text-2xl font-semibold">Module not found ❌</p>
      </div>
    );

  return (
    <FresherShellLayout
      userId={userId}
      companyId={companyId}
      deptId={deptId}
      companyName={companyName}
      roadmapGenerated={true}
      headerLabel="Module Details"
      contentClassName="p-4 md:p-10"
    >
      <motion.div className="space-y-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
        {/* Title */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex items-start justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold text-[#00FFFF]">{module.moduleTitle}</h1>
            <p className="text-[#AFCBE3] mt-1">
              ⏱ {module.estimatedDays || "N/A"} days • Status: {module.status || "N/A"}
            </p>
            {calculateTrainingProgress() && (
              <p className="text-[#00FFFF] mt-1 font-medium">
                📅 {calculateTrainingProgress().remainingDays} days remaining • {calculateTrainingProgress().completedDays} days completed
              </p>
            )}
          </div>
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-2 border border-[#00FFFF] text-[#00FFFF] rounded hover:bg-[#00FFFF]/20 transition-all duration-300"
          >
            ← Back
          </button>
        </motion.div>

        {/* AI Loading */}
        {aiLoading && (
          <motion.div
            className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 animate-pulse"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-[#AFCBE3]">Detailed explanation is generating...</p>
          </motion.div>
        )}

        {/* AI Error */}
        {!aiLoading && aiError && (
          <motion.div
            className="bg-[#021B36]/80 border border-[#FF5555]/30 rounded-xl p-6"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <p className="text-[#FFAAAA]">❌ Could not load details. Please try again later.</p>
          </motion.div>
        )}

        {/* AI Content in 2-column horizontal layout */}
{!aiLoading && !aiError && aiData && (
  <motion.div
    className="grid grid-cols-1 md:grid-cols-2 gap-6"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ staggerChildren: 0.2 }}
  >
    {/* Row 1: Module Overview */}
    {aiData.overview && (
      <motion.div
        className="md:col-span-2 bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 hover:scale-[1.02] transition-transform duration-300"
      >
        <h3 className="text-lg text-[#00FFFF] font-semibold mb-2">Module Overview</h3>
        <div className="text-[#AFCBE3] leading-relaxed" dangerouslySetInnerHTML={{ __html: aiData.overview }}></div>
      </motion.div>
    )}

    {/* Row 2: What You Will Learn (Left) */}
    {aiData.whatYouWillLearn?.length > 0 && (
      <motion.div
        className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 hover:scale-[1.02] transition-transform duration-300"
      >
        <h3 className="text-lg text-[#00FFFF] font-semibold mb-3">What You Will Learn</h3>
        <ul className="list-inside text-[#AFCBE3] space-y-2">
          {aiData.whatYouWillLearn.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: item }}></li>
          ))}
        </ul>
      </motion.div>
    )}

    {/* Row 2: Skills Breakdown (Right) */}
    {aiData.skillsBreakdown?.length > 0 && (
      <motion.div
        className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 hover:scale-[1.02] transition-transform duration-300"
      >
        <h3 className="text-lg text-[#00FFFF] font-semibold mb-3">Skills Breakdown</h3>
        <ul className="list-inside text-[#AFCBE3] space-y-2">
          {aiData.skillsBreakdown.map((skill, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: skill }}></li>
          ))}
        </ul>
      </motion.div>
    )}

    {/* Row 3: Learning Outcome (Left) */}
    {aiData.learningOutcome && (
      <motion.div
        className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 hover:scale-[1.02] transition-transform duration-300"
      >
        <h3 className="text-lg text-[#00FFFF] font-semibold mb-2">Learning Outcome</h3>
        <div className="text-[#AFCBE3]" dangerouslySetInnerHTML={{ __html: aiData.learningOutcome }}></div>
      </motion.div>
    )}

    {/* Row 3: Real-World Application (Right) */}
    {aiData.realWorldApplication && (
      <motion.div
        className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 hover:scale-[1.02] transition-transform duration-300"
      >
        <h3 className="text-lg text-[#00FFFF] font-semibold mb-2">Real-World Application</h3>
        <div className="text-[#AFCBE3]" dangerouslySetInnerHTML={{ __html: aiData.realWorldApplication }}></div>
      </motion.div>
    )}
  </motion.div>
)}
        
              </motion.div>
            </FresherShellLayout>
  );
}