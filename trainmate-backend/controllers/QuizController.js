import admin from "firebase-admin";
import { db } from "../config/firebase.js";
import { getPineconeIndex } from "../config/pinecone.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CohereClient } from "cohere-ai";
import { updateMemoryAfterQuiz } from "../services/memoryService.js";
import { evaluateCode } from "../services/codeEvaluator.service.js";
import { policyEngine } from "../services/policy/policyEngine.service.js";
import { createDailyModuleReminder, createQuizUnlockReminder } from "../services/calendarService.js";
import { sendTrainingLockedEmail, sendQuizSecurityAlertEmail, sendFinalQuizOpenedEmail, sendTrainingCompletedEmail, sendFinalQuizFailedEmail, sendTrainingSummaryReportEmail } from "../services/emailService.js";
import { generateTrainingSummaryPDF } from "../services/pdfService.js";

let primaryModel = null;
let fallbackModel = null;

function initializeQuizModels() {
  if (!primaryModel || !fallbackModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    primaryModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }
  return { primaryModel, fallbackModel };
}

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

// Agentic quiz system - AI makes dynamic decisions
const QUIZ_MAX_RETRIES = 2;
const PLAN_MAX_QUERIES = 4;
const MAX_CONTEXT_CHARS = 8000;
const QUIZ_PASS_THRESHOLD = 80; // Base threshold, AI can adjust
const MAX_QUIZ_ATTEMPTS = 3; // Maximum possible attempts (AI decides actual count)
const ADMIN_FINAL_RETRY_ATTEMPTS = 1;
const QUIZ_UNLOCK_TIME_PERCENT = 0.7; // Quiz unlocks after 70% of module time
const TRAINING_LOCK_TEST_EMAIL = "trainmate01@gmail.com";
const FINAL_QUIZ_MAX_ATTEMPTS = 2;
const FINAL_QUIZ_PASS_THRESHOLD = 70;
const FINAL_QUIZ_WINDOW_DAYS = 2;
const TRAINING_SUMMARY_NOTIFICATION_TYPE = "training_summary_report";
const VALID_LICENSE_PLANS = new Set(["License Basic", "License Pro"]);
const DEPARTMENT_OPTIONS = ["HR", "SOFTWAREDEVELOPMENT", "AI", "ACCOUNTING", "MARKETING", "OPERATIONS", "DATASCIENCE", "IT"];
const CODING_ENABLED_DEPARTMENTS = new Set(["SOFTWAREDEVELOPMENT", "AI", "DATASCIENCE", "IT"]);

function normalizeDepartmentKey(value) {
	return String(value || "")
		.toUpperCase()
		.replace(/[^A-Z]/g, "");
}

function isQuizTestBypassEnabled() {
	return String(process.env.FORCE_UNLOCK_QUIZ_FOR_TESTING || "false").toLowerCase() === "true";
}

function normalizeLicensePlan(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (VALID_LICENSE_PLANS.has(trimmed)) return trimmed;

	const normalized = trimmed.toLowerCase();
	if (normalized === "license pro" || normalized === "pro") return "License Pro";
	if (normalized === "license basic" || normalized === "basic") return "License Basic";

	return null;
}

