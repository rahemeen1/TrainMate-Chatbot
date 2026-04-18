import { db, admin } from "../config/firebase.js";

const AGENT_HEALTH_METADATA_COLLECTION = "agentHealthMetadata";
const AGENT_HEALTH_METADATA_DOC_ID = "latest";
const AGENT_RUN_METADATA_COLLECTION = "agentRunMetadata";
const AGENT_METRICS_COLLECTION = "agentMetrics";

const HEALTH_METADATA_WRITE_INTERVAL_MS = Math.max(
  Number(process.env.AGENT_HEALTH_METADATA_WRITE_INTERVAL_MS || 120000),
  30000
);
const RUN_METADATA_FLUSH_INTERVAL_MS = Math.max(
  Number(process.env.AGENT_RUN_METADATA_FLUSH_INTERVAL_MS || 15000),
  5000
);

let lastMetadataWriteAt = 0;
let pendingRunUpdates = new Map();
let flushTimer = null;

function nowIso() {
  return new Date().toISOString();
}

function getNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "success") return "success";
  if (value === "degraded") return "degraded";
  if (value === "failed") return "failed";
  if (value === "skipped") return "skipped";
  return "unknown";
}

function buildHealthMetadata(summary = {}) {
  const timestamp = nowIso();
  return {
    timestamp,
    firebaseTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    kpis: summary.kpis || {},
    planner: summary.planner || null,
    alertsCount: Array.isArray(summary.alerts) ? summary.alerts.length : 0,
    segmentsCount: Array.isArray(summary.segments) ? summary.segments.length : 0,
    runtimeAvailable: Boolean(summary.runtimeAvailable),
    historyWindow: getNumber(summary.historyWindow, 0),
    dataVersion: 2,
    storageMode: "metadata",
  };
}

function scheduleRunMetadataFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushQueuedAgentRunMetadata();
  }, RUN_METADATA_FLUSH_INTERVAL_MS);
}

