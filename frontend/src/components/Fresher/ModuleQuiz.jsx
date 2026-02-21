import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

export default function ModuleQuiz() {
	const { companyId, deptId, userId, moduleId } = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const companyName = location.state?.companyName;

	const [loading, setLoading] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [quiz, setQuiz] = useState(null);
	const [timeLeft, setTimeLeft] = useState(600);
	const [timerRunning, setTimerRunning] = useState(false);
	const [autoSubmitted, setAutoSubmitted] = useState(false);
	const [mcqAnswers, setMcqAnswers] = useState({});
	const [oneLinerAnswers, setOneLinerAnswers] = useState({});

	const canGenerate = useMemo(() => {
		return companyId && deptId && userId && moduleId;
	}, [companyId, deptId, userId, moduleId]);

	// Don't set quizOpened anymore - allow retries by default

	useEffect(() => {
		if (!timerRunning) return undefined;
		if (timeLeft <= 0) {
			setTimerRunning(false);
			return undefined;
		}

		const interval = setInterval(() => {
			setTimeLeft((prev) => Math.max(prev - 1, 0));
		}, 1000);

		return () => clearInterval(interval);
	}, [timerRunning, timeLeft]);

	const handleGenerate = async () => {
		if (!canGenerate) {
			setError("Missing required params to generate quiz.");
			return;
		}

		setError("");
		setQuiz(null);
		setMcqAnswers({});
		setOneLinerAnswers({});
		setTimeLeft(600);
		setTimerRunning(false);
		setAutoSubmitted(false);
		setLoading(true);

		try {
			const res = await fetch("http://localhost:5000/api/quiz/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ companyId, deptId, userId, moduleId }),
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data?.error || "Quiz generation failed");
			}

			setQuiz(data);
			setTimerRunning(true);
		} catch (err) {
			setError(err.message || "Quiz generation failed");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (!canGenerate) return;
		if (quiz || loading) return;
		handleGenerate();
	}, [canGenerate]);

	const handleSubmit = async () => {
		if (!quiz?.quizId) return;

		setError("");
		setSubmitting(true);

		try {
			const res = await fetch("http://localhost:5000/api/quiz/submit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					companyId,
					deptId,
					userId,
					moduleId,
					quizId: quiz.quizId,
					answers: {
						mcq: Object.entries(mcqAnswers).map(([id, selectedIndex]) => ({
							id,
							selectedIndex,
						})),
						oneLiners: Object.entries(oneLinerAnswers).map(([id, response]) => ({
							id,
							response,
						})),
					},
				}),
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data?.error || "Quiz submission failed");
			}

			navigate(
				`/quiz-results/${companyId}/${deptId}/${userId}/${moduleId}`,
				{ state: { results: data, companyName } }
			);
		} catch (err) {
			setError(err.message || "Quiz submission failed");
		} finally {
			setSubmitting(false);
		}
	};

	useEffect(() => {
		if (!quiz || submitting || autoSubmitted) return;
		if (timeLeft !== 0) return;
		setAutoSubmitted(true);
		handleSubmit();
	}, [timeLeft, quiz, submitting, autoSubmitted]);

	const formatTime = (seconds) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const goToRoadmap = () => {
		if (companyName) {
			navigate(`/roadmap/${companyId}/${deptId}/${userId}/${companyName}`);
			return;
		}
		navigate(-1);
	};

	const renderStatus = () => {
		
		if (submitting) {
			return (
				<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
					<div className="bg-[#021B36] border-2 border-[#00FFFF] rounded-xl p-8 shadow-2xl animate-pulse">
						<div className="flex flex-col items-center gap-4">
							<div className="relative w-16 h-16">
								<div className="absolute inset-0 border-4 border-[#00FFFF]/30 rounded-full"></div>
								<div className="absolute inset-0 border-4 border-t-[#00FFFF] rounded-full animate-spin"></div>
							</div>
							<p className="text-2xl font-bold text-[#00FFFF] animate-pulse">Submitting Quiz...</p>
							<p className="text-[#AFCBE3]">Please wait while we process your answers</p>
						</div>
					</div>
				</div>
			);
		}

		if (error) {
			return (
				<div className="text-[#FFAAAA]">{error}</div>
			);
		}

		return null;
	};

	return (
		<div className="min-h-screen bg-[#031C3A] text-white p-8">
			<div className="flex items-start justify-between mb-8">
				<div className="flex-1">
					<h1 className="text-4xl font-bold text-[#00FFFF] mb-2">Module Quiz</h1>
					<div className="flex items-center gap-3">
					
						<p className="text-[#AFCBE3] text-lg leading-relaxed">
							Test your knowledge with questions based on module content.
						</p>
					</div>
				</div>
				<div className="text-right">
					{quiz && (
						<p className="text-[#AFCBE3] text-lg font-semibold mb-4">
							Time Left: <span className="text-[#00FFFF]">{formatTime(timeLeft)}</span>
						</p>
					)}
					<p className="text-[#AFCBE3]/60 text-sm">
						Complete the quiz to continue<br />
						<span className="text-xs">You cannot exit during the assessment</span>
					</p>
				</div>
			</div>

			{loading && !quiz && (
				<div className="flex items-center justify-center py-16">
					<div className="flex flex-col items-center gap-4">
						<div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00FFFF]" />
						<p className="text-lg font-semibold">Generating quiz...</p>
						<p className="text-sm text-[#AFCBE3]">Please wait, this may take a few seconds.</p>
					</div>
				</div>
			)}

			{renderStatus()}

			{quiz && (
				<div className="space-y-6 -mt-2">
					<div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-8">
						<h2 className="text-2xl text-[#00FFFF] font-bold mb-6 flex items-center gap-2">
							<span className="w-8 h-8 bg-[#00FFFF]/20 rounded-full flex items-center justify-center text-sm">📋</span>
							MCQs (15)
						</h2>
						<div className="space-y-6">
							{quiz.mcq?.map((q, idx) => (
							<div key={q.id} className="bg-[#031C3A] border border-[#00FFFF20] p-6 rounded-lg hover:border-[#00FFFF40] transition-all duration-200">
								<p className="font-semibold mb-4 text-lg text-[#FFFFFF]">
									<span className="text-[#00FFFF]">{idx + 1}.</span> {q.question}
									</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
										{q.options?.map((opt, optIdx) => (
											<div
												key={optIdx}
												onClick={() => {
													if (timeLeft > 0) {
														setMcqAnswers((prev) => ({
															...prev,
															[q.id]: optIdx,
														}));
													}
												}}
												className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
													mcqAnswers[q.id] === optIdx
														? "bg-[#00FFFF]/20 border-[#00FFFF] text-[#00FFFF]"
														: "bg-[#031C3A] border-[#00FFFF30] text-[#AFCBE3] hover:border-[#00FFFF] hover:bg-[#031C3A]/70"
												} ${timeLeft === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
											>
												<div className="flex items-start gap-3">
													<input
														type="radio"
														name={`mcq-${q.id}`}
														value={optIdx}
														checked={mcqAnswers[q.id] === optIdx}
														disabled={timeLeft === 0}
														onChange={() => {}}
														className="mt-1 cursor-pointer"
													/>
													<span className="flex-1 leading-relaxed">{opt}</span>
												</div>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-8">
						<h2 className="text-2xl text-[#00FFFF] font-bold mb-6 flex items-center gap-2">
							<span className="w-8 h-8 bg-[#00FFFF]/20 rounded-full flex items-center justify-center text-sm">✏️</span>
							One Liners (5)
						</h2>
						<div className="space-y-6">
							{quiz.oneLiners?.map((q, idx) => (
							<div key={q.id} className="bg-[#031C3A] border border-[#00FFFF20] p-6 rounded-lg hover:border-[#00FFFF40] transition-all duration-200">
								<p className="font-semibold mb-4 text-lg text-[#FFFFFF]">
									<span className="text-[#00FFFF]">{idx + 1}.</span> {q.question}
									</p>
									<input
										type="text"
										className="w-full bg-[#031C3A] border-2 border-[#00FFFF30] rounded-lg p-3 text-white placeholder-[#AFCBE3]/50 transition-all duration-200 focus:outline-none focus:border-[#00FFFF] focus:bg-[#031C3A]/80 focus:shadow-lg focus:shadow-[#00FFFF]/20"
										value={oneLinerAnswers[q.id] || ""}
										disabled={timeLeft === 0}
										onChange={(e) =>
											setOneLinerAnswers((prev) => ({
												...prev,
												[q.id]: e.target.value,
											}))
										}
										placeholder="Type your answer here..."
									/>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{quiz && (
				<div className="flex justify-end mt-8">
					<button
						disabled={submitting || timeLeft === 0}
						onClick={handleSubmit}
						className="px-8 py-3 bg-gradient-to-r from-[#00FFFF] to-cyan-400 text-[#031C3A] font-semibold rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-[#00FFFF]/40 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
					>
						{submitting ? "Submitting..." : "Submit Answers"}
					</button>
				</div>
			)}

		</div>
	);
}
