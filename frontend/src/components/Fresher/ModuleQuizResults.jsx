import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

export default function ModuleQuizResults() {
  const { companyId, deptId, userId, moduleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const results = location.state?.results;
  const companyName = location.state?.companyName;
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

        {!results.passed && results.remediationPlan?.summary && (
          <div className="mt-4 p-4 bg-slate-900/60 border border-cyan-400/20 rounded-lg">
            <h3 className="text-cyan-300 font-bold mb-2">Why this attempt missed the mark</h3>
            <p className="text-[#AFCBE3] text-sm leading-relaxed">{results.remediationPlan.summary}</p>
            {Array.isArray(results.skillSignals?.mustHaveWeakSkills) && results.skillSignals.mustHaveWeakSkills.length > 0 && (
              <div className="mt-3">
                <p className="text-xs uppercase tracking-wide text-[#AFCBE3] mb-2">Must-have gaps</p>
                <div className="flex flex-wrap gap-2">
                  {results.skillSignals.mustHaveWeakSkills.map((skill) => (
                    <span key={skill} className="px-2 py-1 rounded-full bg-red-500/15 border border-red-400/30 text-red-200 text-xs">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {Array.isArray(results.remediationPlan?.actions) && results.remediationPlan.actions.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-[#AFCBE3]">
                {results.remediationPlan.actions.map((action, idx) => (
                  <li key={`${action}-${idx}`} className="flex items-start gap-2">
                    <span className="text-cyan-300 mt-0.5">•</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        
        {/* Success Message */}
        {results.passed && (
          <div className="mt-4 p-4 bg-green-500/20 border border-green-500 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎉</span>
              <div>
                <h3 className="text-green-300 font-bold mb-1">Congratulations!</h3>
                <p className="text-[#AFCBE3] text-sm">
                  You've successfully completed this module. The next module in your roadmap is now unlocked!
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* TrainMate Recommendations */}
        {!results.passed && results.recommendations && results.recommendations.length > 0 && (
          <div className="mt-4 p-4 bg-purple-500/20 border border-purple-500 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🧭</span>
              <div className="flex-1">
                <h3 className="text-purple-300 font-bold mb-2">TrainMate Recommendations</h3>
                <p className="text-[#AFCBE3] text-sm mb-2">
                  Based on your last attempt, here is a focused plan to help you pass this module quiz.
                </p>
                <ul className="text-[#AFCBE3] text-sm space-y-1">
                  {results.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-purple-400">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        
        {/* Retry Information - Dynamic based on TrainMate decision */}
        {!results.passed && results.allowRetry && results.retriesGranted > 0 && (
          <div className="mt-4 p-4 bg-blue-500/20 border border-blue-500 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔄</span>
              <div>
                <h3 className="text-blue-300 font-bold mb-2">Retry Granted by TrainMate</h3>
                <p className="text-[#AFCBE3] text-sm mb-2">
                  <span className="text-[#00FFFF] font-semibold">{results.retriesGranted}</span> {results.retriesGranted === 1 ? 'retry' : 'retries'} granted based on your quiz performance
                </p>
                <p className="text-[#AFCBE3] text-sm">
                  Current attempt: {results.attemptNumber} | Max attempts: {results.maxAttempts}
                </p>
                <p className="text-[#AFCBE3] text-sm mt-2">
                  Review the module from the start, use the chatbot for doubts, and retry only when you feel confident.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Roadmap Regeneration Notice */}
        {!results.passed && results.requiresRoadmapRegeneration && (
          <div className="mt-4 p-4 bg-orange-500/20 border border-orange-500 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔄</span>
              <div>
                <h3 className="text-orange-300 font-bold mb-2">Learning Path Adjustment</h3>
                <p className="text-[#AFCBE3] text-sm">
                  TrainMate will adjust your learning roadmap to focus on the exact gaps from this module and your quiz results.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Module Locked After All Attempts */}
        {!results.passed && results.lockModule && (
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔒</span>
              <div>
                <h3 className="text-red-300 font-bold mb-2">Module Locked</h3>
                <p className="text-[#AFCBE3] text-sm mb-2">
                  After {results.attemptNumber} attempts, the AI has determined that this module needs to be locked.
                </p>
                {results.contactAdmin && (
                  <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
                    <p className="text-yellow-400 text-xs font-semibold">
                      📞 Please contact your company admin for personalized support and next steps.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Resources Unlocked */}
        {!results.passed && results.unlockResources && results.unlockResources.length > 0 && (
          <div className="mt-4 p-4 bg-green-500/20 border border-green-500 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔓</span>
              <div>
                <h3 className="text-green-300 font-bold mb-2">Resources Unlocked</h3>
                <p className="text-[#AFCBE3] text-sm mb-2">
                  The AI has unlocked additional resources to support your learning:
                </p>
                <ul className="text-[#AFCBE3] text-sm space-y-1">
                  {results.unlockResources.map((resource, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="capitalize">{resource}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
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
            {!r.isCorrect && r.selectedAnswer && (
              <p className="text-[#AFCBE3] mt-2 text-sm">Your answer: {r.selectedAnswer}</p>
            )}
            {r.explanation && (
              <p className="text-[#AFCBE3] mt-2">{r.explanation}</p>
            )}
            {!r.isCorrect && r.review && (
              <p className="text-cyan-200 mt-2 text-sm">Why it was wrong: {r.review}</p>
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
            {!r.isCorrect && r.response && (
              <p className="text-[#AFCBE3] mt-2 text-sm">Your answer: {r.response}</p>
            )}
            {r.explanation && (
              <p className="text-[#AFCBE3] mt-2">{r.explanation}</p>
            )}
            {!r.isCorrect && r.review && (
              <p className="text-cyan-200 mt-2 text-sm">Why it was wrong: {r.review}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
