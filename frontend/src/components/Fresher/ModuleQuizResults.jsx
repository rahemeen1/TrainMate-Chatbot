import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { doc, updateDoc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";

export default function ModuleQuizResults() {
  const { companyId, deptId, userId, moduleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const results = location.state?.results;
  const companyName = location.state?.companyName;
  const [requestSent, setRequestSent] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerated, setRegenerated] = useState(false);
  const [moduleMarkedComplete, setModuleMarkedComplete] = useState(false);

  // ===============================
  // Mark Module as Complete if Quiz Passed
  // ===============================
  useEffect(() => {
    const markModuleComplete = async () => {
      if (!results?.passed || moduleMarkedComplete || !companyId || !deptId || !userId || !moduleId) {
        return;
      }

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

        // Mark module as completed
        await updateDoc(moduleRef, {
          completed: true,
          status: "completed",
        });

        setModuleMarkedComplete(true);
      } catch (err) {
        console.error("❌ Error marking module complete:", err);
      }
    };

    markModuleComplete();
  }, [results?.passed, companyId, deptId, userId, moduleId, moduleMarkedComplete]);

  const goToRoadmap = () => {
    if (companyName) {
      navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`, {
        state: { forceReload: true }
      });
      return;
    }
    navigate(-1);
  };

  const regenerateRoadmap = async () => {
    setRegenerating(true);
    try {
      // Get first module to calculate days spent
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
      
      const response = await fetch("http://localhost:5000/api/roadmap/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          deptId,
          userId,
          moduleId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Roadmap regeneration failed");
      }

      setRegenerated(true);
    } catch (err) {
      console.error("Roadmap regeneration error:", err);
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    if (results?.requiresRoadmapRegeneration && !regenerated && !regenerating) {
      regenerateRoadmap();
    }
  }, [results]);

  const requestUnlock = async () => {
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
      await updateDoc(moduleRef, { quizUnlockRequested: true });
      setRequestSent(true);
    } catch (err) {
      setRequestSent(false);
    }
  };

  if (!results) {
    return (
      <div className="min-h-screen bg-[#031C3A] text-white p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-[#00FFFF]">Quiz Results</h1>
          <button
            onClick={goToRoadmap}
            className="px-5 py-2 border border-[#00FFFF] text-[#00FFFF] rounded hover:bg-[#00FFFF]/20 transition-all duration-300"
          >
            Back to Roadmap
          </button>
        </div>
        <p className="text-[#AFCBE3]">No results found. Please submit a quiz first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#031C3A] text-white p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#00FFFF]">Quiz Results</h1>
          <p className="text-[#AFCBE3] mt-1">Module: {moduleId}</p>
        </div>
        <button
          onClick={goToRoadmap}
          className="px-5 py-2 border border-[#00FFFF] text-[#00FFFF] rounded hover:bg-[#00FFFF]/20 transition-all duration-300"
        >
          Back to Roadmap
        </button>
      </div>

      <div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 mb-8">
        <h2 className="text-xl text-[#00FFFF] font-semibold mb-2">Score</h2>
        <p className="text-[#AFCBE3]">{results.score}%</p>
        {results.message && (
          <p className={results.passed ? "text-green-300 mt-2" : "text-red-300 mt-2"}>
            {results.message}
          </p>
        )}
        
        {/* Roadmap Regeneration Status */}
        {results.requiresRoadmapRegeneration && (
          <div className="mt-4 p-4 bg-[#00FFFF]/10 border border-[#00FFFF] rounded-lg">
            <div className="flex items-center gap-3">
              {regenerating ? (
                <>
                  <div className="w-5 h-5 border-2 border-[#00FFFF] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[#00FFFF] font-semibold">Regenerating your learning roadmap...</span>
                </>
              ) : regenerated ? (
                <>
                  <span className="text-2xl">✅</span>
                  <span className="text-green-300 font-semibold">Roadmap regenerated successfully!</span>
                </>
              ) : null}
            </div>
            {regenerated && (
              <p className="text-[#AFCBE3] text-sm mt-2">Your learning path has been optimized based on remaining time and your performance.</p>
            )}
          </div>
        )}
        
        {/* Unlock Everything Message (After 3rd Attempt) */}
        {results.unlockEverything && (
          <div className="mt-4 p-4 bg-yellow-500/20 border border-yellow-500 rounded-lg">
            <h3 className="text-yellow-300 font-bold mb-2">🔓 All Resources Unlocked</h3>
            <ul className="text-[#AFCBE3] text-sm space-y-1 ml-4 list-disc">
              <li>Quiz is now unlocked for further practice</li>
              <li>Module content remains accessible</li>
              <li>Chatbot is available for assistance</li>
            </ul>
          </div>
        )}
        
        {/* Contact Admin Message */}
        {results.contactAdmin && (
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500 rounded-lg">
            <h3 className="text-red-300 font-bold mb-2">⚠️ Additional Support Needed</h3>
            <p className="text-[#AFCBE3] text-sm">Please contact your company admin for personalized guidance and support.</p>
          </div>
        )}
        
        {/* Retry Information */}
        {!results.passed && results.allowRetry && (
          <div className="mt-4 p-4 bg-blue-500/20 border border-blue-500 rounded-lg">
            <h3 className="text-blue-300 font-bold mb-2">🔄 Retry Available</h3>
            <p className="text-[#AFCBE3] text-sm">Attempt {results.attemptNumber} of {results.maxAttempts}</p>
            <p className="text-[#AFCBE3] text-sm mt-1">Review the new roadmap and try again when you feel ready!</p>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {results.mcq?.map((r, idx) => (
          <div key={r.id} className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6">
            <p className="font-medium mb-2">
              {idx + 1}. {r.question}
            </p>
            <p className={r.isCorrect ? "text-green-300" : "text-red-300"}>
              {r.isCorrect ? "Correct" : "Incorrect"} - Correct: {r.correctAnswer}
            </p>
            {r.explanation && (
              <p className="text-[#AFCBE3] mt-2">{r.explanation}</p>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-6 mt-6">
        {results.oneLiners?.map((r, idx) => (
          <div key={r.id} className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6">
            <p className="font-medium mb-2">
              {idx + 1}. {r.question}
            </p>
            <p className={r.isCorrect ? "text-green-300" : "text-red-300"}>
              {r.isCorrect ? "Correct" : "Incorrect"} - Correct: {r.correctAnswer}
            </p>
            {r.explanation && (
              <p className="text-[#AFCBE3] mt-2">{r.explanation}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