function toMillis(value) {
	if (!value) return 0;
	if (value instanceof Date) return value.getTime();
	if (typeof value?.toDate === "function") return value.toDate().getTime();
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function getLatestDocData(snapshot) {
	if (!snapshot || snapshot.empty) return null;

	const docs = snapshot.docs.slice().sort((a, b) => {
		const aMs = toMillis(a.data()?.createdAt);
		const bMs = toMillis(b.data()?.createdAt);
		return bMs - aMs;
	});

	return docs[0]?.data() || null;
}

async function resolveCompanyLicensePlan(companyId, preloadedCompanySnap = null) {
	const companyRef = db.collection("companies").doc(companyId);

	try {
		const billingSnap = await companyRef.collection("billingPayments").get();
		const latestBilling = getLatestDocData(billingSnap);
		const billingPlan = normalizeLicensePlan(latestBilling?.plan || latestBilling?.Plan);
		if (billingPlan) return { plan: billingPlan, source: "billingPayments" };

		const onboardingSnap = await companyRef.collection("onboardingAnswers").get();
		const latestOnboarding = getLatestDocData(onboardingSnap);
		const answers = latestOnboarding?.answers || {};
		const onboardingPlan =
			normalizeLicensePlan(answers?.[2]) ||
			normalizeLicensePlan(answers?.["2"]) ||
			normalizeLicensePlan(answers?.[0]) ||
			normalizeLicensePlan(answers?.["0"]);
		if (onboardingPlan) return { plan: onboardingPlan, source: "onboardingAnswers" };

		const companySnap = preloadedCompanySnap || (await companyRef.get());
		const companyPlan = normalizeLicensePlan(companySnap.data()?.licensePlan || companySnap.data()?.plan);
		if (companyPlan) return { plan: companyPlan, source: "companies.licensePlan" };
	} catch (err) {
		console.warn("⚠️ [LICENSE] Failed to resolve company plan:", err?.message || err);
	}

	return { plan: "License Basic", source: "default" };
}

async function notifyTrainingLockForTesting({
	companyId,
	userName,
	userEmail,
	moduleTitle,
	attemptNumber,
	score,
}) {
	try {
		const companySnap = await db.collection("companies").doc(companyId).get();
		const companyData = companySnap.exists ? companySnap.data() : {};
		const companyName = companyData?.name || "TrainMate Company";

		await sendTrainingLockedEmail({
			companyEmail: TRAINING_LOCK_TEST_EMAIL,
			companyName,
			userName: userName || "",
			userEmail: userEmail || "",
			moduleTitle: moduleTitle || "",
			attemptNumber,
			score,
		});
		console.log(`Training lock notification sent to ${TRAINING_LOCK_TEST_EMAIL}`);
	} catch (emailErr) {
		console.warn("Training lock email failed (non-critical):", emailErr.message);
	}
}

/**
 * Calculate when quiz should be unlocked (70% of module time)
 * @param {Date} moduleStartDate - When module became active
 * @param {number} estimatedDays - Total estimated days for the module
 * @returns {Date} - The date/time when quiz unlocks
 */
function calculateQuizUnlockTime(moduleStartDate, estimatedDays) {
	if (!moduleStartDate || !estimatedDays) return null;
	
	const startTime = moduleStartDate instanceof Date 
		? moduleStartDate.getTime() 
		: moduleStartDate.toDate ? moduleStartDate.toDate().getTime() : new Date(moduleStartDate).getTime();
	
	const unlockDelay = estimatedDays * QUIZ_UNLOCK_TIME_PERCENT * 24 * 60 * 60 * 1000; // 70% of days in ms
	return new Date(startTime + unlockDelay);
}

/**
 * Check if quiz is unlocked based on time requirement
 * @param {Object} moduleData - Module data from Firestore
 * @returns {Object} - { isUnlocked: boolean, unlockTime: Date, remainingTime: string }
 */
function checkQuizTimeUnlock(moduleData) {
	// TEMPORARY TEST OVERRIDE: disable the 70% time-lock gate.
	// Restore original logic below when time-based locking should be enforced again.
	console.log("[QUIZ][DEBUG] checkQuizTimeUnlock override active", {
		moduleId: moduleData?.id || null,
		moduleTitle: moduleData?.moduleTitle || null,
		startedAt: moduleData?.startedAt || moduleData?.startDate || moduleData?.FirstTimeCreatedAt || moduleData?.createdAt || null,
		estimatedDays: moduleData?.estimatedDays || null,
	});
	return {
		isUnlocked: true,
		unlockTime: null,
		remainingTime: null,
		message: "Quiz is available (temporary time-lock override).",
	};

	/*
	const startDate = moduleData.startedAt || moduleData.startDate || moduleData.FirstTimeCreatedAt || moduleData.createdAt;
	const estimatedDays = moduleData.estimatedDays || 1;
	
	if (!startDate) {
		return {
			isUnlocked: false,
			unlockTime: null,
			remainingTime: "Module not started yet",
			message: "Please start the module before attempting the quiz."
		};
	}
	
	const unlockTime = calculateQuizUnlockTime(startDate, estimatedDays);
	const now = Date.now();
	const unlockTimestamp = unlockTime.getTime();
	
	if (now >= unlockTimestamp) {
		return {
			isUnlocked: true,
			unlockTime,
			remainingTime: null,
			message: "Quiz is now available!"
		};
	}
	
	// Calculate remaining time
	const remainingMs = unlockTimestamp - now;
	const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
	const remainingHours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
	const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
	
	let remainingTimeStr = "";
	if (remainingDays > 0) {
		remainingTimeStr = `${remainingDays} day${remainingDays > 1 ? 's' : ''} and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
	} else if (remainingHours > 0) {
		remainingTimeStr = `${remainingHours} hour${remainingHours !== 1 ? 's' : ''} and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
	} else {
		remainingTimeStr = `${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
	}
	
	return {
		isUnlocked: false,
		unlockTime,
		remainingTime: remainingTimeStr,
		message: `Quiz will be available after you've spent 70% of the module time. Unlock in: ${remainingTimeStr}`
	};
	*/
}

async function createOrUpdateModuleLockNotification({
	companyId,
	deptId,
	userId,
	moduleId,
	userName,
	userEmail,
	moduleTitle,
	attemptNumber,
	score,
}) {
	const notificationId = `module-lock-${deptId}-${userId}-${moduleId}`;
	const notificationRef = db
		.collection("companies")
		.doc(companyId)
		.collection("adminNotifications")
		.doc(notificationId);

	await notificationRef.set(
		{
			type: "module_lock",
			status: "pending",
			companyId,
			deptId,
			userId,
			moduleId,
			userName: userName || "",
			userEmail: userEmail || "",
			moduleTitle: moduleTitle || "",
			attemptNumber,
			score,
			message: `${userName || "Fresher"} exceeded quiz retries for ${moduleTitle || "module"}. Give one final retry?`,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			resolvedAt: null,
		},
		{ merge: true }
	);

	return notificationId;
}

async function createTrainingCompletionNotification({
	companyId,
	deptId,
	userId,
	userName,
	userEmail,
	finalScore,
}) {
	const notificationId = `training-complete-${deptId}-${userId}`;
	const notificationRef = db
		.collection("companies")
		.doc(companyId)
		.collection("adminNotifications")
		.doc(notificationId);

	await notificationRef.set(
		{
			type: "training_completion",
			status: "pending",
			companyId,
			deptId,
			userId,
			userName: userName || "",
			userEmail: userEmail || "",
			score: typeof finalScore === "number" ? finalScore : null,
			message: `${userName || "A fresher"} completed full training and unlocked certificate with ${typeof finalScore === "number" ? `${finalScore}%` : "N/A"}.`,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			resolvedAt: null,
		},
		{ merge: true }
	);

	return notificationId;
}

async function createFinalQuizFailedNotification({
	companyId,
	deptId,
	userId,
	userName,
	userEmail,
	attemptsUsed,
	maxAttempts,
	finalScore,
}) {
	const notificationId = `final-quiz-failed-${deptId}-${userId}`;
	const notificationRef = db
		.collection("companies")
		.doc(companyId)
		.collection("adminNotifications")
		.doc(notificationId);

	await notificationRef.set(
		{
			type: "final_quiz_failed",
			status: "pending",
			companyId,
			deptId,
			userId,
			userName: userName || "",
			userEmail: userEmail || "",
			attemptsUsed: Number(attemptsUsed) || 0,
			maxAttempts: Number(maxAttempts) || FINAL_QUIZ_MAX_ATTEMPTS,
			score: typeof finalScore === "number" ? finalScore : null,
			message: `${userName || "A fresher"} failed the final quiz after ${attemptsUsed}/${maxAttempts} attempts.${typeof finalScore === "number" ? ` Last score: ${finalScore}%.` : ""}`,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			resolvedAt: null,
		},
		{ merge: true }
	);

	return notificationId;
}

async function unlockNextModuleForUser({ userRef, currentModuleOrder }) {
	const roadmapSnap = await userRef.collection("roadmap").orderBy("order").get();
	const modules = roadmapSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
	const nextModule = modules
		.filter((mod) => (mod.order || 0) > currentModuleOrder && !mod.completed)
		.sort((a, b) => (a.order || 0) - (b.order || 0))[0];

	if (!nextModule) return null;

	await userRef.collection("roadmap").doc(nextModule.id).set(
		{
			status: "in-progress",
			moduleLocked: false,
			startedAt: admin.firestore.FieldValue.serverTimestamp(),
		},
		{ merge: true }
	);

	return nextModule;
}

async function getFinalAttemptsUsed(userRef, fallback = 0) {
	try {
		const attemptsSnap = await userRef.collection("finalQuizAttempts").get();
		return Math.max(Number(fallback) || 0, attemptsSnap.size);
	} catch (err) {
		console.warn("⚠️ [FINAL-QUIZ] Could not read finalQuizAttempts, using fallback:", err.message);
		return Number(fallback) || 0;
	}
}

function toDateSafe(value) {
	if (!value) return null;
	if (value instanceof Date) return value;
	if (value?.toDate) return value.toDate();
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function areAllModulesCompleted(modules = []) {
	if (!Array.isArray(modules) || modules.length === 0) return false;
	return modules.every((m) => {
		const status = String(m.status || "").toLowerCase();
		if (status === "expired") return false;
		return status === "completed" || !!m.completed;
	});
}

function toIsoDateOrNull(value) {
	const date = toDateSafe(value);
	return date ? date.toISOString() : null;
}

async function maybeGenerateCompletionSummaryReport({
	companyId,
	deptId,
	userId,
	userRef,
	userData = {},
	companyData = {},
	triggerSource = "final_assessment_open",
}) {
	try {
		const roadmapSnap = await userRef.collection("roadmap").orderBy("order").get();
		const modules = roadmapSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

		if (!areAllModulesCompleted(modules)) {
			return { created: false, reason: "NOT_ALL_MODULES_COMPLETED" };
		}

		const existingSummary = userData?.trainingSummaryReport || {};
		if (existingSummary?.notificationId || existingSummary?.generatedAt) {
			return { created: false, reason: "ALREADY_GENERATED", notificationId: existingSummary?.notificationId || null };
		}

		const moduleRows = modules
			.sort((a, b) => (a.order || 0) - (b.order || 0))
			.map((m, idx) => ({
				index: idx + 1,
				order: m.order || idx + 1,
				title: m.moduleTitle || "Untitled Module",
				estimatedDays: Number(m.estimatedDays) || 0,
				quizAttempts: Number(m.quizAttempts) || 0,
				quizPassed: !!m.quizPassed,
				status: String(m.status || "").toLowerCase() || (m.completed ? "completed" : "unknown"),
				completed: !!m.completed || String(m.status || "").toLowerCase() === "completed",
			}));

		const completedModules = moduleRows.filter((m) => m.completed).length;
		const totalModules = moduleRows.length;
		const totalQuizAttempts = moduleRows.reduce((sum, m) => sum + (Number(m.quizAttempts) || 0), 0);
		const avgAttemptsPerModule = totalModules ? Number((totalQuizAttempts / totalModules).toFixed(2)) : 0;
		const totalEstimatedDays = moduleRows.reduce((sum, m) => sum + (Number(m.estimatedDays) || 0), 0);
		const finalAssessment = userData?.finalAssessment || {};
		const finalScore = typeof userData?.certificateFinalQuizScore === "number"
			? userData.certificateFinalQuizScore
			: (typeof finalAssessment?.lastScore === "number" ? finalAssessment.lastScore : null);

		const reportPayload = {
			userName: userData?.name || "Learner",
			userEmail: userData?.email || "",
			userPhone: userData?.phone || "",
			companyName: companyData?.name || "TrainMate",
			departmentId: deptId,
			trainingOn: userData?.trainingOn || "N/A",
			trainingLevel: userData?.trainingLevel || "N/A",
			profileStatus: userData?.status || "active",
			certificateUnlocked: !!userData?.certificateUnlocked,
			certificateTitle: userData?.certificateFinalQuizTitle || "N/A",
			finalScore,
			progressPercent: Number(userData?.progress) || 0,
			completedModules,
			totalModules,
			totalQuizAttempts,
			avgAttemptsPerModule,
			totalEstimatedDays,
			activeDays: Number(userData?.trainingStats?.activeDays) || 0,
			currentStreak: Number(userData?.trainingStats?.currentStreak) || 0,
			missedDays: Number(userData?.trainingStats?.missedDays) || 0,
			totalExpectedDays: Number(userData?.trainingStats?.totalExpectedDays) || 0,
			finalQuizStatus: finalAssessment?.status || "open",
			finalQuizAttemptsUsed: Number(finalAssessment?.attemptsUsed) || 0,
			finalQuizMaxAttempts: Number(finalAssessment?.maxAttempts) || FINAL_QUIZ_MAX_ATTEMPTS,
			finalQuizDeadline: toIsoDateOrNull(finalAssessment?.deadlineAt),
			generatedAt: new Date().toISOString(),
			modules: moduleRows,
		};

		const pdfBuffer = await generateTrainingSummaryPDF(reportPayload);
		const reportId = `training-summary-${deptId}-${userId}`;
		const reportDownloadUrl = `http://localhost:5000/api/quiz/final/report/${companyId}/${deptId}/${userId}`;

		const notificationRef = db
			.collection("companies")
			.doc(companyId)
			.collection("adminNotifications")
			.doc(reportId);

		await notificationRef.set(
			{
				type: TRAINING_SUMMARY_NOTIFICATION_TYPE,
				status: "pending",
				companyId,
				deptId,
				userId,
				userName: userData?.name || "",
				userEmail: userData?.email || "",
				score: typeof finalScore === "number" ? finalScore : null,
				reportId,
				reportDownloadUrl,
				triggerSource,
				summary: {
					progressPercent: reportPayload.progressPercent,
					completedModules,
					totalModules,
					totalQuizAttempts,
					trainingLevel: reportPayload.trainingLevel,
				},
				message: `${userData?.name || "This user"} has completed all modules. This is the summarized report.`,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				resolvedAt: null,
			},
			{ merge: true }
		);

		await userRef.set(
			{
				trainingSummaryReport: {
					reportId,
					notificationId: reportId,
					triggerSource,
					reportDownloadUrl,
					generatedAt: new Date(),
					lastGeneratedAt: new Date(),
					completedModules,
					totalModules,
					totalQuizAttempts,
					finalScore,
				},
			},
			{ merge: true }
		);

		const companyEmail = companyData?.email || companyData?.companyEmail || null;
		if (companyEmail) {
			try {
				await sendTrainingSummaryReportEmail({
					companyEmail,
					companyName: companyData?.name || "TrainMate",
					userName: userData?.name || "Learner",
					userEmail: userData?.email || "",
					deptId,
					finalScore,
					completedModules,
					totalModules,
					totalQuizAttempts,
					pdfBuffer,
				});
				console.log("🧪 [FINAL-QUIZ] Training summary report email sent to company admin.");
			} catch (emailErr) {
				console.warn("⚠️ [FINAL-QUIZ] Failed to send training summary report email:", emailErr.message);
			}
		} else {
			console.warn("⚠️ [FINAL-QUIZ] Company email not found. Summary report notification created without email.");
		}

		return { created: true, reportId, reportDownloadUrl };
	} catch (err) {
		console.warn("⚠️ [FINAL-QUIZ] Summary report generation failed (non-blocking):", err.message);
		return { created: false, reason: "ERROR", error: err.message };
	}
}

async function maybeOpenFinalAssessment({ userRef, userData = {}, companyName = "TrainMate" }) {
	console.log("🧪 [FINAL-QUIZ] Checking eligibility to open final assessment...");
	const userPathSegments = userRef.path.split("/");
	const companyId = userPathSegments[1] || "";
	const deptId = userPathSegments[3] || "";
	const userId = userPathSegments[5] || "";
	const roadmapSnap = await userRef.collection("roadmap").orderBy("order").get();
	const modules = roadmapSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

	if (!areAllModulesCompleted(modules)) {
		console.log("🧪 [FINAL-QUIZ] Not opening final assessment: not all modules completed.");
		return { opened: false, reason: "NOT_ELIGIBLE", modulesCompleted: false };
	}

	const current = userData?.finalAssessment || {};
	if (current.status === "passed") {
		console.log("🧪 [FINAL-QUIZ] Already passed. No new opening needed.");
		return { opened: false, reason: "ALREADY_PASSED", finalAssessment: current };
	}

	const currentAttemptsUsed = await getFinalAttemptsUsed(userRef, current.attemptsUsed);
	const currentMaxAttempts = Number(current.maxAttempts) || FINAL_QUIZ_MAX_ATTEMPTS;
	const currentDeadline = toDateSafe(current.deadlineAt);
	console.log("🧪 [FINAL-QUIZ] Attempt guard values:", {
		storedAttemptsUsed: Number(current.attemptsUsed) || 0,
		effectiveAttemptsUsed: currentAttemptsUsed,
		currentMaxAttempts,
		status: current.status || "unknown",
	});
	if (currentAttemptsUsed >= currentMaxAttempts && current.status !== "passed") {
		await userRef.set({
			finalAssessment: {
				...current,
				status: "failed",
			},
		}, { merge: true });
		console.log("🧪 [FINAL-QUIZ] Not opening: attempts already exhausted.");
		return {
			opened: false,
			reason: "ATTEMPTS_EXHAUSTED",
			finalAssessment: {
				...current,
				status: "failed",
			},
		};
	}

	if (currentDeadline && new Date() > currentDeadline && current.status !== "passed") {
		await userRef.set({
			finalAssessment: {
				...current,
				status: "expired",
			},
		}, { merge: true });
		console.log("🧪 [FINAL-QUIZ] Not opening: final assessment deadline expired.");
		return {
			opened: false,
			reason: "EXPIRED",
			finalAssessment: {
				...current,
				status: "expired",
			},
		};
	}

	const now = new Date();
	const deadline = new Date(now.getTime() + FINAL_QUIZ_WINDOW_DAYS * 24 * 60 * 60 * 1000);
	const nextFinalAssessment = {
		status: "open",
		openedAt: now,
		deadlineAt: deadline,
		maxAttempts: FINAL_QUIZ_MAX_ATTEMPTS,
		attemptsUsed: currentAttemptsUsed,
		passThreshold: FINAL_QUIZ_PASS_THRESHOLD,
		emailSentAt: current.emailSentAt || null,
		lastAttemptAt: current.lastAttemptAt || null,
		lastScore: current.lastScore || null,
		quizId: "current",
	};

	await userRef.set({
		finalAssessment: nextFinalAssessment,
		certificateUnlocked: userData?.certificateUnlocked || false,
	}, { merge: true });

	console.log("🧪 [FINAL-QUIZ] Final assessment marked OPEN.", {
		deadlineAt: deadline.toISOString(),
		maxAttempts: FINAL_QUIZ_MAX_ATTEMPTS,
		passThreshold: FINAL_QUIZ_PASS_THRESHOLD,
	});

	let companyData = { name: companyName };
	if (companyId) {
		try {
			const companySnap = await db.collection("companies").doc(companyId).get();
			if (companySnap.exists) {
				companyData = companySnap.data() || companyData;
			}
		} catch (companyErr) {
			console.warn("⚠️ [FINAL-QUIZ] Failed to load company data for summary report:", companyErr.message);
		}
	}

	await maybeGenerateCompletionSummaryReport({
		companyId,
		deptId,
		userId,
		userRef,
		userData,
		companyData,
		triggerSource: "final_quiz_open",
	});

	if (!current.emailSentAt && userData?.email) {
		const deadlineText = deadline.toLocaleString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
		try {
			await sendFinalQuizOpenedEmail({
				userEmail: userData.email,
				userName: userData.name || "Learner",
				companyName,
				deadlineText,
				maxAttempts: FINAL_QUIZ_MAX_ATTEMPTS,
				passThreshold: FINAL_QUIZ_PASS_THRESHOLD,
			});
			await userRef.set({
				finalAssessment: {
					...nextFinalAssessment,
					emailSentAt: new Date(),
				},
			}, { merge: true });
			console.log("🧪 [FINAL-QUIZ] Final quiz opened email sent.");
		} catch (emailErr) {
			console.warn("⚠️ [FINAL-QUIZ] Failed to send opening email:", emailErr.message);
		}
	}

	return { opened: true, reason: "OPENED", finalAssessment: nextFinalAssessment };
}

async function embedText(text) {
	const res = await cohere.embed({
		model: "embed-english-v3.0",
		texts: [text],
		inputType: "search_query",
	});
	return res.embeddings[0];
}

async function queryPinecone({ embedding, companyId, deptId, topK = 8 }) {
	const index = getPineconeIndex();
	const res = await index
		.namespace(`company-${companyId}`)
		.query({
			vector: embedding,
			topK,
			includeMetadata: true,
			filter: { deptName: { $eq: deptId.toUpperCase() } },
		});

	return (res.matches || []).map((m) => ({
		text: m.metadata?.text || "",
		score: m.score || 0,
	}));
}

function safeParseJson(text) {
	const trimmed = text.replace(/```json/g, "").replace(/```/g, "").trim();
	const jsonStart = trimmed.indexOf("{");
	const jsonEnd = trimmed.lastIndexOf("}");
	if (jsonStart === -1 || jsonEnd === -1) return null;
	const cleanJson = trimmed.substring(jsonStart, jsonEnd + 1);
	try {
		return JSON.parse(cleanJson);
	} catch (err) {
		return null;
	}
}

function normalizeText(value) {
	return String(value || "")
		.trim()
		.toLowerCase();
}

function truncateText(text, maxChars) {
	if (!text) return "";
	return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/**
 * Validate quiz structure (AI-decided, so flexible validation)
 * @param {Object} quiz - Quiz object
 * @param {boolean} allowCoding - Whether department allows coding questions
 * @returns {boolean} - Whether quiz structure is valid
 */
function isQuizComplete(quiz, allowCoding = false) {
	if (!quiz || !Array.isArray(quiz.mcq) || !Array.isArray(quiz.oneLiners)) {
		return false;
	}
	
	// AI decides counts, so just check minimum reasonable values
	if (quiz.mcq.length < 5 || quiz.mcq.length > 25) return false;
	if (quiz.oneLiners.length < 2 || quiz.oneLiners.length > 15) return false;
	
	const mcqValid = quiz.mcq.every((q) => 
		Array.isArray(q.options) && 
		q.options.length === 4 && 
		Number.isInteger(q.correctIndex) && 
		q.correctIndex >= 0 && 
		q.correctIndex < 4
	);
	
	const oneLinersValid = quiz.oneLiners.every((q) => q.question && q.answer);
	
	// Coding questions validation (only if department allows)
	const codingValid = !Array.isArray(quiz.coding) || 
		quiz.coding.length === 0 ||
		(allowCoding && quiz.coding.every((q) => q.question && q.expectedApproach && q.language));
	
	// If coding exists but not allowed, fail validation
	if (quiz.coding && quiz.coding.length > 0 && !allowCoding) {
		return false;
	}
	
	return mcqValid && oneLinersValid && codingValid;
}

function mergeDocs(docsList) {
	const map = new Map();
	for (const doc of docsList) {
		const key = doc.text || "";
		if (!key) continue;
		const prev = map.get(key);
		if (!prev || (doc.score || 0) > (prev.score || 0)) {
			map.set(key, doc);
		}
	}
	return Array.from(map.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
}

async function generateAgenticPlan({ title, baseContext, agentMemorySnippet }) {
	const prompt = `
You are a planning agent for corporate training quiz generation.

MODULE: "${title}"

BASE CONTEXT (may be partial):
${truncateText(baseContext, 1200)}

PERSONALIZED CONTEXT (optional):
${truncateText(agentMemorySnippet, 800)}

Create a compact retrieval plan that identifies the most important subtopics and suggests targeted search queries.

Return JSON only in this format:
{
  "queries": ["string"],
  "focusAreas": ["string"],
  "difficulty": "advanced"
}

Constraints:
- 2 to ${PLAN_MAX_QUERIES} queries
- Queries should be concise and specific
- Output valid JSON only
`;

	try {
		const result = await generateWithRetry(prompt);
		const text = result?.response?.text()?.trim() || "";
		const parsed = safeParseJson(text);
		const queries = Array.isArray(parsed?.queries) ? parsed.queries.slice(0, PLAN_MAX_QUERIES) : [];
		const focusAreas = Array.isArray(parsed?.focusAreas) ? parsed.focusAreas.slice(0, 6) : [];
		if (queries.length >= 2) {
			return { queries, focusAreas, difficulty: parsed?.difficulty || "advanced" };
		}
	} catch (err) {
		console.warn("Agentic plan generation failed, using fallback plan:", err.message);
	}

	return {
		queries: [
			`${title} policies and procedures`,
			`${title} best practices and pitfalls`,
			`${title} real-world scenarios and troubleshooting`,
		],
		focusAreas: ["definitions", "procedures", "best practices", "scenarios"],
		difficulty: "advanced",
	};
}

async function fetchPlannedDocs({ queries, companyId, deptId }) {
	const results = [];
	for (const q of queries) {
		try {
			const embedding = await embedText(q);
			const docs = await queryPinecone({ embedding, companyId, deptId, topK: 6 });
			results.push(...docs);
		} catch (err) {
			console.warn(`Planned retrieval failed for query "${q}":`, err.message);
		}
	}
	return results;
}

function buildQuizPrompt({ title, context, critiqueIssues, allowCoding = false, moduleDescription = "", companyName = "", deptName = "", skillBlueprint = {} }) {
	const critiqueBlock = critiqueIssues && critiqueIssues.length
		? `\n\nCRITIQUE ISSUES TO FIX:\n- ${critiqueIssues.join("\n- ")}`
		: "";
	const skillBlock = skillBlueprint && Object.keys(skillBlueprint).length
		? `\n\nSKILL ALIGNMENT BLUEPRINT:\n${JSON.stringify(skillBlueprint, null, 2)}`
		: "";
	const codingBlock = allowCoding ? `
5. Coding Questions (OPTIONAL - YOU DECIDE HOW MANY if needed):
   - Include coding challenges ONLY if "${title}" involves programming/technical implementation
   - Decide the count based on module complexity (typically 0-3 questions)
   - Each coding question should test problem-solving and implementation skills
   - Base coding scenarios on THIS COMPANY'S training materials and practices (no other company info)
   - Include expected approach and programming language
   - Focus on real-world scenarios from this company's context` : `
5. NO CODING QUESTIONS:
   - This department does NOT allow coding questions
   - Do NOT include any "coding" field in your response
   - Focus only on MCQs and one-liner questions`;
	const companyLabel = companyName?.trim() ? companyName.trim() : "this company";
	const departmentLabel = deptName?.trim() ? deptName.trim() : "this department";

	return `
You are an expert corporate trainer creating an assessment for: "${title}"

COMPANY: "${companyLabel}"
DEPARTMENT: "${departmentLabel}"
MODULE DESCRIPTION: ${moduleDescription}

Your task is to generate a comprehensive quiz that evaluates the trainee's understanding of this specific module.

CONTEXT SOURCES:
${context}

${skillBlock}

QUIZ GENERATION INSTRUCTIONS:
1. <b>AI-DECIDED STRUCTURE</b>: YOU decide the optimal number of questions based on:
   - Module complexity and scope
   - Content depth from training materials
   - Recommended ranges: MCQs (8-20), One-liners (3-10), Coding (0-3 if allowed)
   - Adjust counts to ensure comprehensive coverage without overwhelming the trainee

2. Focus Questions on Module: All questions must be directly related to "${title}"

3. Source Weighting:
	- 90% of questions should come from THIS COMPANY'S TRAINING MATERIALS and the learner's CHAT HISTORY (official policies, procedures, technical details, personalized learning context)
	- 10% can incorporate general best practices and industry standards (but NEVER use other company examples or information)
	- DO NOT mention other companies, brand names, or fictional company names
	- ONLY refer to the company as "${companyLabel}" or "the company"
	- All questions must be contextually relevant to this company's business and operations

4. Question Quality:
   - Create advanced-level questions that test practical application, not just memorization
   - Include scenario-based questions relevant to "${title}" and THIS COMPANY'S context
   - Cover key concepts, definitions, best practices, and procedures
   - Each MCQ must have 4 distinct options with only one correct answer
   - One-liner questions should test specific knowledge and skills
	- Use the skill alignment blueprint to prioritize must-have skills before good-to-have skills
	- Assign 1-3 skillTags to every question and make the first skill tag the primary target
	- IMPORTANT: Never reference or use information from other companies or invented company names

${codingBlock}
${critiqueBlock}

REQUIRED OUTPUT FORMAT (JSON only):
{
	"mcq": [
		{
			"id": "mcq-1",
			"question": "string (related to ${title})",
			"options": ["Option A", "Option B", "Option C", "Option D"],
			"correctIndex": 0,
			"explanation": "string (brief explanation of correct answer)",
			"skillTags": ["string"],
			"priority": "must-have|good-to-have|optional"
		}
		// ... YOU DECIDE how many MCQs (8-20 recommended)
	],
	"oneLiners": [
		{
			"id": "ol-1",
			"question": "string (specific to ${title})",
			"answer": "string (concise correct answer)",
			"explanation": "string (why this is correct)",
			"skillTags": ["string"],
			"priority": "must-have|good-to-have|optional"
		}
		// ... YOU DECIDE how many one-liners (3-10 recommended)
	]${allowCoding ? `,
	"coding": [
		{
			"id": "code-1",
			"question": "string (coding challenge related to ${title})",
			"expectedApproach": "string (describe the expected solution approach)",
			"language": "JavaScript|Python|Java|etc",
			"sampleInput": "string (optional test case input)",
			"sampleOutput": "string (optional expected output)",
			"hints": ["string"] (optional hints for the trainee),
			"skillTags": ["string"],
			"priority": "must-have|good-to-have|optional"
		}
		// ... ONLY if module involves coding (0-3 questions, YOU DECIDE)
	]` : ''}
}

Return ONLY valid JSON with the structure above. YOU DECIDE the optimal question counts within the recommended ranges.
`;
}

async function generateQuizAgentic({
	title,
	context,
	allowCoding = false,
	moduleDescription = "",
	companyName = "",
	deptName = "",
	skillBlueprint = {},
}) {
	const maxAttempts = 3;
	let critiqueIssues = [];
	let lastQuiz = { mcq: [], oneLiners: [], coding: [] };
	let lastCritique = { pass: false, score: 0, issues: ["Quiz generation did not complete"], attempts: 0 };

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const prompt = buildQuizPrompt({
			title,
			context,
			critiqueIssues,
			allowCoding,
			moduleDescription,
			companyName,
			deptName,
			skillBlueprint,
		});

		try {
			const result = await generateWithRetry(prompt);
			const text = result?.response?.text?.()?.trim() || "";
			const parsed = safeParseJson(text);
			const quiz = shapeQuizPayload(parsed || {}, allowCoding);
			lastQuiz = quiz;

			const issues = [];
			if (!Array.isArray(quiz.mcq) || quiz.mcq.length < 5) issues.push("insufficient MCQs (need at least 5)");
			if (!Array.isArray(quiz.oneLiners) || quiz.oneLiners.length < 2) issues.push("insufficient one-liners (need at least 2)");
			if (!allowCoding && Array.isArray(quiz.coding) && quiz.coding.length > 0) issues.push("coding questions present for non-coding department");
			if (!isQuizComplete(quiz, allowCoding)) issues.push("quiz structure invalid or incomplete");

			const pass = issues.length === 0;
			const critique = {
				pass,
				score: pass ? 92 : Math.max(35, 85 - issues.length * 15),
				issues,
				attempt,
			};
			lastCritique = critique;

			console.log("[QUIZ][DEBUG] Agentic critique", critique);

			if (pass) {
				return { quiz, critique };
			}

			critiqueIssues = issues;
		} catch (err) {
			console.warn(`[QUIZ][DEBUG] generateQuizAgentic attempt ${attempt} failed:`, err.message);
			critiqueIssues = ["model response parse/reliability issue", "return strict valid JSON only"];
			lastCritique = {
				pass: false,
				score: 30,
				issues: ["model generation attempt failed", err.message],
				attempt,
			};
		}
	}

	if (isQuizComplete(lastQuiz, allowCoding)) {
		return { quiz: lastQuiz, critique: lastCritique };
	}

	throw new Error("Failed to generate a valid quiz after multiple attempts");
}

async function generateRemediationPlan({ title, mcqResults = [], oneLinerResults = [], skillSignals = [] }) {
	const wrongMcq = (Array.isArray(mcqResults) ? mcqResults : []).filter((item) => !item?.isCorrect);
	const wrongOneLiners = (Array.isArray(oneLinerResults) ? oneLinerResults : []).filter((item) => !item?.isCorrect);
	const weakSkills = uniqueSkills(
		(Array.isArray(skillSignals) ? skillSignals : [])
			.filter((signal) => Number(signal?.wrongCount) > 0)
			.map((signal) => signal?.skill)
	);

	const focusPool = uniqueSkills([
		...weakSkills,
		...wrongMcq.flatMap((item) => (Array.isArray(item?.skillTags) ? item.skillTags : [])),
		...wrongOneLiners.flatMap((item) => (Array.isArray(item?.skillTags) ? item.skillTags : [])),
	]);

	const promptPayload = {
		title,
		wrongMcq: wrongMcq.slice(0, 8).map((item) => ({ question: item?.question, skillTags: item?.skillTags || [] })),
		wrongOneLiners: wrongOneLiners.slice(0, 8).map((item) => ({ question: item?.question, skillTags: item?.skillTags || [] })),
		weakSkills,
	};

	const prompt = `You are an AI learning coach creating a concise remediation plan.

Module: "${title}"

Signals:
${JSON.stringify(promptPayload, null, 2)}

Return JSON only with this exact shape:
{
  "summary": "string",
  "focusAreas": ["string"],
  "actions": ["string"],
  "recommendedRetryInDays": 1
}

Rules:
- Keep summary to 1-2 sentences.
- focusAreas: 2-6 concrete topics.
- actions: 3-6 practical actions the learner can do today.
- recommendedRetryInDays must be an integer between 1 and 7.
- No markdown, no code fences, valid JSON only.`;
	try {
		const result = await generateWithRetry(prompt);
		const text = result?.response?.text()?.trim() || "";
		const parsed = safeParseJson(text);
		if (parsed?.summary && Array.isArray(parsed?.actions)) {
			return {
				summary: String(parsed.summary),
				focusAreas: uniqueSkills(Array.isArray(parsed.focusAreas) ? parsed.focusAreas : focusPool).slice(0, 6),
				actions: uniqueSkills(parsed.actions).slice(0, 6),
				recommendedRetryInDays: Math.min(7, Math.max(1, Number(parsed.recommendedRetryInDays) || 3)),
			};
		}
	} catch (err) {
		console.warn("Remediation plan generation failed:", err.message);
	}

	return {
		summary: "Review incorrect answers and strengthen weak skills before your next attempt.",
		focusAreas: focusPool.length ? focusPool.slice(0, 6) : ["core concepts", "procedures", "best practices"],
		actions: ["Re-read module materials", "Review missed questions", "Attempt practice scenarios"],
		recommendedRetryInDays: 3,
	};
}

async function makeAgenticDecision({
	score = 0,
	attemptNumber = 1,
	mcqScore = 0,
	oneLinerScore = 0,
	codingScore = null,
	weakAreas = [],
	moduleTitle = "Current Module",
	timeRemaining = null,
	previousAttempts = [],
	maxAttempts = MAX_QUIZ_ATTEMPTS,
	skillSignals = {},
} = {}) {
	const cappedMaxAttempts = Math.max(1, Number(maxAttempts) || MAX_QUIZ_ATTEMPTS);
	const attemptsLeft = Math.max(0, cappedMaxAttempts - Number(attemptNumber || 1));
	const trendScores = [
		...((Array.isArray(previousAttempts) ? previousAttempts : []).map((a) => Number(a?.score) || 0)),
		Number(score) || 0,
	];
	const improvingTrend = trendScores.length >= 2 && trendScores[trendScores.length - 1] >= trendScores[trendScores.length - 2];
	const weakTags = uniqueSkills(Array.isArray(skillSignals?.weakTags) ? skillSignals.weakTags : []);
	const weakMustHaveSkills = uniqueSkills(Array.isArray(skillSignals?.weakMustHaveSkills) ? skillSignals.weakMustHaveSkills : []);

	let allowRetry = attemptsLeft > 0;
	let retriesGranted = allowRetry ? 1 : 0;
	let requiresRoadmapRegeneration = false;
	let lockModule = false;
	let contactAdmin = false;
	const unlockResources = [];

	if (score < 40 || weakMustHaveSkills.length >= 3) {
		requiresRoadmapRegeneration = true;
	}

	if (attemptsLeft <= 0) {
		allowRetry = false;
		retriesGranted = 0;
		lockModule = true;
		contactAdmin = true;
	}

	const recommendations = uniqueSkills([
		...weakTags,
		...(Array.isArray(weakAreas) ? weakAreas : []),
		...(weakMustHaveSkills.length ? weakMustHaveSkills : []),
	]).slice(0, 8);

	let message = "";
	if (lockModule) {
		message = `You have used all ${cappedMaxAttempts} attempts for ${moduleTitle}. This module is now locked. Please contact admin.`;
	} else if (allowRetry) {
		const base = improvingTrend
			? `Good progress on ${moduleTitle}. You can retry and focus on weak areas.`
			: `You can retry ${moduleTitle}. Focus on your weak areas before next attempt.`;
		message = timeRemaining
			? `${base} Time remaining: ${timeRemaining}.`
			: base;
	} else {
		message = `Quiz submission reviewed for ${moduleTitle}.`;
	}

	if ((Number(codingScore) || 0) < 50 && codingScore !== null) {
		unlockResources.push("coding-practice");
	}
	if ((Number(mcqScore) || 0) < 60 || (Number(oneLinerScore) || 0) < 60) {
		unlockResources.push("concept-revision-pack");
	}

	return {
		allowRetry,
		retriesGranted,
		requiresRoadmapRegeneration,
		unlockResources: uniqueSkills(unlockResources),
		lockModule,
		contactAdmin,
		message,
		recommendations,
	};
}

async function evaluateOneLinerWithLLM(question, correctAnswer, userResponse) {
	if (!userResponse || userResponse.trim().length === 0) {
		return false;
	}

	// First try exact match (faster)
	if (normalizeText(userResponse) === normalizeText(correctAnswer)) {
		return true;
	}

	// Use LLM for semantic evaluation
	const prompt = `You are an expert evaluator for corporate training quizzes.

Question: ${question}
Correct Answer: ${correctAnswer}
User's Answer: ${userResponse}

Evaluate if the user's answer is semantically correct and captures the key concepts of the correct answer.
Consider the answer correct if it:
- Contains the core meaning of the correct answer
- Uses different but accurate terminology
- Includes the essential facts/concepts

Respond with ONLY "CORRECT" or "INCORRECT" followed by a brief reason.

Format: CORRECT|reason or INCORRECT|reason`;

	try {
		const result = await generateWithRetry(prompt);
		const text = result?.response?.text()?.trim() || "";
		const isCorrect = text.toUpperCase().startsWith("CORRECT");
		console.log(`  LLM Evaluation - Q: "${question.substring(0, 50)}..." | User: "${userResponse}" | Result: ${isCorrect ? "✓" : "✗"}`);
		return isCorrect;
	} catch (err) {
		console.error("LLM evaluation error, falling back to exact match:", err.message);
		return normalizeText(userResponse) === normalizeText(correctAnswer);
	}
}

async function generateAgenticCertificateTitle({ score, passThreshold }) {
	const fallbackTitle = score >= 90
		? "Distinguished Excellence Award"
		: score >= 80
		? "Advanced Master Practitioner"
		: score >= passThreshold
		? "Certified Professional"
		: "Course Completer";

	const prompt = `You are naming a professional completion certificate title.

Rules:
- Score: ${score}
- Pass Threshold: ${passThreshold}
- Return only ONE concise professional title.
- No emoji.
- Max 5 words.
- Must sound corporate and achievement-oriented.

Output only plain text title.`;

	try {
		const result = await generateWithRetry(prompt);
		const raw = result?.response?.text?.()?.trim() || "";
		const cleaned = raw.replace(/[\n\r`*_#]/g, " ").replace(/\s+/g, " ").trim();
		if (!cleaned) return fallbackTitle;
		const words = cleaned.split(" ").slice(0, 5).join(" ");
		return words || fallbackTitle;
	} catch (err) {
		console.warn("⚠️ [FINAL-QUIZ] AI title generation failed, using fallback:", err.message);
		return fallbackTitle;
	}
}

function shapeQuizPayload(raw, allowCoding = false) {
	const mcq = Array.isArray(raw?.mcq) ? raw.mcq : [];
	const oneLiners = Array.isArray(raw?.oneLiners) ? raw.oneLiners : [];
	const coding = allowCoding && Array.isArray(raw?.coding) ? raw.coding : [];

	const shapedMcq = mcq.map((q, i) => ({
		id: q.id || `mcq-${i + 1}`,
		question: q.question || "",
		options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
		correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
		explanation: q.explanation || "",
		skillTags: Array.isArray(q.skillTags) ? q.skillTags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
		priority: String(q.priority || "").trim(),
	}));

	const shapedOneLiners = oneLiners.map((q, i) => ({
		id: q.id || `ol-${i + 1}`,
		question: q.question || "",
		answer: q.answer || "",
		explanation: q.explanation || "",
		skillTags: Array.isArray(q.skillTags) ? q.skillTags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
		priority: String(q.priority || "").trim(),
	}));
	
	const shapedCoding = coding.map((q, i) => ({
		id: q.id || `code-${i + 1}`,
		question: q.question || "",
		expectedApproach: q.expectedApproach || "",
		language: q.language || "JavaScript",
		sampleInput: q.sampleInput || "",
		sampleOutput: q.sampleOutput || "",
		hints: Array.isArray(q.hints) ? q.hints : [],
		skillTags: Array.isArray(q.skillTags) ? q.skillTags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
		priority: String(q.priority || "").trim(),
	}));

	return { mcq: shapedMcq, oneLiners: shapedOneLiners, coding: shapedCoding };
}

function normalizeSkillLabel(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[\u2019']/g, "")
		.replace(/[^a-z0-9+.#\-\s]/gi, "")
		.replace(/\s+/g, " ");
}

function uniqueSkills(values = []) {
	const seen = new Set();
	const result = [];
	for (const value of values) {
		const trimmed = String(value || "").trim();
		if (!trimmed) continue;
		const key = normalizeSkillLabel(trimmed);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(trimmed);
	}
	return result;
}

function intersectSkills(source = [], pool = []) {
	const normalizedPool = new Map();
	for (const item of uniqueSkills(pool)) {
		normalizedPool.set(normalizeSkillLabel(item), item);
	}

	return uniqueSkills(source).filter((item) => normalizedPool.has(normalizeSkillLabel(item)));
}

function buildQuizSkillBlueprint({ moduleData = {}, userData = {}, title = "" } = {}) {
	const roadmapAlignment = userData?.roadmapAgentic?.skillAlignment || userData?.roadmapAgentic?.extractedSkills || {};
	const skillGap = uniqueSkills(roadmapAlignment.skillGap || roadmapAlignment.criticalGaps || []);
	const criticalGaps = uniqueSkills(roadmapAlignment.criticalGaps || roadmapAlignment.gapBuckets?.mustHave || []);
	const goodToHave = uniqueSkills(
		roadmapAlignment.gapBuckets?.goodToHave ||
		skillGap.filter((skill) => !criticalGaps.some((mustHave) => normalizeSkillLabel(mustHave) === normalizeSkillLabel(skill)))
	);
	const optional = uniqueSkills(roadmapAlignment.gapBuckets?.optional || []);
	const moduleSkills = uniqueSkills(moduleData?.skillsCovered || []);
	const mustHave = uniqueSkills(intersectSkills(moduleSkills.length ? moduleSkills : criticalGaps, criticalGaps.length ? criticalGaps : skillGap));
	const goodToHaveAligned = uniqueSkills(intersectSkills(moduleSkills.length ? moduleSkills : skillGap, goodToHave));
	const optionalAligned = uniqueSkills(intersectSkills(moduleSkills, optional));
	const coveragePool = uniqueSkills([
		...mustHave,
		...goodToHaveAligned,
		...optionalAligned,
		...skillGap,
		...moduleSkills,
		...(Array.isArray(userData?.roadmapAgentic?.learningProfile?.strugglingAreas)
			? userData.roadmapAgentic.learningProfile.strugglingAreas
			: []),
	]).slice(0, 20);

	return {
		title,
		moduleSkills,
		skillGap,
		mustHave,
		goodToHave: goodToHaveAligned,
		optional: optionalAligned,
		coveragePool,
		coverageRules: [
			"At least 60% of MCQs should target must-have skills when present.",
			"At least 50% of one-liner questions should target must-have skills when present.",
			"Use good-to-have skills for secondary coverage after must-have skills are represented.",
			"Tag every question with one to three skillTags from the coverage pool.",
			"If a question can cover both a must-have and a good-to-have skill, prefer the must-have skill tag first.",
		],
	};
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch department settings for quiz configuration
 * @param {string} companyId - Company ID
 * @param {string} deptId - Department ID
 * @returns {Promise<Object>} - Department settings
 */
async function getDepartmentSettings(companyId, deptId) {
	const resolveDepartmentKey = (...values) => {
		for (const value of values) {
			const normalized = normalizeDepartmentKey(value);
			if (!normalized) continue;
			const matched = DEPARTMENT_OPTIONS.find((option) => option === normalized);
			if (matched) return matched;
		}
		return normalizeDepartmentKey(deptId);
	};
	
	try {
		const deptRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId);
		
		const deptSnap = await deptRef.get();
		
		if (deptSnap.exists) {
			const deptData = deptSnap.data();
			const departmentKey = resolveDepartmentKey(deptId, deptData?.name, deptData?.deptName);
			const configuredAllowCoding = deptData.quizSettings?.allowCodingQuestions;
			const defaultAllowCoding = CODING_ENABLED_DEPARTMENTS.has(departmentKey);
			const allowCodingQuestions = typeof configuredAllowCoding === "boolean"
				? configuredAllowCoding
				: defaultAllowCoding;

			if (typeof configuredAllowCoding !== "boolean") {
				console.log(`[QUIZ][SETTINGS] Using department default for ${departmentKey || deptId}: allowCodingQuestions=${defaultAllowCoding}`);
			}

			return {
				allowCodingQuestions,
				quizPreferences: deptData.quizSettings || {},
			};
		}
		
		console.log(`Department ${deptId} not found or no settings. Using defaults.`);
		const fallbackDepartmentKey = resolveDepartmentKey(deptId);
		return {
			allowCodingQuestions: CODING_ENABLED_DEPARTMENTS.has(fallbackDepartmentKey),
			quizPreferences: {},
		};
	} catch (err) {
		console.warn(`Failed to fetch department settings: ${err.message}`);
		const fallbackDepartmentKey = resolveDepartmentKey(deptId);
		return {
			allowCodingQuestions: CODING_ENABLED_DEPARTMENTS.has(fallbackDepartmentKey),
			quizPreferences: {},
		};
	}
}

async function generateWithRetry(prompt) {
	const attempts = 3;
	let lastErr;
	const { primaryModel: pm, fallbackModel: fm } = initializeQuizModels();

	for (let i = 0; i < attempts; i += 1) {
		try {
			return await pm.generateContent(prompt);
		} catch (err) {
			lastErr = err;
			const status = err?.status || err?.response?.status;
			if (status !== 503 || i === attempts - 1) break;
			const delayMs = 800 * Math.pow(2, i);
			await sleep(delayMs);
		}
	}

	try {
		return await fm.generateContent(prompt);
	} catch (err) {
		throw lastErr || err;
	}
}

export const generateQuiz = async (req, res) => {
	try {
		const { companyId, deptId, userId, moduleId, moduleTitle } = req.body;

		if (!companyId || !deptId || !userId || !moduleId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		console.log(`\n=== GENERATE QUIZ START ===`);
		console.log(`CompanyId: ${companyId}, DeptId: ${deptId}, UserId: ${userId}, ModuleId: ${moduleId}`);

		// Check license - quizzes only available on Pro plan
		const companySnap = await db.collection("companies").doc(companyId).get();
		const { plan: licensePlan, source: planSource } = await resolveCompanyLicensePlan(companyId, companySnap);
		console.log("[QUIZ][LICENSE] Plan resolved:", { companyId, licensePlan, planSource });
		if (licensePlan === "License Basic") {
			return res.status(403).json({
				error: "Feature not available on your plan",
				message: "Quizzes are only available on the Pro plan. Please upgrade to access this feature.",
				requiresUpgrade: true,
			});
		}

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const moduleRef = userRef.collection("roadmap").doc(moduleId);

		const [moduleSnap, userSnap] = await Promise.all([moduleRef.get(), userRef.get()]);
		const moduleData = moduleSnap.exists ? moduleSnap.data() : {};
		const userData = userSnap.exists ? userSnap.data() : {};
		const title = moduleTitle || moduleData?.moduleTitle || "Training Module";
		const description = moduleData?.description || "";
		const roadmapAlignment = userData?.roadmapAgentic?.skillAlignment || userData?.roadmapAgentic?.extractedSkills || {};
		const skillBlueprint = buildQuizSkillBlueprint({ moduleData, userData, title });
		const maxAttemptsOverride = Number.isInteger(moduleData?.maxAttemptsOverride)
			? moduleData.maxAttemptsOverride
			: 0;
		const testBypass = isQuizTestBypassEnabled();
		const effectiveMaxAttempts = testBypass
			? Math.max(99, Math.max(MAX_QUIZ_ATTEMPTS, maxAttemptsOverride))
			: Math.max(MAX_QUIZ_ATTEMPTS, maxAttemptsOverride);
		console.log(`Module title: ${title}`);
		console.log("[QUIZ][DEBUG] Generate gate inputs", {
			trainingLocked: Boolean(userData?.trainingLocked),
			moduleLocked: Boolean(moduleData?.moduleLocked),
			quizPassed: Boolean(moduleData?.quizPassed),
			storedQuizAttempts: Number(moduleData?.quizAttempts) || 0,
			maxAttemptsOverride,
			effectiveMaxAttempts,
			testBypass,
		});
		if (testBypass) {
			console.warn("[QUIZ][TEST] FORCE_UNLOCK_QUIZ_FOR_TESTING enabled: bypassing training lock, attempt cap, and time unlock checks.");
		}

		if (!testBypass && userData?.trainingLocked) {
			return res.status(403).json({
				error: "Training is locked",
				message: "Your training is locked. Please contact admin.",
				trainingLocked: true,
			});
		}

		const attemptsSnap = await moduleRef.collection("quizAttempts").get();
		const storedAttempts = Number(moduleData?.quizAttempts) || 0;
		const currentAttempts = Math.max(attemptsSnap.size, storedAttempts);
		console.log("[QUIZ][DEBUG] Generate attempts snapshot", {
			attemptDocs: attemptsSnap.size,
			storedAttempts,
			currentAttempts,
		});
		if (!testBypass && !moduleData?.quizPassed && currentAttempts >= effectiveMaxAttempts) {
			await Promise.all([
				moduleRef.set(
					{
						quizLocked: true,
						moduleLocked: true,
						requiresAdminContact: true,
					},
					{ merge: true }
				),
				userRef.set(
					{
						trainingLocked: true,
						trainingLockedAt: admin.firestore.FieldValue.serverTimestamp(),
						trainingLockedReason: `Failed quiz "${title}" after ${currentAttempts} attempts`,
						requiresAdminContact: true,
					},
					{ merge: true }
				),
			]);

			await notifyTrainingLockForTesting({
				companyId,
				userName: userData?.name,
				userEmail: userData?.email,
				moduleTitle: title,
				attemptNumber: currentAttempts,
				score: null,
			});

			return res.status(403).json({
				error: "Maximum quiz attempts reached",
				message: `Maximum ${effectiveMaxAttempts} quiz attempts reached. Training is locked. Contact admin.`,
				maxAttempts: effectiveMaxAttempts,
				attemptsUsed: currentAttempts,
				trainingLocked: true,
			});
		}
		
		// 🔒 CHECK: Quiz unlock time requirement (70% of module time)
		console.log(`Checking quiz unlock time requirement...`);
		const quizUnlockStatus = checkQuizTimeUnlock(moduleData);
		console.log("[QUIZ][DEBUG] Generate unlock status", quizUnlockStatus);
		
		if (!testBypass && !quizUnlockStatus.isUnlocked) {
			console.log(`❌ Quiz locked: ${quizUnlockStatus.message}`);
			return res.status(403).json({
				error: "Quiz is locked",
				message: quizUnlockStatus.message,
				unlockTime: quizUnlockStatus.unlockTime,
				remainingTime: quizUnlockStatus.remainingTime,
				requirementMet: false
			});
		}
		
		console.log(`✅ Quiz unlock requirement met - generating quiz`);
		
		// Fetch department settings for quiz configuration
		console.log(`Fetching department settings...`);
		const deptSettings = await getDepartmentSettings(companyId, deptId);
		const allowCoding = deptSettings.allowCodingQuestions;
		console.log(`Department allows coding questions: ${allowCoding ? "YES" : "NO"}`);

		// Fetch company and department labels for strict prompt grounding
		let companyName = "";
		let deptName = "";
		try {
			const companySnap = await db.collection("companies").doc(companyId).get();
			if (companySnap.exists) {
				companyName = companySnap.data()?.name || "";
			}
			const deptSnap = await db
				.collection("companies")
				.doc(companyId)
				.collection("departments")
				.doc(deptId)
				.get();
			if (deptSnap.exists) {
				deptName = deptSnap.data()?.name || deptSnap.data()?.deptName || "";
			}
		} catch (labelErr) {
			console.warn("⚠️ Failed to fetch company/department labels:", labelErr.message);
		}

		// Fetch agent memory summary for personalized context (10% weight)
		let agentMemoryContext = "";
		try {
			const agentMemorySummaryRef = moduleRef.collection("agentMemory").doc("summary");
			const agentMemorySnap = await agentMemorySummaryRef.get();
			if (agentMemorySnap.exists) {
				const memoryData = agentMemorySnap.data();
				agentMemoryContext = memoryData?.content || memoryData?.summary || memoryData?.text || "";
				console.log(`✓ Agent memory found: ${agentMemoryContext.length} characters`);
			} else {
				console.log(`No agent memory found for this module`);
			}
		} catch (memErr) {
			console.warn(`Could not fetch agent memory: ${memErr.message}`);
		}

		// Agentic retrieval plan + multi-query expansion
		const baseQueryText = `${title}: Key concepts, technical skills, best practices, procedures, policies, and practical applications for ${title}`;
		const baseEmbedding = await embedText(baseQueryText);
		const baseDocs = await queryPinecone({ embedding: baseEmbedding, companyId, deptId, topK: 12 });

		const baseDocsContext = baseDocs.map((d) => d.text).join("\n\n");
		const agentMemorySnippet = agentMemoryContext.slice(0, 800);
		const plan = await generateAgenticPlan({
			title,
			baseContext: baseDocsContext,
			agentMemorySnippet,
		});
		console.log(`Agentic plan: ${plan.queries.length} queries, focus areas: ${plan.focusAreas.join(", ")}`);

		const plannedDocs = await fetchPlannedDocs({ queries: plan.queries, companyId, deptId });
		const mergedDocs = mergeDocs([...baseDocs, ...plannedDocs]);
		const companyDocsContext = truncateText(mergedDocs.map((d) => d.text).join("\n\n"), MAX_CONTEXT_CHARS);
		
		const context = `COMPANY TRAINING MATERIALS (Primary Source):
${companyDocsContext || "No company documents available."}

${agentMemorySnippet ? `\nPERSONALIZED LEARNING CONTEXT:
${agentMemorySnippet}` : ""}`;

		console.log(`Context built: ${companyDocsContext.length} chars from docs, ${agentMemorySnippet.length} chars from memory`);

		console.log(`Generating quiz with agentic loop (AI decides structure)...`);
		const { quiz, critique } = await generateQuizAgentic({ 
			title, 
			context, 
			allowCoding,
			moduleDescription: description,
			companyName,
			deptName,
			skillBlueprint,
		});
		console.log(`✓ Quiz parsed: ${quiz.mcq.length} MCQs, ${quiz.oneLiners.length} one-liners, ${quiz.coding?.length || 0} coding questions (critique pass=${critique?.pass})`);

		try {
			// Ensure module document exists before writing to subcollection
			const moduleSnap = await moduleRef.get();
			if (!moduleSnap.exists) {
				console.log(`Module document doesn't exist, creating it first...`);
				await moduleRef.set({ 
					moduleId, 
					createdAt: admin.firestore.FieldValue.serverTimestamp() 
				}, { merge: true });
			}

			const quizRef = moduleRef.collection("quiz").doc("current");
			const quizPath = `freshers/${companyId}/departments/${deptId}/users/${userId}/roadmap/${moduleId}/quiz/current`;
			console.log(`Attempting to store quiz at: ${quizPath}`);
			
			const quizData = {
				...quiz,
				moduleTitle: title,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				sourceCount: mergedDocs.length,
				hasAgentMemory: agentMemorySnippet.length > 0,
				skillAlignment: skillBlueprint,
				contextSources: {
					companyDocs: mergedDocs.length,
					agentMemoryLength: agentMemorySnippet.length,
				},
				agentic: {
					planQueries: plan.queries,
					planFocusAreas: plan.focusAreas,
					critiqueScore: critique?.score || null,
					critiquePass: critique?.pass || false,
					aiDecidedStructure: true, // AI decided question counts
					allowCodingQuestions: allowCoding,
					questionCounts: {
						mcq: quiz.mcq.length,
						oneLiners: quiz.oneLiners.length,
						coding: quiz.coding?.length || 0,
					},
					skillBlueprint,
					roadmapAlignment,
				},
			};
			
			await quizRef.set(quizData);
			console.log(`✓ Quiz document written successfully`);
			console.log(`✓ Quiz data: ${quiz.mcq.length} MCQs, ${quiz.oneLiners.length} one-liners, ${quiz.coding?.length || 0} coding questions`);

			// Verify the write immediately
			await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms for write to propagate
			const verifyQuiz = await quizRef.get();
			if (verifyQuiz.exists) {
				console.log(`✓ Quiz document verified in Firestore at: ${quizPath}`);
				const data = verifyQuiz.data();
				console.log(`✓ Verified MCQs: ${data.mcq?.length}, One-liners: ${data.oneLiners?.length}`);
			} else {
				console.error(`✗ CRITICAL: Quiz document NOT found after write at: ${quizPath}`);
				console.error(`✗ This may indicate a Firestore permission or configuration issue`);
			}

			await moduleRef.set({
				quizGenerated: true,
				quizId: "current",
				lastQuizGenerated: admin.firestore.FieldValue.serverTimestamp(),
			}, { merge: true });
			console.log(`✓ Module document updated with quiz flags`);
			
			// Verify module update
			const verifyModule = await moduleRef.get();
			if (verifyModule.exists) {
				const moduleData = verifyModule.data();
				console.log(`✓ Module flags verified: quizGenerated=${moduleData.quizGenerated}, quizId=${moduleData.quizId}`);
			}
		} catch (writeErr) {
			console.error("Error writing quiz to Firestore:", writeErr);
			console.error("Error code:", writeErr.code);
			console.error("Error details:", writeErr.details);
			throw new Error(`Firestore write failed: ${writeErr.message}`);
		}

		const safeQuiz = {
			quizId: "current",
			moduleTitle: title,
			mcq: quiz.mcq.map(({ correctIndex, explanation, ...rest }) => rest),
			oneLiners: quiz.oneLiners.map(({ answer, explanation, ...rest }) => rest),
			coding: (quiz.coding || []).map(({ expectedApproach, ...rest }) => rest), // Hide solution from client
			hasCoding: (quiz.coding || []).length > 0,
			skillAlignment: skillBlueprint,
		};

		console.log(`=== GENERATE QUIZ COMPLETE ===\n`);
		return res.json(safeQuiz);
	} catch (err) {
		console.error("Quiz generation error:", err);
		console.error("Error stack:", err.stack);
		return res.status(500).json({ error: "Quiz generation failed", details: err.message });
	}
};

export const submitQuiz = async (req, res) => {
	try {
		const { companyId, deptId, userId, moduleId, quizId, answers } = req.body;

		if (!companyId || !deptId || !userId || !moduleId || !quizId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		console.log(`\n=== SUBMIT QUIZ START ===`);
		console.log(`CompanyId: ${companyId}, DeptId: ${deptId}, UserId: ${userId}, ModuleId: ${moduleId}, QuizId: ${quizId}`);

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const moduleRef = userRef.collection("roadmap").doc(moduleId);

		const quizRef = moduleRef.collection("quiz").doc(quizId);
		const [moduleSnap, userSnap] = await Promise.all([moduleRef.get(), userRef.get()]);
		const moduleData = moduleSnap.exists ? moduleSnap.data() : {};
		const fresherData = userSnap.exists ? userSnap.data() : {};
		const moduleTitle = moduleData.moduleTitle || "Current Module";
		const maxAttemptsOverride = Number.isInteger(moduleData?.maxAttemptsOverride)
			? moduleData.maxAttemptsOverride
			: 0;
		const testBypass = isQuizTestBypassEnabled();
		const baseMaxAttempts = Math.min(
			MAX_QUIZ_ATTEMPTS + ADMIN_FINAL_RETRY_ATTEMPTS,
			Math.max(MAX_QUIZ_ATTEMPTS, maxAttemptsOverride)
		);
		const effectiveMaxAttempts = testBypass ? Math.max(99, baseMaxAttempts) : baseMaxAttempts;
		console.log("[QUIZ][DEBUG] Submit payload summary", {
			moduleId,
			quizId,
			mcqAnswers: Array.isArray(answers?.mcq) ? answers.mcq.length : 0,
			oneLinerAnswers: Array.isArray(answers?.oneLiners) ? answers.oneLiners.length : 0,
			codingAnswers: Array.isArray(answers?.coding) ? answers.coding.length : 0,
		});
		console.log("[QUIZ][DEBUG] Submit gate inputs", {
			moduleLocked: Boolean(moduleData?.moduleLocked),
			quizPassed: Boolean(moduleData?.quizPassed),
			storedQuizAttempts: Number(moduleData?.quizAttempts) || 0,
			maxAttemptsOverride,
			effectiveMaxAttempts,
			testBypass,
		});
		if (testBypass) {
			console.warn("[QUIZ][TEST] FORCE_UNLOCK_QUIZ_FOR_TESTING enabled: bypassing submission lock checks.");
		}

		// 🔒 CHECK: Quiz unlock time requirement (70% of module time)
		console.log(`Checking quiz unlock time requirement...`);
		const quizUnlockStatus = checkQuizTimeUnlock(moduleData);
		console.log("[QUIZ][DEBUG] Submit unlock status", quizUnlockStatus);
		
		if (!testBypass && !quizUnlockStatus.isUnlocked) {
			console.log(`❌ Quiz submission blocked: ${quizUnlockStatus.message}`);
			return res.status(403).json({
				error: "Quiz is locked",
				message: quizUnlockStatus.message,
				unlockTime: quizUnlockStatus.unlockTime,
				remainingTime: quizUnlockStatus.remainingTime,
				requirementMet: false
			});
		}
		
		console.log(`✅ Quiz unlock requirement met - proceeding with submission`);

		const quizSnap = await quizRef.get();
		if (!quizSnap.exists) {
			console.error(`Quiz document not found at: quiz/${quizId}`);
			return res.status(404).json({ error: "Quiz not found" });
		}
		console.log(`✓ Quiz document found`);

		const quizData = quizSnap.data();
		
		// Strict attempt cap check before accepting a new submission
		const attemptsRef = moduleRef.collection("quizAttempts");
		const attemptsSnap = await attemptsRef.get();
		const storedAttempts = Number(moduleData?.quizAttempts) || 0;
		const attemptsUsed = Math.max(attemptsSnap.size, storedAttempts);
		console.log("[QUIZ][DEBUG] Submit attempts snapshot", {
			attemptDocs: attemptsSnap.size,
			storedAttempts,
			attemptsUsed,
		});
		if (!testBypass && !moduleData?.quizPassed && attemptsUsed >= effectiveMaxAttempts) {
			await Promise.all([
				moduleRef.set(
					{
						quizLocked: true,
						moduleLocked: true,
						requiresAdminContact: true,
					},
					{ merge: true }
				),
				userRef.set(
					{
						trainingLocked: true,
						trainingLockedAt: admin.firestore.FieldValue.serverTimestamp(),
						trainingLockedReason: `Failed quiz "${moduleTitle}" after ${attemptsUsed} attempts`,
						requiresAdminContact: true,
					},
					{ merge: true }
				),
			]);

			await notifyTrainingLockForTesting({
				companyId,
				userName: fresherData?.name,
				userEmail: fresherData?.email,
				moduleTitle,
				attemptNumber: attemptsUsed,
				score: null,
			});

			return res.status(403).json({
				error: "Maximum quiz attempts reached",
				message: `Maximum ${effectiveMaxAttempts} quiz attempts reached. Training is locked. Contact admin.`,
				maxAttempts: effectiveMaxAttempts,
				attemptsUsed,
				trainingLocked: true,
			});
		}

		const attemptNumber = attemptsUsed + 1;
		console.log(`📝 Quiz attempt #${attemptNumber} of ${effectiveMaxAttempts} allowed`);

		if (!testBypass && attemptNumber > effectiveMaxAttempts) {
			return res.status(403).json({
				error: "Maximum attempts exceeded",
				message: "This module is locked. Please contact your admin.",
				lockModule: true,
				allowRetry: false,
				attemptNumber,
				maxAttempts: effectiveMaxAttempts,
			});
		}
		
		const mcqAnswers = Array.isArray(answers?.mcq) ? answers.mcq : [];
		const oneLinerAnswers = Array.isArray(answers?.oneLiners) ? answers.oneLiners : [];
		const codingAnswers = Array.isArray(answers?.coding) ? answers.coding : [];

		// Evaluate MCQs
		const mcqResults = quizData.mcq.map((q) => {
			const submitted = mcqAnswers.find((a) => a.id === q.id);
			const selectedIndex = Number.isInteger(submitted?.selectedIndex)
				? submitted.selectedIndex
				: null;
			const isCorrect = selectedIndex === q.correctIndex;
			const selectedAnswer = selectedIndex !== null ? q.options?.[selectedIndex] || "" : "";
			const correctAnswer = q.options?.[q.correctIndex] || "";
			return {
				id: q.id,
				question: q.question,
				options: q.options,
				selectedIndex,
				correctIndex: q.correctIndex,
				selectedAnswer,
				correctAnswer,
				isCorrect,
				explanation: q.explanation || "",
				skillTags: Array.isArray(q.skillTags) ? q.skillTags : [],
				priority: q.priority || "",
				review: isCorrect
					? (q.explanation || "")
					: `You selected ${selectedAnswer || "no answer"}, but the correct answer is ${correctAnswer || "not provided"}. ${q.explanation || "Review the underlying concept and retry."}`,
			};
		});
		console.log(`Evaluating ${mcqResults.length} MCQ answers...`);
		const mcqCorrect = mcqResults.filter((r) => r.isCorrect).length;
		console.log(`✓ MCQs: ${mcqCorrect}/${mcqResults.length} correct`);

		// Evaluate one-liners with LLM
		console.log(`Evaluating ${quizData.oneLiners.length} one-liner answers with LLM...`);
		const oneLinerResults = await Promise.all(
			quizData.oneLiners.map(async (q) => {
				const submitted = oneLinerAnswers.find((a) => a.id === q.id);
				const response = submitted?.response || "";
				const isCorrect = await evaluateOneLinerWithLLM(
					q.question,
					q.answer,
					response
				);
				return {
					id: q.id,
					question: q.question,
					response,
					correctAnswer: q.answer,
					isCorrect,
					explanation: q.explanation || "",
					skillTags: Array.isArray(q.skillTags) ? q.skillTags : [],
					priority: q.priority || "",
					review: isCorrect
						? (q.explanation || "")
						: `The expected answer is ${q.answer || "not provided"}. ${q.explanation || "Focus on the exact concept in the module materials."}`,
				};
			})
		);
		const oneLinerCorrect = oneLinerResults.filter((r) => r.isCorrect).length;
		console.log(`✓ One-liners: ${oneLinerCorrect}/${oneLinerResults.length} correct`);

		// Evaluate coding questions if present
		let codingResults = [];
		let codingCorrect = 0;
		if (Array.isArray(quizData.coding) && quizData.coding.length > 0) {
			console.log(`Evaluating ${quizData.coding.length} coding questions with AI...`);
			codingResults = await Promise.all(
				quizData.coding.map(async (q) => {
					const submitted = codingAnswers.find((a) => a.id === q.id);
					const code = submitted?.code || "";
					
					const evaluation = await evaluateCode({
						question: q.question,
						code,
						expectedApproach: q.expectedApproach,
						language: q.language,
					});
					
					return {
						id: q.id,
						question: q.question,
						code,
						expectedApproach: q.expectedApproach,
						language: q.language,
						isCorrect: evaluation.isCorrect,
						score: evaluation.score,
						feedback: evaluation.feedback,
						strengths: evaluation.strengths,
						improvements: evaluation.improvements,
						skillTags: Array.isArray(q.skillTags) ? q.skillTags : [],
						priority: q.priority || "",
						review: evaluation.feedback || "Review the expected approach and compare it with the module guidance.",
					};
				})
			);
			codingCorrect = codingResults.filter((r) => r.isCorrect).length;
			console.log(`✓ Coding: ${codingCorrect}/${codingResults.length} correct`);
		}

		// Calculate comprehensive score
		const mcqWeight = 0.5; // 50%
		const oneLinerWeight = 0.25; // 25%
		const codingWeight = 0.25; // 25%
		
		const mcqScore = mcqResults.length > 0 ? (mcqCorrect / mcqResults.length) * 100 : 0;
		const oneLinerScore = oneLinerResults.length > 0 ? (oneLinerCorrect / oneLinerResults.length) * 100 : 0;
		const codingScore = codingResults.length > 0
			? codingResults.reduce((sum, r) => sum + r.score, 0) / codingResults.length
			: 0;
			
		const hasCodingQuestions = codingResults.length > 0;
		const finalScore = hasCodingQuestions
			? Math.round(mcqScore * mcqWeight + oneLinerScore * oneLinerWeight + codingScore * codingWeight)
			: Math.round(mcqScore * 0.65 + oneLinerScore * 0.35); // Redistribute weights if no coding
			
		const passed = finalScore >= QUIZ_PASS_THRESHOLD;
		console.log(`📊 Final Score: ${finalScore}% (Threshold: ${QUIZ_PASS_THRESHOLD}%) - ${passed ? "PASSED ✓" : "FAILED ✗"}`);
		const skillBlueprint =
			quizData?.skillAlignment ||
			quizData?.agentic?.skillBlueprint ||
			buildQuizSkillBlueprint({
				moduleData,
				userData: fresherData,
				title: moduleTitle,
			});
		
		// 🤖 AGENTIC DECISION MAKING
		let message = "";
		let allowRetry = false;
		let requiresRoadmapRegeneration = false;
		let unlockResources = [];
		let lockModule = false;
		let contactAdmin = false;
		let recommendations = [];
		let retriesGranted = 0;
		let remediationPlan = null;
		let weakAreas = [];
		let skillSignals = {
			mustHaveSkills: uniqueSkills(skillBlueprint.mustHave || []),
			goodToHaveSkills: uniqueSkills(skillBlueprint.goodToHave || []),
			moduleSkills: uniqueSkills(skillBlueprint.moduleSkills || []),
			weakSkills: [],
			weakTags: [],
		};

		const collectQuestionSkills = (results = []) => results.flatMap((item) => Array.isArray(item?.skillTags) ? item.skillTags : []);
		const weakQuestionSkills = uniqueSkills([
			...collectQuestionSkills(mcqResults.filter((r) => !r.isCorrect)),
			...collectQuestionSkills(oneLinerResults.filter((r) => !r.isCorrect)),
			...collectQuestionSkills(codingResults.filter((r) => !r.isCorrect || (Number(r.score) || 0) < 70)),
		]);
		const weakMustHaveSkills = intersectSkills(weakQuestionSkills, skillSignals.mustHaveSkills);
		const weakGoodToHaveSkills = intersectSkills(weakQuestionSkills, skillSignals.goodToHaveSkills);
		skillSignals = {
			...skillSignals,
			weakSkills: weakQuestionSkills,
			weakTags: weakQuestionSkills,
			weakMustHaveSkills,
			weakGoodToHaveSkills,
		};
		
		if (passed) {
			message = `🎉 Congratulations! You passed the quiz with ${finalScore}%. Excellent work!`;
		} else {
			// Get previous attempts for AI analysis
			const previousAttempts = [];
			const prevAttemptsSnap = await attemptsRef.get();
			prevAttemptsSnap.forEach(doc => {
				const data = doc.data();
				if (data.score !== undefined) {
					previousAttempts.push({ score: data.score, passed: data.passed });
				}
			});
			
			// Get module info for context (already fetched above)
			
			// Calculate time remaining (if available)
			let timeRemaining = null;
			if (moduleData.FirstTimeCreatedAt && moduleData.estimatedDays) {
				const startDate = moduleData.FirstTimeCreatedAt.toDate();
				const totalDays = moduleData.estimatedDays;
				const deadlineDate = new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
				const now = new Date();
				const msRemaining = deadlineDate - now;
				if (msRemaining > 0) {
					const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
					const hoursRemaining = Math.floor((msRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
					timeRemaining = `${daysRemaining}d ${hoursRemaining}h`;
				} else {
					timeRemaining = "Expired";
				}
			}
			
			// Identify weak areas
			weakAreas = [];
			if (mcqScore < 60) weakAreas.push("Multiple Choice Questions");
			if (oneLinerScore < 60) weakAreas.push("Short Answer Questions");
			if (hasCodingQuestions && codingScore < 60) weakAreas.push("Coding Challenges");
			
			console.log("🤖 Invoking Agentic Decision Maker...");
			const agenticDecision = await makeAgenticDecision({
				score: finalScore,
				attemptNumber,
				mcqScore,
				oneLinerScore,
				codingScore: hasCodingQuestions ? codingScore : null,
				weakAreas,
				moduleTitle,
				timeRemaining,
				previousAttempts,
				maxAttempts: effectiveMaxAttempts,
				skillSignals,
			});
			
			// Apply agentic decisions
			allowRetry = agenticDecision.allowRetry;
			retriesGranted = agenticDecision.retriesGranted || 0;
			requiresRoadmapRegeneration = agenticDecision.requiresRoadmapRegeneration;
			unlockResources = agenticDecision.unlockResources || [];
			lockModule = agenticDecision.lockModule;
			contactAdmin = agenticDecision.contactAdmin;
			message = agenticDecision.message;
			recommendations = agenticDecision.recommendations || [];

			remediationPlan = await generateRemediationPlan({
				title: moduleTitle,
				mcqResults,
				oneLinerResults,
				skillSignals,
			});
			recommendations = uniqueSkills([
				...(Array.isArray(remediationPlan?.actions) ? remediationPlan.actions : []),
				...recommendations,
			]);

			if (attemptNumber >= effectiveMaxAttempts) {
				allowRetry = false;
				retriesGranted = 0;
				lockModule = true;
				contactAdmin = true;
				message = `You have reached the maximum allowed attempts (${effectiveMaxAttempts}) for this module. This module is now locked and your admin has been notified.`;
			}
			
			console.log(`✓ Agentic Decision Applied: allowRetry=${allowRetry}, retriesGranted=${retriesGranted}, regenerate=${requiresRoadmapRegeneration}, lock=${lockModule}`);
		}

		try {
			// Store attempt
			const attemptRef = attemptsRef.doc(`attempt-${attemptNumber}`);
			await attemptRef.set({
				attemptNumber,
				answers: answers || {},
				score: finalScore,
				passed,
				mcqScore,
				oneLinerScore,
				codingScore: hasCodingQuestions ? codingScore : null,
				submittedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
			console.log(`✓ Attempt #${attemptNumber} stored`);
			
			const resultRef = quizRef.collection("results").doc("latest");
			const resultPath = `freshers/${companyId}/departments/${deptId}/users/${userId}/roadmap/${moduleId}/quiz/${quizId}/results/latest`;
			console.log(`Attempting to store results at: ${resultPath}`);
			
			const quizDocSnap = await quizRef.get();
			if (!quizDocSnap.exists) {
				console.error(`✗ CRITICAL: Quiz parent document doesn't exist at quiz/${quizId}`);
				throw new Error("Quiz parent document not found. Cannot store results.");
			}
			console.log(`✓ Quiz parent document exists`);
			
			const resultData = {
				answers: answers || {},
				score: finalScore,
				passed,
				message,
				allowRetry,
				attemptNumber,
				maxAttempts: effectiveMaxAttempts,
				retriesGranted,
				requiresRoadmapRegeneration,
				unlockResources,
				lockModule,
				contactAdmin,
				recommendations,
				remediationPlan,
				skillSignals,
				mcq: mcqResults,
				oneLiners: oneLinerResults,
				coding: codingResults,
				scoreBreakdown: {
					mcqScore,
					oneLinerScore,
						codingScore: hasCodingQuestions ? codingScore : null,
					},
					submittedAt: admin.firestore.FieldValue.serverTimestamp(),
				};
				
				await resultRef.set(resultData);
				console.log(`✓ Results document written successfully: score=${finalScore}, passed=${passed}`);

				await new Promise(resolve => setTimeout(resolve, 500));
				const verifyResult = await resultRef.get();
				if (verifyResult.exists) {
					const resultVerifyData = verifyResult.data();
					console.log(`✓ Results verified in Firestore at: ${resultPath}`);
					console.log(`✓ Verified score: ${resultVerifyData.score}, passed: ${resultVerifyData.passed}`);
				} else {
					console.error(`✗ CRITICAL: Results document NOT found after write at: ${resultPath}`);
				}

				if (passed) {
					await moduleRef.set({
						completed: true,
						status: "completed",
						progress: 100,
						quizLocked: false,
						quizPassed: true,
						quizAttempts: attemptNumber,
						retriesGranted: 0,
						lastQuizSubmitted: admin.firestore.FieldValue.serverTimestamp(),
					}, { merge: true });
					console.log(`✓ Module updated: quiz passed`);

					const userSnap = await userRef.get();
					const userData = userSnap.exists ? userSnap.data() : {};

					const roadmapSnap = await userRef.collection("roadmap").orderBy("order").get();
					const modules = roadmapSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
					const currentOrder = moduleData?.order ?? modules.find((m) => m.id === moduleId)?.order ?? 0;
					const remainingModules = modules
						.filter((m) => (m.order || 0) > currentOrder && !m.completed)
						.sort((a, b) => (a.order || 0) - (b.order || 0));

					const nextModule = remainingModules[0];
					if (nextModule) {
						await userRef.collection("roadmap").doc(nextModule.id).set({
							status: "in-progress",
							moduleLocked: false,
							startedAt: admin.firestore.FieldValue.serverTimestamp(),
						}, { merge: true });
						console.log(`✓ Next module unlocked: ${nextModule.moduleTitle}`);
					} else {
						console.log("🧪 [FINAL-QUIZ] No remaining modules. Attempting to open final assessment...");
						const companySnap = await db.collection("companies").doc(companyId).get();
						const companyName = companySnap.exists ? companySnap.data()?.name || "TrainMate" : "TrainMate";
						await maybeOpenFinalAssessment({
							userRef,
							userData,
							companyName,
						});
					}

					// Schedule calendar reminders for next active module
					try {
						const timeZone = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";
						const reminderTime = process.env.DAILY_REMINDER_TIME || "22:15";
						const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
						const testRecipient = process.env.TEST_NOTIFICATION_EMAIL || null;

						const userEmail = testRecipient || userData?.email;

						if (!userEmail) {
							console.warn("⚠️ User email not found, skipping calendar notifications");
						} else {
							const nextModule = modules.find(m => (m.order || 0) > currentOrder && !m.completed);

							if (!nextModule) {
								console.log("ℹ️ No next module found to schedule reminders");
							} else {
								const companySnap = await db.collection("companies").doc(companyId).get();
								const companyName = companySnap.exists ? companySnap.data().name || "TrainMate" : "TrainMate";

								const startDate = new Date();
								const estimatedDays = nextModule.estimatedDays || 1;
								const unlockDate = startDate;

								console.log("📅 Scheduling daily module reminders", {
									moduleTitle: nextModule.moduleTitle,
									estimatedDays,
									reminderTime,
									attendeeEmail: userEmail,
								});

								await createDailyModuleReminder({
									calendarId,
									moduleTitle: nextModule.moduleTitle,
									companyName,
									startDate,
									occurrenceCount: estimatedDays,
									reminderTime,
									timeZone,
									attendeeEmail: userEmail,
								});

								console.log("📅 Scheduling quiz unlock reminder", {
									moduleTitle: nextModule.moduleTitle,
									unlockDate: unlockDate.toISOString(),
									reminderTime,
									attendeeEmail: userEmail,
								});

								await createQuizUnlockReminder({
									calendarId,
									companyId,
									deptId,
									userId,
									moduleTitle: nextModule.moduleTitle,
									companyName,
									unlockDate,
									maxQuizAttempts: userData?.quizPolicy?.maxQuizAttempts || MAX_QUIZ_ATTEMPTS,
									reminderTime,
									timeZone,
									attendeeEmail: userEmail,
								});

								console.log("✅ Calendar notifications scheduled for next active module:", nextModule.moduleTitle);
							}
						}
					} catch (calErr) {
						console.warn("⚠️ Calendar scheduling failed (non-critical):", calErr.message);
					}
				} else {
					// 🤖 Apply agentic decisions to module state
					const updateData = {
						quizPassed: false,
						quizAttempts: attemptNumber,
						retriesGranted,
						lastQuizSubmitted: admin.firestore.FieldValue.serverTimestamp(),
					};

					await userRef.set(
						{
							roadmapRegenerated: Boolean(requiresRoadmapRegeneration),
							weaknessAnalysis: {
								source: "quiz",
								sourceModuleId: moduleId,
								sourceModuleTitle: moduleData?.moduleTitle || moduleTitle,
								latestScore: finalScore,
								avgQuizScore: finalScore,
								failedAttempts: attemptNumber,
								weakAreas,
								weakSkills: skillSignals.weakSkills || [],
								mustHaveWeakSkills: skillSignals.weakMustHaveSkills || [],
								goodToHaveWeakSkills: skillSignals.weakGoodToHaveSkills || [],
								moduleSkills: skillSignals.moduleSkills || [],
								focusAreas: Array.isArray(remediationPlan?.focusAreas) ? remediationPlan.focusAreas : [],
								recommendedActions: Array.isArray(remediationPlan?.actions) ? remediationPlan.actions : [],
								summary: remediationPlan?.summary || message,
								generatedAt: new Date(),
							},
						},
						{ merge: true }
					);
					
					// Lock/unlock based on agentic decision
					if (lockModule) {
						updateData.quizLocked = true;
						updateData.moduleLocked = true;
						updateData.status = "locked";
						updateData.requiresAdminContact = contactAdmin;
						console.log(`Module locked by TrainMate decision after ${attemptNumber} attempts`);
						
						// 🔒 Lock entire training for user
						const userRef = db
							.collection("freshers")
							.doc(companyId)
							.collection("departments")
							.doc(deptId)
							.collection("users")
							.doc(userId);

						const userSnap = await userRef.get();
						const userData = userSnap.exists ? userSnap.data() : {};
						
						await userRef.set({
							trainingLocked: true,
							trainingLockedAt: admin.firestore.FieldValue.serverTimestamp(),
							trainingLockedReason: `Failed quiz "${moduleData.moduleTitle}" after ${attemptNumber} attempts`,
							requiresAdminContact: true,
						}, { merge: true });
						console.log(`✓ User training locked - requires admin intervention`);

						try {
							const currentOrder = moduleData?.order || 0;
							const nextModule = await unlockNextModuleForUser({ userRef, currentModuleOrder: currentOrder });
							if (nextModule) {
								console.log(`✓ Next module unlocked after lock: ${nextModule.moduleTitle}`);
							}
						} catch (unlockErr) {
							console.warn("Failed to unlock next module after lock:", unlockErr.message);
						}

						let createdNotificationId = null;
						try {
							createdNotificationId = await createOrUpdateModuleLockNotification({
								companyId,
								deptId,
								userId,
								moduleId,
								userName: userData?.name || "",
								userEmail: userData?.email || "",
								moduleTitle: moduleData?.moduleTitle || "",
								attemptNumber,
								score: finalScore,
							});
							updateData.adminNotificationId = createdNotificationId;
							console.log(`✓ Admin notification created: ${createdNotificationId}`);
						} catch (notificationErr) {
							console.warn("Failed to create admin module-lock notification:", notificationErr.message);
						}

						// Notify company by email (non-blocking)
						try {
							const companySnap = await db.collection("companies").doc(companyId).get();
							const companyData = companySnap.exists ? companySnap.data() : {};
							const companyEmail = companyData?.email || companyData?.companyEmail || null;
							const companyName = companyData?.name || "TrainMate Company";

							if (!companyEmail) {
								console.warn("Company email not found, skipping lock notification email");
							} else {
								await sendTrainingLockedEmail({
									companyEmail,
									companyName,
									userName: userData?.name || "",
									userEmail: userData?.email || "",
									moduleTitle: moduleData?.moduleTitle || "",
									attemptNumber,
									score: finalScore,
								});
								console.log("Company notification email sent for training lock");
							}
						} catch (emailErr) {
							console.warn("Training lock email failed (non-critical):", emailErr.message);
						}
					} else if (allowRetry) {
						updateData.quizLocked = false; // Unlock for retry
						console.log(`Quiz unlocked for retry by TrainMate decision (${retriesGranted} retries granted)`);
						
						// Unlock specific resources only if NOT locked
						if (unlockResources.includes("module")) {
							updateData.moduleLocked = false;
						}
						if (unlockResources.includes("chatbot")) {
							updateData.chatbotLocked = false;
						}
					}
					
					await moduleRef.set(updateData, { merge: true });
					console.log(`✓ Module updated with agentic decisions`);
				}
		} catch (writeErr) {
			console.error("Error storing quiz results:", writeErr);
			console.error("Error code:", writeErr.code);
			console.error("Error details:", writeErr.details);
			throw new Error(`Firestore write failed: ${writeErr.message}`);
		}

		// 🧠 Update agent memory with quiz results (async, non-blocking)
		updateMemoryAfterQuiz({
			userId,
			companyId,
			deptId,
			moduleId,
			moduleTitle: moduleData.moduleTitle,
			score: finalScore,
			passed,
			mcqResults,
			oneLinerResults,
			skillSignals,
			remediationPlan
		}).catch(err => {
			console.warn("⚠️ Memory update after quiz failed (non-critical):", err.message);
		});
		
		console.log(`=== SUBMIT QUIZ COMPLETE ===\n`);
		return res.json({
			score: finalScore,
			passed,
			message,
			allowRetry,
			attemptNumber,
			maxAttempts: effectiveMaxAttempts,
			retriesGranted,
			requiresRoadmapRegeneration,
			unlockResources,
			lockModule,
			contactAdmin,
			recommendations,
			remediationPlan,
			skillSignals,
			mcq: mcqResults,
			oneLiners: oneLinerResults,
			coding: codingResults,
			scoreBreakdown: {
				mcqScore,
				oneLinerScore,
				codingScore: hasCodingQuestions ? codingScore : null,
			},
		});
	} catch (err) {
		console.error("Quiz submission error:", err);
		console.error("Error stack:", err.stack);
		return res.status(500).json({ error: "Quiz submission failed", details: err.message });
	}
};

export const openFinalQuiz = async (req, res) => {
	try {
		const { companyId, deptId, userId } = req.body || {};
		if (!companyId || !deptId || !userId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		console.log("\n=== FINAL QUIZ OPEN START ===");
		console.log("🧪 [FINAL-QUIZ] Input:", { companyId, deptId, userId });

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const userSnap = await userRef.get();
		if (!userSnap.exists) {
			return res.status(404).json({ error: "User not found" });
		}
		const userData = userSnap.data() || {};

		const companySnap = await db.collection("companies").doc(companyId).get();
		const companyName = companySnap.exists ? companySnap.data()?.name || "TrainMate" : "TrainMate";

		const result = await maybeOpenFinalAssessment({ userRef, userData, companyName });
		const refreshedUserSnap = await userRef.get();
		const refreshedUserData = refreshedUserSnap.data() || {};
		const finalAssessment = refreshedUserData.finalAssessment || result.finalAssessment || {};

		if (!result.opened && result.reason === "NOT_ELIGIBLE") {
			console.log("🧪 [FINAL-QUIZ] Open blocked: modules not fully completed.");
			return res.status(403).json({
				error: "Final quiz is locked",
				message: "Complete all modules before opening final quiz.",
				status: "locked",
			});
		}

		if (!result.opened && result.reason === "ATTEMPTS_EXHAUSTED") {
			return res.status(403).json({
				error: "Final quiz attempts exhausted",
				message: "You already used all final quiz attempts. Please contact your admin for next steps.",
				status: "failed",
			});
		}

		if (!result.opened && result.reason === "EXPIRED") {
			return res.status(403).json({
				error: "Final quiz expired",
				message: "Your final quiz window has expired. Please contact your admin.",
				status: "expired",
			});
		}

		console.log("=== FINAL QUIZ OPEN COMPLETE ===\n");
		return res.json({
			ok: true,
			status: finalAssessment.status || "open",
			deadlineAt: toDateSafe(finalAssessment.deadlineAt)?.toISOString() || null,
			maxAttempts: finalAssessment.maxAttempts || FINAL_QUIZ_MAX_ATTEMPTS,
			passThreshold: finalAssessment.passThreshold || FINAL_QUIZ_PASS_THRESHOLD,
			emailSent: !!finalAssessment.emailSentAt,
		});
	} catch (err) {
		console.error("Final quiz open error:", err);
		return res.status(500).json({ error: "Failed to open final quiz", details: err.message });
	}
};

export const generateFinalQuiz = async (req, res) => {
	try {
		const { companyId, deptId, userId } = req.body || {};
		if (!companyId || !deptId || !userId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		console.log("\n=== FINAL QUIZ GENERATE START ===");
		console.log("🧪 [FINAL-QUIZ] Generate input:", { companyId, deptId, userId });

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const [userSnap, companySnap] = await Promise.all([
			userRef.get(),
			db.collection("companies").doc(companyId).get(),
		]);

		// Check license - final quiz only available on Pro plan
		const { plan: licensePlan, source: planSource } = await resolveCompanyLicensePlan(companyId, companySnap);
		console.log("[FINAL-QUIZ][LICENSE] Plan resolved:", { companyId, licensePlan, planSource });
		if (licensePlan === "License Basic") {
			return res.status(403).json({
				error: "Feature not available on your plan",
				message: "Final certification quiz is only available on the Pro plan. Please upgrade to access this feature.",
				requiresUpgrade: true,
			});
		}

		if (!userSnap.exists) {
			return res.status(404).json({ error: "User not found" });
		}
		const userData = userSnap.data() || {};
		const companyName = companySnap.exists ? companySnap.data()?.name || "TrainMate" : "TrainMate";

		const openResult = await maybeOpenFinalAssessment({ userRef, userData, companyName });
		const refreshedUserSnap = await userRef.get();
		const refreshedUserData = refreshedUserSnap.data() || {};
		const finalAssessment = refreshedUserData.finalAssessment || {};

		if (!openResult.opened && openResult.reason === "NOT_ELIGIBLE") {
			return res.status(403).json({ error: "Final quiz is locked", message: "Complete all modules first." });
		}

		const status = String(finalAssessment.status || "locked").toLowerCase();
		if (status !== "open") {
			return res.status(403).json({ error: "Final quiz not open", status });
		}

		const deadlineAt = toDateSafe(finalAssessment.deadlineAt);
		if (deadlineAt && new Date() > deadlineAt) {
			await userRef.set({
				finalAssessment: {
					...finalAssessment,
					status: "expired",
				},
			}, { merge: true });
			console.log("🧪 [FINAL-QUIZ] Expired while generating.");
			return res.status(403).json({ error: "Final quiz expired", status: "expired" });
		}

		const attemptsUsed = await getFinalAttemptsUsed(userRef, finalAssessment.attemptsUsed);
		const maxAttempts = Number(finalAssessment.maxAttempts) || FINAL_QUIZ_MAX_ATTEMPTS;
		console.log("🧪 [FINAL-QUIZ] Generate guard values:", {
			storedAttemptsUsed: Number(finalAssessment.attemptsUsed) || 0,
			effectiveAttemptsUsed: attemptsUsed,
			maxAttempts,
		});
		if (attemptsUsed >= maxAttempts) {
			await userRef.set({
				finalAssessment: {
					...finalAssessment,
					attemptsUsed,
					status: "failed",
				},
			}, { merge: true });
			console.log("🧪 [FINAL-QUIZ] Attempts exhausted while generating.");
			return res.status(403).json({ error: "Final quiz attempts exhausted", status: "failed" });
		}

		const roadmapSnap = await userRef.collection("roadmap").orderBy("order").get();
		const modules = roadmapSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
		const finalTitle = "Final Certification Assessment";
		const moduleOutline = modules
			.map((m, idx) => `${idx + 1}. ${m.moduleTitle || "Untitled"} - ${m.description || ""}`)
			.join("\n");

		const context = `Comprehensive final certification for completed roadmap modules.\n\nLearner: ${userData.name || "Learner"}\nCompany: ${companyName}\n\nModules:\n${moduleOutline}`;

		const { quiz, critique } = await generateQuizAgentic({
			title: finalTitle,
			context,
			allowCoding: true,
			moduleDescription: "Comprehensive final certification test across all completed roadmap modules.",
			companyName,
			deptName: deptId,
		});

		const finalQuizRef = userRef.collection("finalQuiz").doc("current");
		await finalQuizRef.set({
			...quiz,
			type: "final",
			quizId: "current",
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			passThreshold: Number(finalAssessment.passThreshold) || FINAL_QUIZ_PASS_THRESHOLD,
			maxAttempts,
			deadlineAt: deadlineAt || null,
			agentic: {
				critiquePass: critique?.pass || false,
				critiqueScore: critique?.score || null,
				comprehensive: true,
			},
		}, { merge: true });

		console.log("🧪 [FINAL-QUIZ] Generated and stored final quiz.", {
			mcq: quiz.mcq?.length || 0,
			oneLiners: quiz.oneLiners?.length || 0,
			coding: quiz.coding?.length || 0,
		});

		console.log("=== FINAL QUIZ GENERATE COMPLETE ===\n");
		return res.json({
			quizId: "current",
			type: "final",
			passThreshold: Number(finalAssessment.passThreshold) || FINAL_QUIZ_PASS_THRESHOLD,
			deadlineAt: deadlineAt ? deadlineAt.toISOString() : null,
			attemptsLeft: maxAttempts - attemptsUsed,
			mcq: (quiz.mcq || []).map(({ correctIndex, explanation, ...rest }) => rest),
			oneLiners: (quiz.oneLiners || []).map(({ answer, explanation, ...rest }) => rest),
			coding: (quiz.coding || []).map(({ expectedApproach, ...rest }) => rest),
		});
	} catch (err) {
		console.error("Final quiz generation error:", err);
		return res.status(500).json({ error: "Final quiz generation failed", details: err.message });
	}
};

export const submitFinalQuiz = async (req, res) => {
	try {
		const { companyId, deptId, userId, quizId = "current", answers } = req.body || {};
		if (!companyId || !deptId || !userId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		console.log("\n=== FINAL QUIZ SUBMIT START ===");
		console.log("🧪 [FINAL-QUIZ] Submit input:", { companyId, deptId, userId, quizId });

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const userSnap = await userRef.get();
		if (!userSnap.exists) {
			return res.status(404).json({ error: "User not found" });
		}
		const userData = userSnap.data() || {};
		const finalAssessment = userData.finalAssessment || {};

		if (String(finalAssessment.status || "").toLowerCase() !== "open") {
			return res.status(403).json({ error: "Final quiz is not open", status: finalAssessment.status || "locked" });
		}

		const deadlineAt = toDateSafe(finalAssessment.deadlineAt);
		if (deadlineAt && new Date() > deadlineAt) {
			await userRef.set({
				finalAssessment: { ...finalAssessment, status: "expired" },
			}, { merge: true });
			console.log("🧪 [FINAL-QUIZ] Expired on submit.");
			return res.status(403).json({ error: "Final quiz expired", status: "expired" });
		}

		const maxAttempts = Number(finalAssessment.maxAttempts) || FINAL_QUIZ_MAX_ATTEMPTS;
		const attemptsUsed = Number(finalAssessment.attemptsUsed) || 0;
		if (attemptsUsed >= maxAttempts) {
			await userRef.set({
				finalAssessment: { ...finalAssessment, status: "failed" },
			}, { merge: true });

			try {
				await createFinalQuizFailedNotification({
					companyId,
					deptId,
					userId,
					userName: userData?.name,
					userEmail: userData?.email,
					attemptsUsed,
					maxAttempts,
					finalScore: Number(finalAssessment?.lastScore),
				});
				console.log("🧪 [FINAL-QUIZ] Company final-quiz-failed notification created (pre-check).");
			} catch (notificationErr) {
				console.warn("⚠️ [FINAL-QUIZ] Failed to create final-quiz-failed notification (pre-check):", notificationErr.message);
			}

			try {
				const companySnap = await db.collection("companies").doc(companyId).get();
				const companyData = companySnap.exists ? companySnap.data() : {};
				const companyEmail = companyData?.email || companyData?.companyEmail || null;
				const companyName = companyData?.name || "TrainMate";

				if (companyEmail) {
					await sendFinalQuizFailedEmail({
						companyEmail,
						companyName,
						userName: userData?.name || "",
						userEmail: userData?.email || "",
						deptId,
						attemptsUsed,
						maxAttempts,
						finalScore: Number(finalAssessment?.lastScore),
					});
					console.log("🧪 [FINAL-QUIZ] Company final-quiz-failed email sent (pre-check).");
				}
			} catch (emailErr) {
				console.warn("⚠️ [FINAL-QUIZ] Failed to send final-quiz-failed email (pre-check):", emailErr.message);
			}

			return res.status(403).json({ error: "Final attempts exhausted", status: "failed" });
		}

		const finalQuizRef = userRef.collection("finalQuiz").doc(quizId);
		const finalQuizSnap = await finalQuizRef.get();
		if (!finalQuizSnap.exists) {
			return res.status(404).json({ error: "Final quiz not found" });
		}

		const quizData = finalQuizSnap.data() || {};
		const mcqAnswers = Array.isArray(answers?.mcq) ? answers.mcq : [];
		const oneLinerAnswers = Array.isArray(answers?.oneLiners) ? answers.oneLiners : [];
		const codingAnswers = Array.isArray(answers?.coding) ? answers.coding : [];

		const mcqResults = (quizData.mcq || []).map((q) => {
			const submitted = mcqAnswers.find((a) => a.id === q.id);
			const selectedIndex = Number.isInteger(submitted?.selectedIndex) ? submitted.selectedIndex : null;
			const isCorrect = selectedIndex === q.correctIndex;
			return {
				id: q.id,
				question: q.question,
				selectedIndex,
				correctAnswer: q.options?.[q.correctIndex] || "",
				isCorrect,
			};
		});

		const oneLinerResults = await Promise.all(
			(quizData.oneLiners || []).map(async (q) => {
				const submitted = oneLinerAnswers.find((a) => a.id === q.id);
				const response = submitted?.response || "";
				const isCorrect = await evaluateOneLinerWithLLM(q.question, q.answer, response);
				return {
					id: q.id,
					question: q.question,
					response,
					correctAnswer: q.answer,
					isCorrect,
				};
			})
		);

		const codingResults = await Promise.all(
			(quizData.coding || []).map(async (q) => {
				const submitted = codingAnswers.find((a) => a.id === q.id);
				const code = submitted?.code || "";
				const evaluation = await evaluateCode({
					question: q.question,
					code,
					expectedApproach: q.expectedApproach,
					language: q.language,
				});
				return {
					id: q.id,
					question: q.question,
					code,
					score: evaluation.score,
					isCorrect: evaluation.isCorrect,
					feedback: evaluation.feedback,
				};
			})
		);

		const mcqCorrect = mcqResults.filter((r) => r.isCorrect).length;
		const oneLinerCorrect = oneLinerResults.filter((r) => r.isCorrect).length;
		const mcqScore = mcqResults.length ? (mcqCorrect / mcqResults.length) * 100 : 0;
		const oneLinerScore = oneLinerResults.length ? (oneLinerCorrect / oneLinerResults.length) * 100 : 0;
		const codingScore = codingResults.length
			? codingResults.reduce((sum, r) => sum + (Number(r.score) || 0), 0) / codingResults.length
			: 0;

		const finalScore = Math.round(mcqScore * 0.5 + oneLinerScore * 0.25 + codingScore * 0.25);
		const passThreshold = Number(finalAssessment.passThreshold) || FINAL_QUIZ_PASS_THRESHOLD;
		const passed = finalScore >= passThreshold;
		const nextAttemptsUsed = attemptsUsed + 1;

		console.log("🧪 [FINAL-QUIZ] Evaluation summary:", {
			mcqScore,
			oneLinerScore,
			codingScore,
			finalScore,
			passThreshold,
			passed,
			attempt: nextAttemptsUsed,
		});

		await userRef.collection("finalQuizAttempts").doc(`attempt-${nextAttemptsUsed}`).set({
			attemptNumber: nextAttemptsUsed,
			score: finalScore,
			passed,
			mcqScore,
			oneLinerScore,
			codingScore,
			submittedAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		await finalQuizRef.collection("results").doc("latest").set({
			score: finalScore,
			passed,
			attemptNumber: nextAttemptsUsed,
			mcq: mcqResults,
			oneLiners: oneLinerResults,
			coding: codingResults,
			submittedAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		let finalStatus = "open";
		if (passed) finalStatus = "passed";
		else if (nextAttemptsUsed >= maxAttempts) finalStatus = "failed";

		const certificateTitle = passed
			? await generateAgenticCertificateTitle({ score: finalScore, passThreshold })
			: userData.certificateFinalQuizTitle || null;
		if (passed) {
			console.log("🧪 [FINAL-QUIZ] Agentic certificate title generated:", certificateTitle);
		}

		await userRef.set({
			finalAssessment: {
				...finalAssessment,
				status: finalStatus,
				attemptsUsed: nextAttemptsUsed,
				lastAttemptAt: new Date(),
				lastScore: finalScore,
				quizId,
			},
			certificateUnlocked: passed ? true : !!userData.certificateUnlocked,
			certificateUnlockedAt: passed ? new Date() : userData.certificateUnlockedAt || null,
			certificateFinalQuizScore: passed ? finalScore : userData.certificateFinalQuizScore || null,
			certificateFinalQuizTitle: passed ? certificateTitle : userData.certificateFinalQuizTitle || null,
		}, { merge: true });

		if (passed) {
			try {
				await createTrainingCompletionNotification({
					companyId,
					deptId,
					userId,
					userName: userData?.name,
					userEmail: userData?.email,
					finalScore,
				});
				console.log("🧪 [FINAL-QUIZ] Company completion notification created.");
			} catch (notificationErr) {
				console.warn("⚠️ [FINAL-QUIZ] Failed to create completion notification:", notificationErr.message);
			}

			try {
				const companySnap = await db.collection("companies").doc(companyId).get();
				const companyData = companySnap.exists ? companySnap.data() : {};
				const companyEmail = companyData?.email || companyData?.companyEmail || null;
				const companyName = companyData?.name || "TrainMate";

				if (companyEmail) {
					await sendTrainingCompletedEmail({
						companyEmail,
						companyName,
						userName: userData?.name || "",
						userEmail: userData?.email || "",
						deptId,
						finalScore,
					});
					console.log("🧪 [FINAL-QUIZ] Company completion email sent.");
				} else {
					console.warn("⚠️ [FINAL-QUIZ] Company email not found, skipping completion email.");
				}
			} catch (emailErr) {
				console.warn("⚠️ [FINAL-QUIZ] Failed to send completion email:", emailErr.message);
			}
		} else if (finalStatus === "failed") {
			try {
				await createFinalQuizFailedNotification({
					companyId,
					deptId,
					userId,
					userName: userData?.name,
					userEmail: userData?.email,
					attemptsUsed: nextAttemptsUsed,
					maxAttempts,
					finalScore,
				});
				console.log("🧪 [FINAL-QUIZ] Company final-quiz-failed notification created.");
			} catch (notificationErr) {
				console.warn("⚠️ [FINAL-QUIZ] Failed to create final-quiz-failed notification:", notificationErr.message);
			}

			try {
				const companySnap = await db.collection("companies").doc(companyId).get();
				const companyData = companySnap.exists ? companySnap.data() : {};
				const companyEmail = companyData?.email || companyData?.companyEmail || null;
				const companyName = companyData?.name || "TrainMate";

				if (companyEmail) {
					await sendFinalQuizFailedEmail({
						companyEmail,
						companyName,
						userName: userData?.name || "",
						userEmail: userData?.email || "",
						deptId,
						attemptsUsed: nextAttemptsUsed,
						maxAttempts,
						finalScore,
					});
					console.log("🧪 [FINAL-QUIZ] Company final-quiz-failed email sent.");
				} else {
					console.warn("⚠️ [FINAL-QUIZ] Company email not found, skipping final-quiz-failed email.");
				}
			} catch (emailErr) {
				console.warn("⚠️ [FINAL-QUIZ] Failed to send final-quiz-failed email:", emailErr.message);
			}
		}

		console.log("🧪 [FINAL-QUIZ] User final assessment updated.", { finalStatus });
		console.log("=== FINAL QUIZ SUBMIT COMPLETE ===\n");

		return res.json({
			ok: true,
			score: finalScore,
			passed,
			attemptsUsed: nextAttemptsUsed,
			attemptsLeft: Math.max(maxAttempts - nextAttemptsUsed, 0),
			finalStatus,
			certificateUnlocked: passed,
			certificateTitle: passed ? certificateTitle : null,
			message: passed
				? "Congratulations! Final quiz passed. Certificate unlocked."
				: finalStatus === "failed"
				? "Final quiz failed and attempts exhausted."
				: "Final quiz not passed. You still have attempts left.",
		});
	} catch (err) {
		console.error("Final quiz submission error:", err);
		return res.status(500).json({ error: "Final quiz submission failed", details: err.message });
	}
};

export const downloadTrainingSummaryReport = async (req, res) => {
	try {
		const { companyId, deptId, userId } = req.params || {};
		if (!companyId || !deptId || !userId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const [userSnap, companySnap, roadmapSnap] = await Promise.all([
			userRef.get(),
			db.collection("companies").doc(companyId).get(),
			userRef.collection("roadmap").orderBy("order").get(),
		]);

		if (!userSnap.exists) {
			return res.status(404).json({ error: "User not found" });
		}

		const userData = userSnap.data() || {};
		const companyData = companySnap.exists ? (companySnap.data() || {}) : {};
		const modules = roadmapSnap.docs.map((docSnap, idx) => {
			const moduleData = docSnap.data() || {};
			return {
				index: idx + 1,
				order: moduleData.order || idx + 1,
				title: moduleData.moduleTitle || "Untitled Module",
				estimatedDays: Number(moduleData.estimatedDays) || 0,
				quizAttempts: Number(moduleData.quizAttempts) || 0,
				quizPassed: !!moduleData.quizPassed,
				status: String(moduleData.status || "").toLowerCase() || (moduleData.completed ? "completed" : "unknown"),
				completed: !!moduleData.completed || String(moduleData.status || "").toLowerCase() === "completed",
			};
		});

		if (!areAllModulesCompleted(modules)) {
			return res.status(403).json({ error: "Report not available until all modules are completed" });
		}

		const completedModules = modules.filter((m) => m.completed).length;
		const totalModules = modules.length;
		const totalQuizAttempts = modules.reduce((sum, m) => sum + (Number(m.quizAttempts) || 0), 0);
		const avgAttemptsPerModule = totalModules ? Number((totalQuizAttempts / totalModules).toFixed(2)) : 0;
		const totalEstimatedDays = modules.reduce((sum, m) => sum + (Number(m.estimatedDays) || 0), 0);
		const finalAssessment = userData?.finalAssessment || {};
		const finalScore = typeof userData?.certificateFinalQuizScore === "number"
			? userData.certificateFinalQuizScore
			: (typeof finalAssessment?.lastScore === "number" ? finalAssessment.lastScore : null);

		const pdfBuffer = await generateTrainingSummaryPDF({
			userName: userData?.name || "Learner",
			userEmail: userData?.email || "",
			userPhone: userData?.phone || "",
			companyName: companyData?.name || "TrainMate",
			departmentId: deptId,
			trainingOn: userData?.trainingOn || "N/A",
			trainingLevel: userData?.trainingLevel || "N/A",
			profileStatus: userData?.status || "active",
			certificateUnlocked: !!userData?.certificateUnlocked,
			certificateTitle: userData?.certificateFinalQuizTitle || "N/A",
			finalScore,
			progressPercent: Number(userData?.progress) || 0,
			completedModules,
			totalModules,
			totalQuizAttempts,
			avgAttemptsPerModule,
			totalEstimatedDays,
			activeDays: Number(userData?.trainingStats?.activeDays) || 0,
			currentStreak: Number(userData?.trainingStats?.currentStreak) || 0,
			missedDays: Number(userData?.trainingStats?.missedDays) || 0,
			totalExpectedDays: Number(userData?.trainingStats?.totalExpectedDays) || 0,
			finalQuizStatus: finalAssessment?.status || "open",
			finalQuizAttemptsUsed: Number(finalAssessment?.attemptsUsed) || 0,
			finalQuizMaxAttempts: Number(finalAssessment?.maxAttempts) || FINAL_QUIZ_MAX_ATTEMPTS,
			finalQuizDeadline: toIsoDateOrNull(finalAssessment?.deadlineAt),
			generatedAt: new Date().toISOString(),
			modules,
		});

		const safeUserName = String(userData?.name || "learner").replace(/[^a-zA-Z0-9-_]/g, "_");
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader("Content-Disposition", `attachment; filename=Training_Summary_${safeUserName}.pdf`);
		return res.send(pdfBuffer);
	} catch (err) {
		console.error("Training summary report download error:", err);
		return res.status(500).json({ error: "Failed to generate training summary report", details: err.message });
	}
};

export const adminUnlockModule = async (req, res) => {
	try {
		const { companyId, deptId, userId, moduleId, notificationId } = req.body;
		if (!companyId || !deptId || !userId || !moduleId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const moduleRef = userRef.collection("roadmap").doc(moduleId);
		const moduleSnap = await moduleRef.get();
		if (!moduleSnap.exists) {
			return res.status(404).json({ error: "Module not found" });
		}

		const moduleData = moduleSnap.data() || {};
		const attemptsSnap = await moduleRef.collection("quizAttempts").get();
		const currentAttempts = attemptsSnap.size;

		if (moduleData.adminFinalRetryGranted) {
			return res.status(400).json({
				error: "Final retry already granted for this module",
				maxAttemptsOverride: moduleData.maxAttemptsOverride || MAX_QUIZ_ATTEMPTS + ADMIN_FINAL_RETRY_ATTEMPTS,
			});
		}

		const maxAttemptsOverride = MAX_QUIZ_ATTEMPTS + ADMIN_FINAL_RETRY_ATTEMPTS;

		await moduleRef.set({
			quizLocked: false,
			moduleLocked: false,
			status: "in-progress",
			requiresAdminContact: false,
			adminUnlockAttemptsGranted: ADMIN_FINAL_RETRY_ATTEMPTS,
			adminFinalRetryGranted: true,
			maxAttemptsOverride,
			adminUnlockedAt: admin.firestore.FieldValue.serverTimestamp(),
		}, { merge: true });

		await userRef.set({
			trainingLocked: false,
			trainingLockedAt: admin.firestore.FieldValue.delete(),
			trainingLockedReason: admin.firestore.FieldValue.delete(),
			requiresAdminContact: false,
		}, { merge: true });

		if (notificationId) {
			const notificationRef = db
				.collection("companies")
				.doc(companyId)
				.collection("adminNotifications")
				.doc(notificationId);

			await notificationRef.set(
				{
					status: "approved",
					resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true }
			);
		}

		return res.json({
			success: true,
			currentAttempts,
			attemptsGranted: ADMIN_FINAL_RETRY_ATTEMPTS,
			maxAttemptsOverride,
		});
	} catch (err) {
		console.error("Admin unlock error:", err);
		return res.status(500).json({ error: "Failed to unlock module", details: err.message });
	}
};

/**
 * Admin Pass Module - Mark module as completed/passed without requiring quiz
 * Used when admin wants to allow fresher to move to next module
 */
export const adminPassModule = async (req, res) => {
	try {
		const { companyId, deptId, userId, moduleId, notificationId } = req.body;
		if (!companyId || !deptId || !userId || !moduleId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const moduleRef = userRef.collection("roadmap").doc(moduleId);
		const moduleSnap = await moduleRef.get();
		if (!moduleSnap.exists) {
			return res.status(404).json({ error: "Module not found" });
		}

		const moduleData = moduleSnap.data() || {};
		const currentModuleOrder = moduleData.order || 0;

		// 1. Mark current module as completed and passed
		await moduleRef.set(
			{
				completed: true,
				status: "completed",
				quizPassed: true,
				quizLocked: false,
				moduleLocked: false,
				requiresAdminContact: false,
				adminPassedAt: admin.firestore.FieldValue.serverTimestamp(),
				adminPassReason: "Module passed by admin override",
			},
			{ merge: true }
		);

		// 2. Unlock user training
		await userRef.set(
			{
				trainingLocked: false,
				trainingLockedAt: admin.firestore.FieldValue.delete(),
				trainingLockedReason: admin.firestore.FieldValue.delete(),
				requiresAdminContact: false,
			},
			{ merge: true }
		);

		// 3. Unlock the next module
		const roadmapSnap = await userRef.collection("roadmap").orderBy("order").get();
		const modules = roadmapSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
		const nextModule = modules
			.filter((mod) => (mod.order || 0) > currentModuleOrder && !mod.completed)
			.sort((a, b) => (a.order || 0) - (b.order || 0))[0];

		let nextModuleTitle = null;
		if (nextModule) {
			await userRef.collection("roadmap").doc(nextModule.id).set(
				{
					status: "in-progress",
					moduleLocked: false,
					startedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true }
			);
			nextModuleTitle = nextModule.moduleTitle || "Next Module";
		}

		// 4. Update the notification if provided
		if (notificationId) {
			const notificationRef = db
				.collection("companies")
				.doc(companyId)
				.collection("adminNotifications")
				.doc(notificationId);

			await notificationRef.set(
				{
					status: "approved",
					resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
					adminAction: "passed_module",
				},
				{ merge: true }
			);
		}

		return res.json({
			success: true,
			moduleId,
			modulePassed: true,
			nextModuleTitle,
			message: `Module passed by admin. ${nextModule ? "Next module unlocked." : "All modules completed."}`,
		});
	} catch (err) {
		console.error("Admin pass module error:", err);
		return res.status(500).json({ error: "Failed to pass module", details: err.message });
	}
};
export const reportProctoringViolation = async (req, res) => {
	try {
		const {
			companyId,
			deptId,
			userId,
			moduleId,
			quizId = null,
			timeAwaySeconds = 0,
			violationCount = 0,
			action = "warning",
			notifyAdmin = false,
		} = req.body || {};

		if (!companyId || !deptId || !userId || !moduleId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		const safeAwaySeconds = Math.max(0, Number(timeAwaySeconds) || 0);
		const safeViolationCount = Math.max(0, Number(violationCount) || 0);

		const userRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId);

		const moduleRef = userRef.collection("roadmap").doc(moduleId);

		const [userSnap, moduleSnap] = await Promise.all([userRef.get(), moduleRef.get()]);
		const userData = userSnap.exists ? userSnap.data() : {};
		const moduleData = moduleSnap.exists ? moduleSnap.data() : {};

		await moduleRef.collection("proctoringViolations").add({
			quizId,
			timeAwaySeconds: safeAwaySeconds,
			violationCount: safeViolationCount,
			action,
			notifyAdmin: Boolean(notifyAdmin),
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		await moduleRef.set(
			{
				lastProctoringViolationAt: admin.firestore.FieldValue.serverTimestamp(),
				lastProctoringViolationSeconds: safeAwaySeconds,
				proctoringViolationCount: safeViolationCount,
			},
			{ merge: true }
		);

		if (notifyAdmin) {
			try {
				const companySnap = await db.collection("companies").doc(companyId).get();
				const companyData = companySnap.exists ? companySnap.data() : {};
				const companyEmail = companyData?.email || companyData?.companyEmail || null;
				const companyName = companyData?.name || "TrainMate Company";

				if (!companyEmail) {
					console.warn("Company email not found, skipping proctoring alert email");
				} else {
					await sendQuizSecurityAlertEmail({
						companyEmail,
						companyName,
						userName: userData?.name || "",
						userEmail: userData?.email || "",
						moduleTitle: moduleData?.moduleTitle || "",
						violationCount: safeViolationCount,
						timeAwaySeconds: safeAwaySeconds,
					});
				}
			} catch (emailErr) {
				console.warn("Proctoring security alert email failed (non-critical):", emailErr.message);
			}
		}

		return res.json({
			success: true,
			violationCount: safeViolationCount,
			timeAwaySeconds: safeAwaySeconds,
			notifyAdmin: Boolean(notifyAdmin),
		});
	} catch (err) {
		console.error("Proctoring violation report error:", err);
		return res.status(500).json({ error: "Failed to report proctoring violation", details: err.message });
	}
};

// Test endpoint to verify Firestore write operations
export const testFirestoreWrite = async (req, res) => {
	try {
		const { companyId, deptId, userId, moduleId } = req.body;
		
		if (!companyId || !deptId || !userId || !moduleId) {
			return res.status(400).json({ error: "Missing required IDs" });
		}

		console.log("\n=== FIRESTORE WRITE TEST START ===");
		
		const moduleRef = db
			.collection("freshers")
			.doc(companyId)
			.collection("departments")
			.doc(deptId)
			.collection("users")
			.doc(userId)
			.collection("roadmap")
			.doc(moduleId);

		const testPath = `freshers/${companyId}/departments/${deptId}/users/${userId}/roadmap/${moduleId}/quiz/test-doc`;
		console.log(`Testing write to: ${testPath}`);

		// Test 1: Write to subcollection
		const testRef = moduleRef.collection("quiz").doc("test-doc");
		await testRef.set({
			test: true,
			message: "This is a test document",
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
		});
		console.log("✓ Test document written");

		// Test 2: Verify write
		await new Promise(resolve => setTimeout(resolve, 1000));
		const verify = await testRef.get();
		if (verify.exists) {
			console.log("✓ Test document verified in Firestore");
			const data = verify.data();
			console.log("✓ Test data:", data);
			
			// Test 3: Write to nested subcollection
			const nestedRef = testRef.collection("nested").doc("test-nested");
			await nestedRef.set({
				nested: true,
				message: "This is a nested test",
				timestamp: admin.firestore.FieldValue.serverTimestamp(),
			});
			console.log("✓ Nested test document written");
			
			await new Promise(resolve => setTimeout(resolve, 1000));
			const verifyNested = await nestedRef.get();
			if (verifyNested.exists) {
				console.log("✓ Nested test document verified");
				console.log("=== FIRESTORE WRITE TEST PASSED ===\n");
				return res.json({
					success: true,
					message: "Firestore writes are working correctly",
					testPath,
					nestedPath: `${testPath}/nested/test-nested`,
				});
			} else {
				console.error("✗ Nested test document NOT found");
				return res.status(500).json({ error: "Nested write verification failed" });
			}
		} else {
			console.error("✗ Test document NOT found after write");
			console.log("=== FIRESTORE WRITE TEST FAILED ===\n");
			return res.status(500).json({ error: "Firestore write verification failed" });
		}
	} catch (err) {
		console.error("Firestore test error:", err);
		console.error("Error code:", err.code);
		console.error("Error details:", err.details);
		return res.status(500).json({ error: "Firestore test failed", details: err.message });
	}
};
