import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { apiUrl } from "../../services/api";

const STATUS_COLORS = {
  healthy: "#22C55E",
  warning: "#F59E0B",
  critical: "#EF4444",
  "no-data": "#64748B",
};

const SEGMENT_COLORS = ["#00FFFF", "#60A5FA", "#34D399", "#A78BFA"];

const fallbackData = {
  generatedAt: null,
  historyWindow: 0,
  runtimeAvailable: false,
  runtimeMessage: "Runtime metrics unavailable",
  planner: {
    runs: 0,
    llmRuns: 0,
    fallbackRuns: 0,
    fallbackRate: null,
    llmRate: null,
  },
  kpis: {
    totalAgents: 0,
    instrumentedAgents: 0,
    avgAccuracy: null,
    avgSuccessRate: null,
    avgLatencyMs: null,
    healthyAgents: 0,
    warningAgents: 0,
    criticalAgents: 0,
    noDataAgents: 0,
  },
  segments: [],
  alerts: [],
  agents: [],
};

function MetricCard({ title, value, subtitle }) {
  return (
    <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-3.5 sm:p-4">
      <p className="text-xs text-[#9FC2DA]">{title}</p>
      <p className="text-[1.6rem] font-bold text-[#E8F7FF] mt-1">{value}</p>
      {subtitle ? <p className="text-xs text-[#7FA3BF] mt-1 leading-tight">{subtitle}</p> : null}
    </div>
  );
}