async function flushQueuedAgentRunMetadata() {
  if (pendingRunUpdates.size === 0) return { success: true, flushed: 0 };

  const entries = Array.from(pendingRunUpdates.entries());
  pendingRunUpdates = new Map();

  try {
    const batch = db.batch();

    for (const [agentKey, update] of entries) {
      const ref = db.collection(AGENT_RUN_METADATA_COLLECTION).doc(agentKey);
      batch.set(
        ref,
        {
          agentKey,
          agentName: update.agentName || agentKey,
          segment: update.segment || "unknown",
          type: update.type || "unknown",
          totalRuns: admin.firestore.FieldValue.increment(update.totalRuns || 0),
          successRuns: admin.firestore.FieldValue.increment(update.successRuns || 0),
          failedRuns: admin.firestore.FieldValue.increment(update.failedRuns || 0),
          degradedRuns: admin.firestore.FieldValue.increment(update.degradedRuns || 0),
          skippedRuns: admin.firestore.FieldValue.increment(update.skippedRuns || 0),
          lastStatus: update.lastStatus || "unknown",
          lastRunAt: update.lastRunAt || nowIso(),
          lastValidationScore: update.lastValidationScore ?? null,
          lastDurationMs: update.lastDurationMs ?? null,
          updatedAt: nowIso(),
          firebaseTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    return { success: true, flushed: entries.length };
  } catch (error) {
    console.error("❌ Error flushing agent run metadata:", error);
    return { success: false, error: error.message };
  }
}

export function queueAgentRunIncrement(agentRun = {}) {
  const agentKey = String(agentRun.agentKey || "").trim();
  if (!agentKey) {
    return { success: false, error: "agentKey is required" };
  }

  const status = normalizeStatus(agentRun.status);
  const current = pendingRunUpdates.get(agentKey) || {
    agentName: agentRun.agentName || agentKey,
    segment: agentRun.segment || "unknown",
    type: agentRun.type || "unknown",
    totalRuns: 0,
    successRuns: 0,
    failedRuns: 0,
    degradedRuns: 0,
    skippedRuns: 0,
    lastStatus: status,
    lastRunAt: nowIso(),
    lastValidationScore: null,
    lastDurationMs: null,
  };

  current.totalRuns += 1;
  if (status === "success") current.successRuns += 1;
  if (status === "failed") current.failedRuns += 1;
  if (status === "degraded") current.degradedRuns += 1;
  if (status === "skipped") current.skippedRuns += 1;
  current.lastStatus = status;
  current.lastRunAt = nowIso();
  current.lastValidationScore = agentRun.validationScore ?? current.lastValidationScore;
  current.lastDurationMs = agentRun.durationMs ?? current.lastDurationMs;
  if (agentRun.agentName) current.agentName = agentRun.agentName;
  if (agentRun.segment) current.segment = agentRun.segment;
  if (agentRun.type) current.type = agentRun.type;

  pendingRunUpdates.set(agentKey, current);

  if (pendingRunUpdates.size >= 25) {
    flushQueuedAgentRunMetadata();
  } else {
    scheduleRunMetadataFlush();
  }

  return { success: true, queued: true };
}

export async function getAgentRunMetadata(agentKeys = []) {
  try {
    const docs = await db.collection(AGENT_RUN_METADATA_COLLECTION).get();
    const filterSet = new Set((Array.isArray(agentKeys) ? agentKeys : []).map((key) => String(key || "").trim()));

    const items = docs.docs
      .map((doc) => ({ docId: doc.id, ...doc.data() }))
      .filter((row) => filterSet.size === 0 || filterSet.has(String(row.agentKey || "")));

    return { success: true, data: items };
  } catch (error) {
    console.error("❌ Error retrieving agent run metadata:", error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Store compact agent health metadata in Firestore
 */
export async function storeAgentHealthMetadata(summary = {}, options = {}) {
  try {
    const now = Date.now();
    const force = Boolean(options.forceWrite);
    if (!force && now - lastMetadataWriteAt < HEALTH_METADATA_WRITE_INTERVAL_MS) {
      return {
        success: true,
        skipped: true,
        reason: "throttled",
        nextAllowedInMs: HEALTH_METADATA_WRITE_INTERVAL_MS - (now - lastMetadataWriteAt),
      };
    }

    const metadata = buildHealthMetadata(summary);
    await db
      .collection(AGENT_HEALTH_METADATA_COLLECTION)
      .doc(AGENT_HEALTH_METADATA_DOC_ID)
      .set(metadata, { merge: true });

    lastMetadataWriteAt = now;
    return { success: true, docId: AGENT_HEALTH_METADATA_DOC_ID, timestamp: metadata.timestamp };
  } catch (error) {
    console.error("❌ Error storing agent health metadata:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Backward-compatible wrapper. Stores metadata instead of snapshots.
 */
export async function storeAgentHealthSnapshot(agentRows, summary) {
  return storeAgentHealthMetadata(summary, { forceWrite: false });
}

/**
 * Store individual agent metrics for historical tracking
 */
export async function storeAgentMetrics(agent) {
  try {
    const timestamp = new Date().toISOString();
    const docId = `${agent.key}_${Date.now()}`;

    const metrics = {
      agentKey: agent.key,
      agentName: agent.name,
      segment: agent.segment,
      type: agent.type,
      accuracy: agent.accuracy,
      successRate: agent.successRate,
      avgLatencyMs: agent.avgLatencyMs,
      runs: agent.runs,
      status: agent.status,
      lastRunAt: agent.lastRunAt,
      timestamp,
      firebaseTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection(AGENT_METRICS_COLLECTION).doc(docId).set(metrics);

    return { success: true, docId };
  } catch (error) {
    console.error("❌ Error storing agent metrics:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get latest agent health metadata from storage
 */
export async function getLatestAgentHealthMetadata() {
  try {
    const doc = await db
      .collection(AGENT_HEALTH_METADATA_COLLECTION)
      .doc(AGENT_HEALTH_METADATA_DOC_ID)
      .get();

    if (!doc.exists) {
      return { success: false, data: null, message: "No stored metadata found" };
    }

    const data = doc.data();
    return { success: true, data, docId: doc.id };
  } catch (error) {
    console.error("❌ Error retrieving latest agent health metadata:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Backward-compatible wrapper.
 */
export async function getLatestAgentHealthSnapshot() {
  return getLatestAgentHealthMetadata();
}

/**
 * Get agent health snapshots within a time range
 */
export async function getAgentHealthSnapshots(hoursBack = 24) {
  try {
    const latest = await getLatestAgentHealthMetadata();
    if (!latest.success || !latest.data) {
      return { success: true, data: [], count: 0 };
    }
    return { success: true, data: [{ docId: latest.docId, ...latest.data }], count: 1 };
  } catch (error) {
    console.error("❌ Error retrieving agent health metadata history:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get metrics history for a specific agent
 */
export async function getAgentMetricsHistory(agentKey, hoursBack = 24) {
  try {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const docs = await db
      .collection(AGENT_METRICS_COLLECTION)
      .orderBy("firebaseTimestamp", "desc")
      .limit(500)
      .get();

    const filtered = docs.docs
      .map((doc) => ({
        docId: doc.id,
        ...doc.data(),
      }))
      .filter((doc) => {
        const docTime = doc.firebaseTimestamp?.toDate?.() || new Date(doc.timestamp);
        return doc.agentKey === agentKey && docTime > cutoffTime;
      })
      .reverse(); // Chronological order

    return { success: true, data: filtered, count: filtered.length };
  } catch (error) {
    console.error("❌ Error retrieving agent metrics history:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Merge runtime data with stored data
 */
export function mergeRuntimeAndStoredData(runtimeData, storedData) {
  if (!storedData) return runtimeData;

  // Runtime data takes priority (fresher), but fill gaps from storage
  const merged = { ...runtimeData };

  // If runtime has no data, use stored as fallback
  if (!merged.agents || merged.agents.length === 0) {
    merged.agents = storedData.agents || [];
    merged.kpis = storedData.kpis || merged.kpis;
    merged.segments = storedData.segments || merged.segments;
    merged.alerts = storedData.alerts || merged.alerts;
    merged.dataSource = "stored";
  } else {
    merged.dataSource = "runtime";
  }

  return merged;
}
