import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CompanyPageLoader from "../CompanySpecific/CompanyPageLoader";
import { apiUrl } from "../../services/api";

export default function FinalQuizInstructions() {
  const { companyId, deptId, userId, companyName } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const formatDeadline = (iso) => {
    if (!iso) return "Not set";
    return new Date(iso).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  useEffect(() => {
    const openFinalQuiz = async () => {
      try {
        console.log("[FINAL-QUIZ][UI] Opening final quiz window...");
        const res = await fetch(apiUrl("/api/quiz/final/open"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, deptId, userId }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.message || json?.error || "Could not open final quiz.");
        }
        setData(json);
        console.log("[FINAL-QUIZ][UI] Open response:", json);
      } catch (err) {
        console.error("[FINAL-QUIZ][UI] Open failed:", err);
        setError(err.message || "Failed to load final quiz instructions");
      } finally {
        setLoading(false);
      }
    };

    openFinalQuiz();
  }, [companyId, deptId, userId]);

  if (loading) {
    return <CompanyPageLoader message="Preparing final instructions..." layout="page" />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#04172D] text-white p-8">
        <div className="max-w-2xl mx-auto backdrop-blur-xl bg-[#031C3A]/70 border border-red-400/30 rounded-2xl p-6">
          <h2 className="text-2xl text-red-300 font-bold mb-4">Final Quiz Locked</h2>
          <p className="text-[#AFCBE3] mb-6">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded-lg hover:bg-[#00FFFF15]"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const deadlineLabel = formatDeadline(data?.deadlineAt);

  return (
    <div className="relative min-h-screen bg-[#04172D] text-white p-4 md:p-8 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#00FFFF]/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-20 w-72 h-72 rounded-full bg-[#00FFC2]/10 blur-3xl" />

      <div className="relative max-w-5xl mx-auto">
        <div className="backdrop-blur-xl bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 md:p-8 shadow-[0_20px_60px_rgba(0,255,255,0.08)]">
          <p className="text-xs uppercase tracking-[0.2em] text-[#AFCBE3] mb-2">Pre-Assessment Briefing</p>
          <h1 className="text-3xl font-bold text-[#00FFFF] mb-2">Final Certification Quiz</h1>
          <p className="text-[#AFCBE3] mb-6">
            Review all details before starting. Your attempt will be timed and auto-submitted after 15 minutes.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4">
              <p className="text-xs text-[#AFCBE3]">Pass Threshold</p>
              <p className="text-2xl font-bold text-[#00FFFF]">{data?.passThreshold ?? 70}%</p>
            </div>
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4">
              <p className="text-xs text-[#AFCBE3]">Max Attempts</p>
              <p className="text-2xl font-bold text-amber-300">{data?.maxAttempts ?? 2}</p>
            </div>
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4">
              <p className="text-xs text-[#AFCBE3]">Attempt Timer</p>
              <p className="text-2xl font-bold text-emerald-300">15:00</p>
            </div>
          </div>

          <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4 mb-6">
            <p className="text-xs text-[#AFCBE3] mb-1">Final Deadline</p>
            <p className="text-sm text-[#DDEBFF]">{deadlineLabel}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4">
              <p className="text-sm font-semibold text-[#00FFFF] mb-2">Assessment Scope</p>
              <ul className="space-y-2 text-sm text-[#DDEBFF]">
                <li>1. MCQ section</li>
                <li>2. One-liner conceptual section</li>
                <li>3. Coding challenge section</li>
              </ul>
            </div>

            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4">
              <p className="text-sm font-semibold text-[#00FFFF] mb-2">Attempt Rules</p>
              <ul className="space-y-2 text-sm text-[#DDEBFF]">
                <li>1. Stay on one uninterrupted session</li>
                <li>2. Avoid tab switching</li>
                <li>3. Auto-submit at timer end</li>
                <li>4. Certificate unlocks immediately on pass</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate(`/final-quiz/${companyId}/${deptId}/${userId}/${companyName}`)}
              className="px-5 py-2 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] rounded-lg font-semibold hover:brightness-110"
            >
              Start Final Quiz
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-5 py-2 border border-[#00FFFF] text-[#00FFFF] rounded-lg hover:bg-[#00FFFF15]"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
