let agentsInitialized = false;

async function loadOrchestratorDependencies() {
  try {
    const [{ orchestrator }, { initializeAgentRegistry }] = await Promise.all([
      import("../../services/agentOrchestrator.service.js"),
      import("../../services/agentRegistry.js"),
    ]);

    return { orchestrator, initializeAgentRegistry };
  } catch (error) {
    // Keep endpoint usable even when orchestrator dependencies cannot boot.
    return {
      orchestrator: null,
      initializeAgentRegistry: null,
      loadError: error,
    };
  }
}

async function ensureAgentsInitialized(initializeAgentRegistry) {
  if (!initializeAgentRegistry) return;

  if (!agentsInitialized) {
    initializeAgentRegistry();
    agentsInitialized = true;
  }
}

const AGENT_CATALOG = [
  {
    key: "extract-cv-skills",
    name: "CV Skills Agent",
    segment: "Fresher",
    type: "orchestrator-registered",
    source: "roadmap",
  },
  {
    key: "extract-company-skills",
    name: "Company Skills Agent",
    segment: "Company",
    type: "orchestrator-registered",
    source: "roadmap",
  },
  {
    key: "analyze-skill-gaps",
    name: "Gap Analysis Agent",
    segment: "Fresher",
    type: "orchestrator-registered",
    source: "roadmap",
  },
  {
    key: "plan-retrieval",
    name: "Planning Agent",
    segment: "Shared",
    type: "orchestrator-registered",
    source: "roadmap",
  },
  {
    key: "retrieve-documents",
    name: "Retrieval Agent",
    segment: "Company",
    type: "orchestrator-registered",
    source: "roadmap",
  },
  {
    key: "generate-roadmap",
    name: "Roadmap Generation Agent",
    segment: "Fresher",
    type: "orchestrator-registered",
    source: "roadmap",
  },
  {
    key: "evaluate-code",
    name: "Code Evaluation Agent",
    segment: "Fresher",
    type: "orchestrator-registered",
    source: "assessment",
  },
  {
    key: "validate-roadmap",
    name: "Validation Agent",
    segment: "Shared",
    type: "orchestrator-registered",
    source: "roadmap",
  },
  {
    key: "quiz-planning-agent",
    name: "Quiz Planning Agent",
    segment: "Fresher",
    type: "function-agent",
    source: "quiz",
  },
  {
    key: "quiz-decision-agent",
    name: "Quiz Decision Agent",
    segment: "Fresher",
    type: "function-agent",
    source: "quiz",
  },
  {
    key: "daily-agenda-agent",
    name: "Daily Agenda Agent",
    segment: "Fresher",
    type: "function-agent",
    source: "chat",
  },
  {
    key: "knowledge-fetch-agent",
    name: "Knowledge Fetch Agent",
    segment: "Fresher",
    type: "function-agent",
    source: "chat",
  },
  {
    key: "company-fresher-chat-agent",
    name: "Company Fresher Chat Agent",
    segment: "Company",
    type: "function-agent",
    source: "company-chat",
  },
  {
    key: "notification-strategy-agent",
    name: "Notification Strategy Agent",
    segment: "Company",
    type: "function-agent",
    source: "notifications",
  },
  {
    key: "notification-content-agent",
    name: "Notification Content Agent",
    segment: "Company",
    type: "function-agent",
    source: "notifications",
  },
];

function round(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const factor = Math.pow(10, digits);
  return Math.round(Number(value) * factor) / factor;
}

function toStatus({ accuracy, successRate, hasRuntimeData }) {
  if (!hasRuntimeData) return "no-data";

  const a = Number(accuracy || 0);
  const s = Number(successRate || 0);
  const blended = a * 0.7 + s * 0.3;

  if (blended >= 85) return "healthy";
  if (blended >= 70) return "warning";
  return "critical";
}

function aggregateRuntimeMetrics(history) {
  const metricsMap = new Map();

  for (const execution of history) {
    const stepLog = execution?.executionResults?.executionLog;
    if (!Array.isArray(stepLog)) continue;

    for (const step of stepLog) {
      if (!step?.agent) continue;
      if (!metricsMap.has(step.agent)) {
        metricsMap.set(step.agent, {
          runs: 0,
          successes: 0,
          totalValidationScore: 0,
          validationCount: 0,
          totalDurationMs: 0,
          durationCount: 0,
          lastRunAt: null,
          lastError: null,
        });
      }

      const current = metricsMap.get(step.agent);
      current.runs += 1;

      if (step.status === "SUCCESS") {
        current.successes += 1;
      } else if (step.status === "FAILED") {
        current.lastError = step.reason || "Step failed";
      }

      const validationScore = step?.validation?.score;
      if (typeof validationScore === "number") {
        current.totalValidationScore += validationScore;
        current.validationCount += 1;
      }

      if (typeof step.duration === "number") {
        current.totalDurationMs += step.duration;
        current.durationCount += 1;
      }

      const executionTimestamp = execution?.timestamp
        ? new Date(execution.timestamp)
        : null;
      if (executionTimestamp && !Number.isNaN(executionTimestamp.getTime())) {
        current.lastRunAt = executionTimestamp.toISOString();
      }
    }
  }

  return metricsMap;
}

