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
			<div className="flex items-start justify-between mb-6">
				<div>
					<h1 className="text-3xl font-bold text-[#00FFFF]">Module Quiz</h1>
					<p className="text-[#AFCBE3] mt-1">
						Generate a quiz from company and department knowledge base.
					</p>
				</div>
				<button
					onClick={goToRoadmap}
					className="px-5 py-2 border border-[#00FFFF] text-[#00FFFF] rounded hover:bg-[#00FFFF]/20 transition-all duration-300"
				>
					Back
				</button>
			</div>

			<div className="flex gap-3 mb-6">
				{quiz && (
					<div className="ml-auto text-[#AFCBE3]">
						Time Left: <span className="text-[#00FFFF]">{formatTime(timeLeft)}</span>
					</div>
				)}
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
				<div className="space-y-8">
					<div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6">
						<h2 className="text-xl text-[#00FFFF] font-semibold mb-4">MCQs (15)</h2>
						<div className="space-y-6">
							{quiz.mcq?.map((q, idx) => (
								<div key={q.id} className="bg-[#031C3A] p-4 rounded-lg">
									<p className="font-medium mb-3">
										{idx + 1}. {q.question}
									</p>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
										{q.options?.map((opt, optIdx) => (
											<label
												key={optIdx}
												className="flex items-center gap-2 text-[#AFCBE3]"
											>
												<input
													type="radio"
													name={`mcq-${q.id}`}
													value={optIdx}
													checked={mcqAnswers[q.id] === optIdx}
													disabled={timeLeft === 0}
													onChange={() =>
														setMcqAnswers((prev) => ({
															...prev,
															[q.id]: optIdx,
														}))
													}
												/>
												{opt}
											</label>
										))}
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6">
						<h2 className="text-xl text-[#00FFFF] font-semibold mb-4">One Liners (5)</h2>
						<div className="space-y-6">
							{quiz.oneLiners?.map((q, idx) => (
								<div key={q.id} className="bg-[#031C3A] p-4 rounded-lg">
									<p className="font-medium mb-3">
										{idx + 1}. {q.question}
									</p>
									<input
										type="text"
										className="w-full bg-[#021B36] border border-[#00FFFF30] rounded p-2 text-white"
										value={oneLinerAnswers[q.id] || ""}
										disabled={timeLeft === 0}
										onChange={(e) =>
											setOneLinerAnswers((prev) => ({
												...prev,
												[q.id]: e.target.value,
											}))
										}
										placeholder="Your answer"
									/>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{quiz && (
				<div className="flex justify-end mt-6">
					<button
						disabled={submitting || timeLeft === 0}
						onClick={handleSubmit}
						className="px-6 py-3 border border-[#00FFFF] text-[#00FFFF] rounded disabled:opacity-50"
					>
						Submit Answers
					</button>
				</div>
			)}

		</div>
	);
}
