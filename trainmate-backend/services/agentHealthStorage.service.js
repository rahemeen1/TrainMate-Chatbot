import { db } from "../config/firebase.js";
import { collection, doc, setDoc, getDocs, query, orderBy, limit, Timestamp } from "firebase/firestore";

const AGENT_HEALTH_COLLECTION = "agentHealthSnapshots";
const AGENT_METRICS_COLLECTION = "agentMetrics";

/**
 * Store agent health snapshot in Firestore
 */
export async function storeAgentHealthSnapshot(agentRows, summary) {
  try {
    const timestamp = new Date().toISOString();
    const docId = `snapshot_${Date.now()}`;

    const snapshot = {
      timestamp,
      firebaseTimestamp: Timestamp.now(),
      agents: agentRows,
      kpis: summary.kpis,
      segments: summary.segments,
      alerts: summary.alerts,
    };

    const snapshotRef = doc(db, AGENT_HEALTH_COLLECTION, docId);
    await setDoc(snapshotRef, snapshot);

    console.log(`✅ Agent health snapshot stored: ${docId}`);
    return { success: true, docId, timestamp };
  } catch (error) {
    console.error("❌ Error storing agent health snapshot:", error);
    return { success: false, error: error.message };
  }
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
      firebaseTimestamp: Timestamp.now(),
    };

    const metricsRef = doc(db, AGENT_METRICS_COLLECTION, docId);
    await setDoc(metricsRef, metrics);

    return { success: true, docId };
  } catch (error) {
    console.error("❌ Error storing agent metrics:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get latest agent health snapshot from storage
 */
export async function getLatestAgentHealthSnapshot() {
  try {
    const q = query(
      collection(db, AGENT_HEALTH_COLLECTION),
      orderBy("firebaseTimestamp", "desc"),
      limit(1)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { success: false, data: null, message: "No stored snapshots found" };
    }

    const data = snapshot.docs[0].data();
    return { success: true, data, docId: snapshot.docs[0].id };
  } catch (error) {
    console.error("❌ Error retrieving latest agent health snapshot:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get agent health snapshots within a time range
 */
export async function getAgentHealthSnapshots(hoursBack = 24) {
  try {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const q = query(
      collection(db, AGENT_HEALTH_COLLECTION),
      orderBy("firebaseTimestamp", "desc"),
      limit(100)
    );

    const snapshots = await getDocs(q);
    const filtered = snapshots.docs
      .map((doc) => ({
        docId: doc.id,
        ...doc.data(),
      }))
      .filter((doc) => {
        const docTime = doc.firebaseTimestamp?.toDate?.() || new Date(doc.timestamp);
        return docTime > cutoffTime;
      });

    return { success: true, data: filtered, count: filtered.length };
  } catch (error) {
    console.error("❌ Error retrieving agent health snapshots:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get metrics history for a specific agent
 */
export async function getAgentMetricsHistory(agentKey, hoursBack = 24) {
  try {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const q = query(
      collection(db, AGENT_METRICS_COLLECTION),
      orderBy("firebaseTimestamp", "desc"),
      limit(500)
    );

    const docs = await getDocs(q);
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
