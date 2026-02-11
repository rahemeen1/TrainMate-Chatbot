import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

export default function ModuleQuizResults() {
  const { companyId, deptId, userId, moduleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const results = location.state?.results;
  const companyName = location.state?.companyName;
  const [requestSent, setRequestSent] = useState(false);

  const goToRoadmap = () => {
    if (companyName) {
      navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`);
      return;
    }
    navigate(-1);
  };

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
        {!results.passed && (
          <div className="mt-4">
            <button
              onClick={requestUnlock}
              disabled={requestSent}
              className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded disabled:opacity-50"
            >
              {requestSent ? "Request Sent" : "Request Unlock"}
            </button>
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
