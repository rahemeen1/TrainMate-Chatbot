import { db } from "../../../config/firebase.js";
import { orchestrator } from "../../agentOrchestrator.service.js";

const DEFAULT_LOOP_MS = 30 * 1000;
const CLAIMED_TIMEOUT_MS = 10 * 60 * 1000;

const runtimeState = {
  timer: null,
  running: false,
  inFlight: false,
  runtimeId: `autonomy-runtime-${process.pid || "local"}`,
};

function getCollectionRef() {
  return db.collection("autonomousAgentGoals");
}

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function recoverStaleInProgressGoals(now = new Date()) {
  const staleBefore = new Date(now.getTime() - CLAIMED_TIMEOUT_MS);
  const snap = await getCollectionRef()
    .where("status", "==", "in_progress")
    .limit(100)
    .get();

  if (snap.empty) return 0;

  const staleDocs = snap.docs.filter((doc) => {
    const claimedAt = toDateSafe(doc.data()?.claimedAt);
    return claimedAt && claimedAt.getTime() <= staleBefore.getTime();
  });

  let recovered = 0;
  for (const doc of staleDocs) {
    const data = doc.data() || {};
    const attempts = Number(data.attempts || 0);
    const maxAttempts = Math.max(1, Number(data.maxAttempts || 3));
    const shouldFail = attempts >= maxAttempts;

    await doc.ref.update({
      status: shouldFail ? "failed" : "pending",
      updatedAt: now,
      lastError: shouldFail
        ? "Marked failed after stale in_progress lease and max attempts reached"
        : "Recovered stale in_progress goal",
      claimedBy: null,
      claimedAt: null,
      startedAt: null,
      ...(shouldFail ? { failedAt: now } : { nextRunAt: now }),
    });
    recovered += 1;
  }

  return recovered;
}

async function claimNextGoal(now = new Date()) {
  const dueSnap = await getCollectionRef()
    .where("status", "==", "pending")
    .limit(100)
    .get();

  if (dueSnap.empty) {
    return null;
  }

  const candidates = dueSnap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() || {} }))
    .filter((candidate) => {
      const nextRunAt = toDateSafe(candidate.data.nextRunAt) || new Date(0);
      return nextRunAt.getTime() <= now.getTime();
    })
    .sort((a, b) => {
      const pA = Number(a.data.priority || 0);
      const pB = Number(b.data.priority || 0);
      if (pA !== pB) return pB - pA;
      const tA = toDateSafe(a.data.createdAt)?.getTime() || 0;
      const tB = toDateSafe(b.data.createdAt)?.getTime() || 0;
      return tA - tB;
    });

  for (const candidate of candidates) {
    const claimed = await db.runTransaction(async (tx) => {
      const live = await tx.get(candidate.ref);
      if (!live.exists) return null;

      const data = live.data() || {};
      if (data.status !== "pending") return null;

      const nextRunAt = toDateSafe(data.nextRunAt) || new Date(0);
      if (nextRunAt.getTime() > now.getTime()) return null;

      tx.update(candidate.ref, {
        status: "in_progress",
        claimedBy: runtimeState.runtimeId,
        claimedAt: now,
        startedAt: now,
        updatedAt: now,
        attempts: Number(data.attempts || 0) + 1,
      });

      return {
        id: candidate.id,
        ref: candidate.ref,
        data,
      };
    });

    if (claimed) {
      return claimed;
    }
  }

  return null;
}

async function markGoalCompleted(goalRef, result, now = new Date()) {
  await goalRef.update({
    status: "completed",
    completedAt: now,
    updatedAt: now,
    claimedAt: null,
    claimedBy: null,
    resultSummary: {
      success: Boolean(result?.success),
      validationScore: Number(result?.metadata?.validationScore || 0),
      reasoningCycles: Number(result?.metadata?.reasoningCycles || 0),
      queuedFollowUpGoals: Number(result?.metadata?.queuedFollowUpGoals || 0),
    },
    lastError: null,
  });
}

