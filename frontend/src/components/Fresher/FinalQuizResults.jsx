import { useLocation, useNavigate, useParams } from "react-router-dom";

export default function FinalQuizResults() {
  const { companyId, deptId, userId, companyName } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const results = location.state?.results;

  const statusTone = results?.passed
    ? "text-green-300 bg-green-500/10 border-green-400/30"
    : "text-red-300 bg-red-500/10 border-red-400/30";
  const attemptsUsed = Number(results?.attemptsUsed ?? 0);
  const attemptsLeft = Number(results?.attemptsLeft ?? 0);
  const attemptsExhausted = !results?.passed && attemptsUsed >= 2 && attemptsLeft <= 0;

  if (!results) {
    return (
      <div className="min-h-screen bg-[#04172D] text-white p-8">
        <h1 className="text-3xl text-[#00FFFF] font-bold mb-4">Final Quiz Results</h1>
        <p className="text-[#AFCBE3] mb-6">No result found.</p>
        <button
          onClick={() => navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`)}
          className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded"
        >
          Back to Roadmap
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#04172D] text-white p-4 md:p-8 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#00FFFF]/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-20 w-72 h-72 rounded-full bg-[#00FFC2]/10 blur-3xl" />
      <div className="relative max-w-5xl mx-auto">
        <div className="backdrop-blur-xl bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 md:p-8 shadow-[0_20px_60px_rgba(0,255,255,0.08)]">
          <p className="text-xs uppercase tracking-[0.2em] text-[#AFCBE3] mb-2">Assessment Report</p>
          <h1 className="text-3xl text-[#00FFFF] font-bold mb-2">Final Quiz Results</h1>
          <p className={`inline-flex items-center px-3 py-1 rounded-full border text-sm font-semibold mb-6 ${statusTone}`}>
            {results.passed ? "Passed" : "Not Passed"}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4">
              <p className="text-xs text-[#AFCBE3]">Final Score</p>
              <p className="text-2xl font-bold text-[#00FFFF]">{results.score}%</p>
            </div>
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4">
              <p className="text-xs text-[#AFCBE3]">Attempts Used</p>
              <p className="text-2xl font-bold text-amber-300">{results.attemptsUsed ?? "-"}</p>
            </div>
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4">
              <p className="text-xs text-[#AFCBE3]">Attempts Left</p>
              <p className="text-2xl font-bold text-emerald-300">{results.attemptsLeft ?? "-"}</p>
            </div>
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4">
              <p className="text-xs text-[#AFCBE3]">Final Status</p>
              <p className="text-2xl font-bold text-[#AFCBE3] capitalize">{results.finalStatus || (results.passed ? "passed" : "open")}</p>
            </div>
          </div>

          <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-4 mb-6">
            <p className="text-sm text-[#AFCBE3] leading-relaxed">
              {results.message || (results.passed ? "You passed the final quiz." : "You did not pass this attempt.")}
            </p>
            {!results.passed && results.remediationPlan?.summary && (
              <div className="mt-3 p-3 rounded-lg border border-cyan-400/20 bg-cyan-500/5">
                <p className="text-cyan-300 text-sm font-semibold mb-1">Recommended focus</p>
                <p className="text-[#AFCBE3] text-sm">{results.remediationPlan.summary}</p>
              </div>
            )}
            {attemptsExhausted && (
              <p className="mt-2 text-red-300 text-sm font-semibold">
                You have used all 2 attempts. Final quiz is now locked for this cycle. Please contact your admin for next steps.
              </p>
            )}
            {results.autoSubmitted && (
              <p className="mt-2 text-yellow-300 text-sm font-semibold">
                Auto-submitted after 15-minute timer ended.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {results.certificateUnlocked && (
              <button
                onClick={() => navigate("/certificate", { state: { userId, companyId, deptId, companyName } })}
                className="px-5 py-2 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] rounded-lg font-semibold hover:brightness-110"
              >
                Claim Certificate
              </button>
            )}

            {!results.passed && results.attemptsLeft > 0 && (
              <button
                onClick={() => navigate(`/final-quiz/${companyId}/${deptId}/${userId}/${companyName}`)}
                className="px-5 py-2 border border-[#00FFFF] text-[#00FFFF] rounded-lg hover:bg-[#00FFFF15]"
              >
                Retry Final Quiz ({results.attemptsLeft} left)
              </button>
            )}

            {attemptsExhausted && (
              <span className="px-5 py-2 border border-red-400/40 text-red-300 rounded-lg bg-red-500/10">
                Attempts exhausted (2/2)
              </span>
            )}

            <button
              onClick={() => navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`)}
              className="px-5 py-2 border border-[#00FFFF] text-[#00FFFF] rounded-lg hover:bg-[#00FFFF15]"
            >
              Back to Roadmap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