function SectionCard({ title, children, subtitle }) {
  return (
    <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-4 sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#AFCBE3]">{title}</h3>
        {subtitle ? <p className="text-xs text-[#7FA3BF] mt-1">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function formatMetric(value, suffix = "") {
  if (value == null || Number.isNaN(Number(value))) return "N/A";
  return `${value}${suffix}`;
}

function formatDate(isoValue) {
  if (!isoValue) return "N/A";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusText(status) {
  if (status === "healthy") return "Healthy";
  if (status === "warning") return "Warning";
  if (status === "critical") return "Critical";
  return "No Data";
}

export default function SuperAdminAgentHealth() {
  const [data, setData] = useState(fallbackData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [clockTick, setClockTick] = useState(Date.now());

  useEffect(() => {
    if (!lastRefreshedAt) return undefined;

    const intervalId = setInterval(() => {
      setClockTick(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [lastRefreshedAt]);

  const loadData = useCallback(async ({ isManualRefresh = false } = {}) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
      setError("");

      try {
        const res = await fetch(apiUrl("/api/superadmin/agent-health?limit=120"));
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }

        const payload = await res.json();
        if (!payload?.success) {
          throw new Error(payload?.error || "Invalid response");
        }

        setData({ ...fallbackData, ...payload });
        setLastRefreshedAt(Date.now());
      } catch (err) {
        console.error("Agent health fetch failed:", err);
        setError("Live agent metrics are unavailable right now. Showing an empty state.");
        setData(fallbackData);
      } finally {
        if (isManualRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const segmentAccuracyData = useMemo(
    () =>
      (data.segments || []).map((segment) => ({
        name: segment.name,
        accuracy: segment.avgAccuracy ?? 0,
        successRate: segment.avgSuccessRate ?? 0,
      })),
    [data.segments]
  );

  const statusDistribution = useMemo(
    () => [
      { name: "Healthy", value: data.kpis.healthyAgents || 0, key: "healthy" },
      { name: "Warning", value: data.kpis.warningAgents || 0, key: "warning" },
      { name: "Critical", value: data.kpis.criticalAgents || 0, key: "critical" },
      { name: "No Data", value: data.kpis.noDataAgents || 0, key: "no-data" },
    ],
    [data.kpis]
  );

  const agentsWithRows = (data.agents || []).length > 0;
  const refreshedSecondsAgo = lastRefreshedAt
    ? Math.max(0, Math.floor((clockTick - lastRefreshedAt) / 1000))
    : null;

  const refreshedText =
    refreshedSecondsAgo == null
      ? "Not refreshed yet"
      : refreshedSecondsAgo < 60
        ? `Last refreshed ${refreshedSecondsAgo}s ago`
        : `Last refreshed ${Math.floor(refreshedSecondsAgo / 60)}m ago`;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.18em] uppercase text-[#8EB6D3]">System Intelligence</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#E8F7FF] mt-1">Agent Health Center</h2>
            <p className="text-sm text-[#9FC2DA] mt-2">
              Monitor agent accuracy, runtime behavior, reliability, and alerts across Fresher and Company systems.
            </p>
          </div>

          <div className="text-xs text-[#7FA3BF] space-y-1 w-full lg:w-auto lg:min-w-[250px]">
            <div className="flex items-center gap-2 justify-start lg:justify-end">
              <button
                type="button"
                onClick={() => loadData({ isManualRefresh: true })}
                disabled={loading || refreshing}
                className="inline-flex items-center rounded-lg border border-[#00FFFF55] bg-gradient-to-r from-[#022244] to-[#04315A] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#D7F5FF] shadow-[0_0_0_1px_rgba(0,255,255,0.08),0_8px_18px_rgba(0,0,0,0.25)] transition hover:from-[#04315A] hover:to-[#05406F] hover:border-[#00FFFFAA] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh Data"}
              </button>
              <span className="text-[11px] text-[#8EB6D3]">{refreshedText}</span>
            </div>
            <p>Generated: {formatDate(data.generatedAt)}</p>
            <p>History Window: {data.historyWindow || 0} runs</p>
            <p>Instrumented Agents: {data.kpis.instrumentedAgents || 0}/{data.kpis.totalAgents || 0}</p>
            <p className="font-semibold text-[#AFCBE3]">
              Data Source: {data.dataSource === "stored" ? "💾 Stored (Persistent)" : "🔴 Runtime (Live)"}
            </p>
          </div>
        </div>

        <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
          data.dataSource === "stored"
            ? "border-[#F59E0B20] bg-[#F59E0B10] text-[#F59E0B]"
            : "border-[#00FFFF20] bg-[#021B36] text-[#9FC2DA]"
        }`}>
          {data.dataSource === "stored" 
            ? `⚠️ ${data.runtimeMessage || "Showing persistent stored data (runtime unavailable)"}` 
            : data.runtimeMessage || (data.runtimeAvailable ? "✅ Runtime available" : "Runtime unavailable")}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        <MetricCard title="Total Agents" value={data.kpis.totalAgents || 0} subtitle="Cataloged in platform" />
        <MetricCard title="Avg Accuracy" value={formatMetric(data.kpis.avgAccuracy, "%")} subtitle="Validation quality" />
        <MetricCard title="Success Rate" value={formatMetric(data.kpis.avgSuccessRate, "%")} subtitle="Execution completion" />
        <MetricCard title="Critical" value={data.kpis.criticalAgents || 0} subtitle="Needs immediate check" />
        <MetricCard
          title="Planner Fallback"
          value={formatMetric(data.planner?.fallbackRate, "%")}
          subtitle={`${data.planner?.fallbackRuns || 0}/${data.planner?.runs || 0} fallback plans`}
        />
      </div>

      {(data.planner?.fallbackRuns || 0) > 0 ? (
        <div className="rounded-xl border border-[#F59E0B30] bg-[#F59E0B10] px-4 py-3 text-sm text-[#FCD34D]">
          Planner fallback is active in {data.planner?.fallbackRate ?? 0}% of tracked runs. This can reduce roadmap quality and should be monitored.
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SectionCard title="Segment Accuracy" subtitle="Average accuracy and success-rate by side">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={segmentAccuracyData}>
              <CartesianGrid stroke="#1f3a5a" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#AFCBE3" />
              <YAxis stroke="#AFCBE3" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="accuracy" fill="#00FFFF" radius={[6, 6, 0, 0]} name="Accuracy %" />
              <Bar dataKey="successRate" fill="#60A5FA" radius={[6, 6, 0, 0]} name="Success %" />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Health Distribution" subtitle="Current system status split">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={statusDistribution} dataKey="value" nameKey="name" outerRadius={95} label>
                {statusDistribution.map((entry) => (
                  <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <SectionCard title="Coverage by Segment" subtitle="How much runtime telemetry is available">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(data.segments || []).map((segment, idx) => (
            <div
              key={segment.name}
              className="rounded-xl border border-[#00FFFF30] bg-[#021B36] p-4"
              style={{ boxShadow: `inset 0 0 0 1px ${SEGMENT_COLORS[idx % SEGMENT_COLORS.length]}22` }}
            >
              <p className="text-base font-semibold text-[#E8F7FF]">{segment.name}</p>
              <p className="text-xs text-[#7FA3BF] mt-1">{segment.withRuntimeData}/{segment.agentCount} with runtime data</p>
              <div className="mt-3 space-y-1 text-sm text-[#AFCBE3]">
                <p>Accuracy: {formatMetric(segment.avgAccuracy, "%")}</p>
                <p>Success: {formatMetric(segment.avgSuccessRate, "%")}</p>
                <p>Healthy: {segment.healthyCount || 0}</p>
                <p>Warning: {segment.warningCount || 0}</p>
                <p>Critical: {segment.criticalCount || 0}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div>
        <SectionCard title="Agent Runtime Tables" subtitle="Grouped by agent type and sorted by status">
          {(() => {
            const agentsByType = {};
            (data.agents || []).forEach((agent) => {
              const type = agent.type || "unknown";
              if (!agentsByType[type]) {
                agentsByType[type] = [];
              }
              agentsByType[type].push(agent);
            });

            // Sort agents within each type
            Object.keys(agentsByType).forEach((type) => {
              agentsByType[type].sort((a, b) => {
                const order = { critical: 0, warning: 1, healthy: 2, "no-data": 3 };
                const byStatus = (order[a.status] ?? 10) - (order[b.status] ?? 10);
                if (byStatus !== 0) return byStatus;
                return (a.name || "").localeCompare(b.name || "");
              });
            });

            const types = Object.keys(agentsByType).sort();

            return (
              <div className="space-y-6">
                {types.length === 0 ? (
                  <div className="rounded-lg border border-[#00FFFF30] bg-[#021B36] p-4 text-center text-[#9FC2DA]">
                    {loading ? "Loading agent telemetry..." : "No agent data available yet."}
                  </div>
                ) : (
                  types.map((type) => (
                    <div key={type} className="overflow-x-auto rounded-lg border border-[#00FFFF20]">
                      <table className="w-full min-w-[960px] text-sm">
                        <thead>
                          <tr className="bg-[#021B36] text-[#AFCBE3]">
                            <th className="p-2 border border-[#00FFFF20] text-left font-semibold capitalize">
                              {type === "orchestrator-registered" ? "🔄 Orchestrator Agents" : type === "function-agent" ? "⚙️ Function Agents" : `📊 ${type}`}
                            </th>
                            <th className="p-2 border border-[#00FFFF20] text-left">Segment</th>
                            <th className="p-2 border border-[#00FFFF20] text-left">Accuracy</th>
                            <th className="p-2 border border-[#00FFFF20] text-left">Success</th>
                            <th className="p-2 border border-[#00FFFF20] text-left">Latency</th>
                            <th className="p-2 border border-[#00FFFF20] text-left">Runs</th>
                            <th className="p-2 border border-[#00FFFF20] text-left">Status</th>
                            <th className="p-2 border border-[#00FFFF20] text-left">Last Run</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agentsByType[type].map((agent) => (
                            <tr key={agent.key} className="hover:bg-[#00FFFF0d]">
                              <td className="p-2 border border-[#00FFFF20] text-[#E8F7FF] font-medium">{agent.name}</td>
                              <td className="p-2 border border-[#00FFFF20] text-[#AFCBE3]">{agent.segment}</td>
                              <td className="p-2 border border-[#00FFFF20]">{formatMetric(agent.accuracy, "%")}</td>
                              <td className="p-2 border border-[#00FFFF20]">{formatMetric(agent.successRate, "%")}</td>
                              <td className="p-2 border border-[#00FFFF20]">{formatMetric(agent.avgLatencyMs, " ms")}</td>
                              <td className="p-2 border border-[#00FFFF20]">{agent.runs || 0}</td>
                              <td className="p-2 border border-[#00FFFF20]">
                                <span
                                  className="px-2 py-1 rounded text-xs text-black"
                                  style={{ backgroundColor: STATUS_COLORS[agent.status] || "#64748B" }}
                                >
                                  {statusText(agent.status)}
                                </span>
                              </td>
                              <td className="p-2 border border-[#00FFFF20] text-[#AFCBE3]">{formatDate(agent.lastRunAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>
            );
          })()}
        </SectionCard>
      </div>

      <div>
        <SectionCard title="Active Alerts" subtitle="Warning and critical agents">
            <div className="space-y-3 max-h-[480px] overflow-auto pr-1">
              {(data.alerts || []).length === 0 ? (
                <div className="rounded-lg border border-[#00FFFF30] bg-[#021B36] p-3 text-sm text-[#9FC2DA]">
                  No active alerts from current runtime data.
                </div>
              ) : (
                data.alerts.map((alert) => (
                  <div key={alert.agentKey} className="rounded-lg border border-[#00FFFF30] bg-[#021B36] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#E8F7FF]">{alert.agentName}</p>
                      <span
                        className="px-2 py-0.5 rounded text-[11px] text-black"
                        style={{ backgroundColor: STATUS_COLORS[alert.status] || "#64748B" }}
                      >
                        {statusText(alert.status)}
                      </span>
                    </div>
                    <p className="text-xs text-[#8EB6D3] mt-1">{alert.segment}</p>
                    <p className="text-xs text-[#AFCBE3] mt-2">
                      Accuracy: {formatMetric(alert.accuracy, "%")} | Success: {formatMetric(alert.successRate, "%")}
                    </p>
                    <p className="text-xs text-[#7FA3BF] mt-1">{alert.reason}</p>
                  </div>
                ))
              )}
            </div>
        </SectionCard>
      </div>
    </div>
  );
}
