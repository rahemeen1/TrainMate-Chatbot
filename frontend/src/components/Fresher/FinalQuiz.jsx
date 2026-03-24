import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const QUIZ_TIME_LIMIT_SECONDS = 15 * 60;

export default function FinalQuiz() {
  const { companyId, deptId, userId, companyName } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [quiz, setQuiz] = useState(null);
  const [mcqAnswers, setMcqAnswers] = useState({});
  const [oneLinerAnswers, setOneLinerAnswers] = useState({});
  const [codingAnswers, setCodingAnswers] = useState({});
  const [activeSection, setActiveSection] = useState("mcq");
  const [activeIndex, setActiveIndex] = useState(0);
  const [deadlineMsLeft, setDeadlineMsLeft] = useState(null);
  const [quizTimeLeft, setQuizTimeLeft] = useState(QUIZ_TIME_LIMIT_SECONDS);
  const [timerRunning, setTimerRunning] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [hasTriedGenerate, setHasTriedGenerate] = useState(false);

  const canGenerate = useMemo(() => companyId && deptId && userId, [companyId, deptId, userId]);

  const mcqList = quiz?.mcq || [];
  const oneLinerList = quiz?.oneLiners || [];
  const codingList = quiz?.coding || [];

  const currentList =
    activeSection === "mcq"
      ? mcqList
      : activeSection === "oneLiners"
      ? oneLinerList
      : codingList;

  const currentQuestion = currentList[activeIndex] || null;

  const answeredCount = {
    mcq: mcqList.filter((q) => Number.isInteger(mcqAnswers[q.id])).length,
    oneLiners: oneLinerList.filter((q) => (oneLinerAnswers[q.id] || "").trim().length > 0).length,
    coding: codingList.filter((q) => (codingAnswers[q.id] || "").trim().length > 0).length,
  };

  const totalQuestions = mcqList.length + oneLinerList.length + codingList.length;
  const totalAnswered = answeredCount.mcq + answeredCount.oneLiners + answeredCount.coding;
  const progressPercent = totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0;

  useEffect(() => {
    const fetchFinalQuiz = async () => {
      if (!canGenerate || quiz || loading || hasTriedGenerate) return;
      setHasTriedGenerate(true);
      setLoading(true);
      setError("");
      setErrorStatus("");
      setErrorMessage("");
      try {
        console.log("[FINAL-QUIZ][UI] Generating final quiz...");
        const res = await fetch("http://localhost:5000/api/quiz/final/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, deptId, userId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorStatus(data?.status || "");
          setErrorMessage(data?.message || data?.error || "Failed to generate final quiz");
          throw new Error(data?.message || data?.error || "Failed to generate final quiz");
        }
        setQuiz(data);
        setQuizTimeLeft(QUIZ_TIME_LIMIT_SECONDS);
        setTimerRunning(true);
        setAutoSubmitted(false);
        if ((data?.mcq || []).length > 0) {
          setActiveSection("mcq");
        } else if ((data?.oneLiners || []).length > 0) {
          setActiveSection("oneLiners");
        } else {
          setActiveSection("coding");
        }
        setActiveIndex(0);
      } catch (err) {
        console.error("[FINAL-QUIZ][UI] Generate failed:", err);
        setError(err.message || "Failed to load final quiz");
      } finally {
        setLoading(false);
      }
    };

    fetchFinalQuiz();
  }, [canGenerate, quiz, loading, hasTriedGenerate, companyId, deptId, userId]);

  useEffect(() => {
    if (!quiz?.deadlineAt) return;
    const tick = () => {
      const diff = new Date(quiz.deadlineAt).getTime() - Date.now();
      setDeadlineMsLeft(Math.max(diff, 0));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [quiz?.deadlineAt]);

  useEffect(() => {
    if (!timerRunning) return undefined;
    if (quizTimeLeft <= 0) {
      setTimerRunning(false);
      return undefined;
    }

    const interval = setInterval(() => {
      setQuizTimeLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [timerRunning, quizTimeLeft]);

  useEffect(() => {
    if (activeIndex > 0 && activeIndex >= currentList.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, currentList.length]);

  const formatTimeLeft = (ms) => {
    if (ms === null) return "No deadline";
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  const formatAttemptTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isFinalThirtySeconds = timerRunning && quizTimeLeft > 0 && quizTimeLeft <= 30;

  const getSectionLabel = (section) => {
    if (section === "mcq") return "MCQ";
    if (section === "oneLiners") return "One-Liner";
    return "Coding";
  };

  const isQuestionAnswered = (section, id) => {
    if (section === "mcq") return Number.isInteger(mcqAnswers[id]);
    if (section === "oneLiners") return (oneLinerAnswers[id] || "").trim().length > 0;
    return (codingAnswers[id] || "").trim().length > 0;
  };

  const firstUnansweredIndex = currentList.findIndex((q) => !isQuestionAnswered(activeSection, q.id));

  const goToNextQuestion = () => {
    if (activeIndex < currentList.length - 1) {
      setActiveIndex((prev) => prev + 1);
      return;
    }
    if (activeSection === "mcq" && oneLinerList.length > 0) {
      setActiveSection("oneLiners");
      setActiveIndex(0);
      return;
    }
    if ((activeSection === "mcq" || activeSection === "oneLiners") && codingList.length > 0) {
      setActiveSection("coding");
      setActiveIndex(0);
    }
  };

  const goToPreviousQuestion = () => {
    if (activeIndex > 0) {
      setActiveIndex((prev) => prev - 1);
      return;
    }
    if (activeSection === "coding" && oneLinerList.length > 0) {
      setActiveSection("oneLiners");
      setActiveIndex(Math.max(oneLinerList.length - 1, 0));
      return;
    }
    if ((activeSection === "coding" || activeSection === "oneLiners") && mcqList.length > 0) {
      setActiveSection("mcq");
      setActiveIndex(Math.max(mcqList.length - 1, 0));
    }
  };

  const submit = async (triggeredByTimerArg = false) => {
    const triggeredByTimer = triggeredByTimerArg === true;
    if (!quiz?.quizId) return;
    setSubmitting(true);
    setError("");
    setTimerRunning(false);
    try {
      console.log("[FINAL-QUIZ][UI] Submitting final quiz...", { triggeredByTimer });
      const res = await fetch("http://localhost:5000/api/quiz/final/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          deptId,
          userId,
          quizId: quiz.quizId,
          answers: {
            mcq: Object.entries(mcqAnswers).map(([id, selectedIndex]) => ({ id, selectedIndex })),
            oneLiners: Object.entries(oneLinerAnswers).map(([id, response]) => ({ id, response })),
            coding: Object.entries(codingAnswers).map(([id, code]) => ({ id, code })),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Final quiz submission failed");
      }

      navigate(`/final-quiz-results/${companyId}/${deptId}/${userId}/${companyName}`, {
        state: { results: { ...data, autoSubmitted: triggeredByTimer } },
      });
    } catch (err) {
      console.error("[FINAL-QUIZ][UI] Submit failed:", err);
      setError(err.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!quiz || submitting || autoSubmitted) return;
    if (quizTimeLeft !== 0) return;
    setAutoSubmitted(true);
    submit(true);
  }, [quizTimeLeft, quiz, submitting, autoSubmitted]);

  if (loading) {
    return <div className="min-h-screen bg-[#031C3A] text-white flex items-center justify-center">Generating final quiz...</div>;
  }

  if (error && !quiz) {
    const statusLabel = errorStatus || "locked";
    const friendlyTitle =
      statusLabel === "failed"
        ? "Final Quiz Attempts Exhausted"
        : statusLabel === "expired"
        ? "Final Quiz Window Expired"
        : "Unable to Start Final Quiz";

    const friendlyMessage =
      errorMessage ||
      (statusLabel === "failed"
        ? "You have used all final quiz attempts. Please contact your admin for next steps."
        : statusLabel === "expired"
        ? "Your final quiz window has expired. Please contact your admin."
        : "Final quiz is currently locked.");

    return (
      <div className="min-h-screen bg-[#04172D] text-white p-8">
        <div className="max-w-2xl mx-auto backdrop-blur-xl bg-[#031C3A]/70 border border-red-400/30 rounded-2xl p-6">
          <h2 className="text-2xl text-red-300 font-bold mb-3">{friendlyTitle}</h2>
          <p className="text-[#AFCBE3] mb-2">{friendlyMessage}</p>
          {statusLabel === "failed" && (
            <p className="text-sm text-yellow-300 mb-6">You have taken 2 out of 2 attempts.</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setHasTriedGenerate(false);
                setError("");
                setErrorStatus("");
                setErrorMessage("");
              }}
              className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded-lg hover:bg-[#00FFFF15]"
            >
              Retry Check
            </button>
            <button
              onClick={() => navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`)}
              className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded-lg hover:bg-[#00FFFF15]"
            >
              Back to Roadmap
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded-lg hover:bg-[#00FFFF15]"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#04172D] text-white p-4 md:p-8 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#00FFFF]/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-20 w-72 h-72 rounded-full bg-[#00FFC2]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl" />

      {isFinalThirtySeconds && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/20 border border-red-400 text-red-200 px-6 py-3 rounded-lg shadow-lg font-semibold animate-pulse">
          ⚠️ Final quiz auto-submits in {quizTimeLeft} second{quizTimeLeft !== 1 ? "s" : ""}
        </div>
      )}
      <div className="relative max-w-7xl mx-auto">
        <div className="backdrop-blur-xl bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-4 md:p-6 mb-5 shadow-[0_20px_60px_rgba(0,255,255,0.08)]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#AFCBE3] mb-2">TrainMate Assessment</p>
              <h1 className="text-2xl md:text-3xl text-[#00FFFF] font-bold">Final Certification Quiz</h1>
              <p className="text-[#AFCBE3] mt-1">
                Pass threshold: {quiz?.passThreshold ?? 70}%
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className={`text-sm font-semibold px-3 py-2 rounded-lg border ${quizTimeLeft <= 60 ? "bg-red-500/20 text-red-300 border-red-400/40" : "bg-[#00FFFF20] text-[#00FFFF] border-[#00FFFF40]"}`}>
                Attempt timer: {formatAttemptTimer(quizTimeLeft)}
              </div>
              <div className={`text-xs font-semibold px-3 py-2 rounded-lg border ${deadlineMsLeft !== null && deadlineMsLeft < 3600000 ? "bg-red-500/20 text-red-300 border-red-400/40" : "bg-[#00FFFF10] text-[#AFCBE3] border-[#00FFFF30]"}`}>
                Final deadline in: {formatTimeLeft(deadlineMsLeft)}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-3">
              <p className="text-xs text-[#AFCBE3]">Questions Answered</p>
              <p className="text-2xl font-bold text-[#00FFFF]">{totalAnswered}<span className="text-sm text-[#AFCBE3]">/{totalQuestions}</span></p>
            </div>
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-3">
              <p className="text-xs text-[#AFCBE3]">Current Section</p>
              <p className="text-2xl font-bold text-amber-300">{getSectionLabel(activeSection)}</p>
            </div>
            <div className="bg-[#031C3A]/80 border border-[#00FFFF20] rounded-xl p-3">
              <p className="text-xs text-[#AFCBE3]">Completion</p>
              <p className="text-2xl font-bold text-emerald-300">{progressPercent}%</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-[#AFCBE3] mb-1">
              <span>Overall progress</span>
              <span>{totalAnswered}/{totalQuestions} answered</span>
            </div>
            <div className="h-2.5 bg-[#031C3A] rounded-full overflow-hidden border border-[#00FFFF20]">
              <div className="h-full bg-gradient-to-r from-[#00FFFF] via-cyan-300 to-[#00FFC2] transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <aside className="lg:col-span-1 backdrop-blur-xl bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-4 h-fit lg:sticky lg:top-6 shadow-[0_10px_40px_rgba(0,255,255,0.07)]">
            <p className="text-sm font-semibold text-[#AFCBE3] mb-3">Sections</p>

            <button
              onClick={() => {
                setActiveSection("mcq");
                setActiveIndex(0);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg mb-2 border transition-all ${activeSection === "mcq" ? "bg-[#00FFFF25] text-[#00FFFF] border-[#00FFFF60]" : "bg-[#031C3A] text-[#AFCBE3] border-[#00FFFF20] hover:border-[#00FFFF40]"}`}
            >
              MCQ ({answeredCount.mcq}/{mcqList.length})
            </button>

            <button
              onClick={() => {
                setActiveSection("oneLiners");
                setActiveIndex(0);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg mb-2 border transition-all ${activeSection === "oneLiners" ? "bg-[#00FFFF25] text-[#00FFFF] border-[#00FFFF60]" : "bg-[#031C3A] text-[#AFCBE3] border-[#00FFFF20] hover:border-[#00FFFF40]"}`}
            >
              One-Liners ({answeredCount.oneLiners}/{oneLinerList.length})
            </button>

            <button
              onClick={() => {
                setActiveSection("coding");
                setActiveIndex(0);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${activeSection === "coding" ? "bg-[#00FFFF25] text-[#00FFFF] border-[#00FFFF60]" : "bg-[#031C3A] text-[#AFCBE3] border-[#00FFFF20] hover:border-[#00FFFF40]"}`}
            >
              Coding ({answeredCount.coding}/{codingList.length})
            </button>

            <div className="mt-4 p-3 rounded-lg bg-[#031C3A] border border-[#00FFFF20]">
              <p className="text-xs text-[#AFCBE3] mb-2">Quick Actions</p>
              <button
                onClick={() => {
                  if (firstUnansweredIndex >= 0) setActiveIndex(firstUnansweredIndex);
                }}
                disabled={firstUnansweredIndex < 0}
                className="w-full px-3 py-2 rounded-md text-sm bg-[#00FFFF20] text-[#00FFFF] border border-[#00FFFF40] disabled:opacity-40"
              >
                Jump To First Unanswered
              </button>
            </div>

            <p className="text-xs text-[#AFCBE3] mt-4 mb-2">Question navigation</p>
            <div className="grid grid-cols-6 gap-2">
              {currentList.map((q, idx) => {
                const isAnswered =
                  activeSection === "mcq"
                    ? Number.isInteger(mcqAnswers[q.id])
                    : activeSection === "oneLiners"
                    ? (oneLinerAnswers[q.id] || "").trim().length > 0
                    : (codingAnswers[q.id] || "").trim().length > 0;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={q.id}
                    onClick={() => setActiveIndex(idx)}
                    className={`h-8 rounded text-xs font-semibold border ${isActive ? "bg-[#00FFFF] text-[#031C3A] border-[#00FFFF]" : isAnswered ? "bg-green-500/30 text-green-300 border-green-400/30" : "bg-[#031C3A] text-[#AFCBE3] border-[#00FFFF20]"}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="lg:col-span-3 backdrop-blur-xl bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-4 md:p-6 shadow-[0_10px_40px_rgba(0,255,255,0.07)]">
            {!currentQuestion && (
              <p className="text-[#AFCBE3]">No questions available in this section.</p>
            )}

            {currentQuestion && activeSection === "mcq" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-[#AFCBE3]">MCQ {activeIndex + 1} of {mcqList.length}</p>
                </div>
                <p className="text-lg mb-4 leading-relaxed">{currentQuestion.question}</p>
                <div className="space-y-2">
                  {(currentQuestion.options || []).map((opt, oi) => (
                    <label key={`${currentQuestion.id}-${oi}`} className={`block text-sm p-3 rounded-lg border cursor-pointer transition-all ${mcqAnswers[currentQuestion.id] === oi ? "border-[#00FFFF] bg-[#00FFFF15] shadow-[0_0_0_1px_rgba(0,255,255,0.2)]" : "border-[#00FFFF30] bg-[#031C3A] hover:border-[#00FFFF60]"}`}>
                      <input
                        type="radio"
                        name={`mcq-${currentQuestion.id}`}
                        checked={mcqAnswers[currentQuestion.id] === oi}
                        onChange={() => setMcqAnswers((prev) => ({ ...prev, [currentQuestion.id]: oi }))}
                        disabled={quizTimeLeft === 0 || submitting}
                        className="mr-2"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {currentQuestion && activeSection === "oneLiners" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-[#AFCBE3]">One-Liner {activeIndex + 1} of {oneLinerList.length}</p>
                </div>
                <p className="text-lg mb-4 leading-relaxed">{currentQuestion.question}</p>
                <textarea
                  value={oneLinerAnswers[currentQuestion.id] || ""}
                  onChange={(e) => setOneLinerAnswers((prev) => ({ ...prev, [currentQuestion.id]: e.target.value }))}
                  disabled={quizTimeLeft === 0 || submitting}
                  className="w-full bg-[#031C3A] border border-[#00FFFF30] rounded-xl p-3 focus:outline-none focus:border-[#00FFFF] focus:shadow-[0_0_0_1px_rgba(0,255,255,0.3)]"
                  rows={6}
                  placeholder="Write a concise and accurate answer..."
                />
              </div>
            )}

            {currentQuestion && activeSection === "coding" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-[#AFCBE3]">Coding {activeIndex + 1} of {codingList.length}</p>
                </div>
                <p className="text-lg mb-4 leading-relaxed">{currentQuestion.question}</p>
                <textarea
                  value={codingAnswers[currentQuestion.id] || ""}
                  onChange={(e) => setCodingAnswers((prev) => ({ ...prev, [currentQuestion.id]: e.target.value }))}
                  disabled={quizTimeLeft === 0 || submitting}
                  className="w-full bg-[#031C3A] border border-[#00FFFF30] rounded-xl p-3 font-mono focus:outline-none focus:border-[#00FFFF] focus:shadow-[0_0_0_1px_rgba(0,255,255,0.3)]"
                  rows={12}
                  placeholder="Write your code solution here..."
                />
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-[#00FFFF20] flex flex-wrap items-center gap-3">
              <p className="text-xs text-[#AFCBE3] mr-auto">
                {getSectionLabel(activeSection)} • Question {activeIndex + 1} of {currentList.length}
              </p>
              <button
                onClick={goToPreviousQuestion}
                disabled={activeSection === "mcq" && activeIndex === 0}
                className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded-lg disabled:opacity-40 hover:bg-[#00FFFF15]"
              >
                Previous
              </button>
              <button
                onClick={goToNextQuestion}
                className="px-4 py-2 border border-[#00FFFF] text-[#00FFFF] rounded-lg hover:bg-[#00FFFF15]"
              >
                Next
              </button>
              <button
                onClick={() => submit(false)}
                disabled={submitting || quizTimeLeft === 0}
                className="px-6 py-2 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] rounded-lg font-semibold disabled:opacity-60 hover:brightness-110"
              >
                {submitting ? "Submitting..." : "Submit Final Quiz"}
              </button>
            </div>

            {error && <p className="text-red-400 mt-4">{error}</p>}
          </main>
        </div>
      </div>
    </div>
  );
}