async function markGoalFailedOrRetry(goalRef, goalData, error, now = new Date()) {
  const attempts = Number(goalData.attempts || 0) + 1;
  const maxAttempts = Math.max(1, Number(goalData.maxAttempts || 3));
  const shouldRetry = attempts < maxAttempts;

  if (!shouldRetry) {
    await goalRef.update({
      status: "failed",
      failedAt: now,
      updatedAt: now,
      claimedAt: null,
      claimedBy: null,
      lastError: String(error?.message || error || "Autonomous goal failed"),
    });
    return;
  }

  const backoffMinutes = Math.min(30, attempts * 5);
  const nextRunAt = new Date(now.getTime() + backoffMinutes * 60 * 1000);

  await goalRef.update({
    status: "pending",
    updatedAt: now,
    claimedAt: null,
    claimedBy: null,
    nextRunAt,
    lastError: String(error?.message || error || "Autonomous goal execution failed"),
  });
}

async function processClaimedGoal(claimedGoal, now = new Date()) {
  const goalText = String(claimedGoal?.data?.goal || "").trim();
  if (!goalText) {
    await claimedGoal.ref.update({
      status: "failed",
      failedAt: now,
      updatedAt: now,
      claimedAt: null,
      claimedBy: null,
      lastError: "Autonomous goal text was empty",
    });
    return;
  }

  const goalContext =
    claimedGoal?.data?.context && typeof claimedGoal.data.context === "object"
      ? claimedGoal.data.context
      : {};

  try {
    const result = await orchestrator.orchestrate(goalText, {
      ...goalContext,
      autonomyMode: true,
      allowAutonomousFollowUps: true,
      autonomyGoalId: claimedGoal.id,
      autonomyDepth: Number(goalContext.autonomyDepth || 0),
    });

    if (result?.success) {
      await markGoalCompleted(claimedGoal.ref, result, now);
      console.log(`✅ Autonomous goal completed: ${claimedGoal.id}`);
      return;
    }

    await markGoalFailedOrRetry(
      claimedGoal.ref,
      claimedGoal.data,
      new Error(result?.error || "Autonomous orchestration returned failure"),
      now
    );
  } catch (error) {
    await markGoalFailedOrRetry(claimedGoal.ref, claimedGoal.data, error, now);
  }
}

async function runtimeTick() {
  if (runtimeState.inFlight) return;
  runtimeState.inFlight = true;

  try {
    const now = new Date();
    await recoverStaleInProgressGoals(now);

    const claimedGoal = await claimNextGoal(now);
    if (!claimedGoal) return;

    await processClaimedGoal(claimedGoal, now);
  } catch (error) {
    console.error("❌ Autonomous runtime tick failed:", error.message);
  } finally {
    runtimeState.inFlight = false;
  }
}

export function initializeAutonomousAgentRuntime() {
  if (runtimeState.running) {
    return;
  }

  const enabled = String(process.env.ENABLE_AUTONOMOUS_RUNTIME || "true").toLowerCase();
  if (enabled !== "true" && enabled !== "1" && enabled !== "yes") {
    console.log("ℹ️ Autonomous agent runtime disabled by environment flag");
    return;
  }

  const loopMs = Math.max(5_000, Number(process.env.AUTONOMOUS_RUNTIME_LOOP_MS || DEFAULT_LOOP_MS));

  runtimeState.timer = setInterval(() => {
    runtimeTick().catch((error) => {
      console.error("❌ Autonomous runtime loop error:", error.message);
    });
  }, loopMs);

  runtimeState.running = true;
  console.log(`🤖 Autonomous agent runtime initialized (every ${loopMs}ms)`);

  runtimeTick().catch((error) => {
    console.error("❌ Autonomous runtime initial tick failed:", error.message);
  });
}

export function stopAutonomousAgentRuntime() {
  if (runtimeState.timer) {
    clearInterval(runtimeState.timer);
  }
  runtimeState.timer = null;
  runtimeState.running = false;
  runtimeState.inFlight = false;
}