function buildAgentRows(catalog, runtimeMap) {
  return catalog.map((entry) => {
    const runtime = runtimeMap.get(entry.key);
    const hasRuntimeData = Boolean(runtime && runtime.runs > 0);

    const runs = hasRuntimeData ? runtime.runs : 0;
    const successRate = hasRuntimeData && runtime.runs
      ? round((runtime.successes / runtime.runs) * 100, 1)
      : null;

    const accuracy = hasRuntimeData && runtime.validationCount
      ? round(runtime.totalValidationScore / runtime.validationCount, 1)
      : null;

    const avgLatencyMs = hasRuntimeData && runtime.durationCount
      ? Math.round(runtime.totalDurationMs / runtime.durationCount)
      : null;

    const status = toStatus({ accuracy, successRate, hasRuntimeData });

    return {
      id: entry.key,
      key: entry.key,
      name: entry.name,
      segment: entry.segment,
      type: entry.type,
      source: entry.source,
      runs,
      successRate,
      accuracy,
      avgLatencyMs,
      lastRunAt: hasRuntimeData ? runtime.lastRunAt : null,
      lastError: hasRuntimeData ? runtime.lastError : null,
      hasRuntimeData,
      status,
    };
  });
}

function summarizeRows(agentRows) {
  const withData = agentRows.filter((a) => a.hasRuntimeData);

  const avgAccuracy = withData.length
    ? round(
        withData.reduce((sum, item) => sum + (item.accuracy || 0), 0) /
          withData.length,
        1
      )
    : null;

  const avgSuccessRate = withData.length
    ? round(
        withData.reduce((sum, item) => sum + (item.successRate || 0), 0) /
          withData.length,
        1
      )
    : null;

  const avgLatencyMs = withData.length
    ? Math.round(
        withData.reduce((sum, item) => sum + (item.avgLatencyMs || 0), 0) /
          withData.length
      )
    : null;

  const statusCounts = agentRows.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    { healthy: 0, warning: 0, critical: 0, "no-data": 0 }
  );

  const segmentNames = ["Fresher", "Company", "Shared"];
  const segments = segmentNames.map((segment) => {
    const segmentRows = agentRows.filter((a) => a.segment === segment);
    const segmentWithData = segmentRows.filter((a) => a.hasRuntimeData);

    return {
      name: segment,
      agentCount: segmentRows.length,
      withRuntimeData: segmentWithData.length,
      avgAccuracy: segmentWithData.length
        ? round(
            segmentWithData.reduce((sum, item) => sum + (item.accuracy || 0), 0) /
              segmentWithData.length,
            1
          )
        : null,
      avgSuccessRate: segmentWithData.length
        ? round(
            segmentWithData.reduce((sum, item) => sum + (item.successRate || 0), 0) /
              segmentWithData.length,
            1
          )
        : null,
      healthyCount: segmentRows.filter((a) => a.status === "healthy").length,
      warningCount: segmentRows.filter((a) => a.status === "warning").length,
      criticalCount: segmentRows.filter((a) => a.status === "critical").length,
      noDataCount: segmentRows.filter((a) => a.status === "no-data").length,
    };
  });

  const alerts = agentRows
    .filter((a) => a.status === "critical" || a.status === "warning")
    .sort((a, b) => {
      if (a.status === b.status) return (a.accuracy || 999) - (b.accuracy || 999);
      return a.status === "critical" ? -1 : 1;
    })
    .slice(0, 8)
    .map((item) => ({
      agentKey: item.key,
      agentName: item.name,
      segment: item.segment,
      status: item.status,
      accuracy: item.accuracy,
      successRate: item.successRate,
      reason: item.lastError || "Lower than expected quality indicators",
    }));

  return {
    kpis: {
      totalAgents: agentRows.length,
      instrumentedAgents: withData.length,
      avgAccuracy,
      avgSuccessRate,
      avgLatencyMs,
      healthyAgents: statusCounts.healthy,
      warningAgents: statusCounts.warning,
      criticalAgents: statusCounts.critical,
      noDataAgents: statusCounts["no-data"],
    },
    segments,
    alerts,
  };
}

export async function getSuperAdminAgentHealth(req, res) {
  try {
    const { orchestrator, initializeAgentRegistry, loadError } =
      await loadOrchestratorDependencies();

    await ensureAgentsInitialized(initializeAgentRegistry);

    const historyLimit = Math.min(Math.max(Number(req.query.limit) || 100, 10), 300);
    const history = orchestrator ? orchestrator.getExecutionHistory(historyLimit) : [];

    const runtimeMap = aggregateRuntimeMetrics(history);
    const agentRows = buildAgentRows(AGENT_CATALOG, runtimeMap);
    const summary = summarizeRows(agentRows);

    // Store snapshot to Firestore for persistence
    const { storeAgentHealthSnapshot, getLatestAgentHealthSnapshot, mergeRuntimeAndStoredData } =
      await import("../../services/agentHealthStorage.service.js");

    await storeAgentHealthSnapshot(agentRows, summary);

    // If no runtime data, try to get latest stored snapshot as fallback
    let finalData = {
      success: true,
      generatedAt: new Date().toISOString(),
      historyWindow: history.length,
      runtimeAvailable: Boolean(orchestrator),
      runtimeMessage: orchestrator
        ? "Runtime metrics loaded from orchestrator history"
        : `Runtime metrics unavailable (${loadError?.message || "orchestrator not initialized"})`,
      ...summary,
      agents: agentRows,
      dataSource: "runtime",
    };

    // If no runtime data available, use stored data as fallback
    if (!orchestrator || agentRows.every((a) => !a.hasRuntimeData)) {
      const storedResult = await getLatestAgentHealthSnapshot();
      if (storedResult.success && storedResult.data) {
        finalData = {
          ...finalData,
          ...storedResult.data,
          dataSource: "stored",
          runtimeMessage: `Using stored snapshot from ${storedResult.data.timestamp}`,
        };
      }
    }

    return res.status(200).json(finalData);
  } catch (error) {
    console.error("Error building super admin agent health:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to build agent health dashboard data",
      details: error.message,
    });
  }
}
