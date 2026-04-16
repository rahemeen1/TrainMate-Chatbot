import { useEffect, useMemo, useState } from "react";
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
    <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-4 sm:p-5">
      <p className="text-sm text-[#9FC2DA]">{title}</p>
      <p className="text-2xl font-bold text-[#E8F7FF] mt-1">{value}</p>
      {subtitle ? <p className="text-xs text-[#7FA3BF] mt-1">{subtitle}</p> : null}
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
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/superadmin/agent-health?limit=120");
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }

        const payload = await res.json();
        if (!payload?.success) {
          throw new Error(payload?.error || "Invalid response");
        }

        setData({ ...fallbackData, ...payload });
      } catch (err) {
        console.error("Agent health fetch failed:", err);
        setError("Live agent metrics are unavailable right now. Showing an empty state.");
        setData(fallbackData);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

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

          <div className="text-xs text-[#7FA3BF] space-y-1">
            <p>Generated: {formatDate(data.generatedAt)}</p>
            <p>History Window: {data.historyWindow || 0} runs</p>
            <p>Instrumented Agents: {data.kpis.instrumentedAgents || 0}/{data.kpis.totalAgents || 0}</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[#00FFFF20] bg-[#021B36] px-3 py-2 text-xs text-[#9FC2DA]">
          Runtime: {data.runtimeMessage || (data.runtimeAvailable ? "Available" : "Unavailable")}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard title="Total Agents" value={data.kpis.totalAgents || 0} subtitle="Cataloged in platform" />
        <MetricCard title="Avg Accuracy" value={formatMetric(data.kpis.avgAccuracy, "%")} subtitle="Validation quality" />
        <MetricCard title="Success Rate" value={formatMetric(data.kpis.avgSuccessRate, "%")} subtitle="Execution completion" />
        <MetricCard title="Avg Latency" value={formatMetric(data.kpis.avgLatencyMs, " ms")} subtitle="Per-step runtime" />
        <MetricCard title="Critical" value={data.kpis.criticalAgents || 0} subtitle="Needs immediate check" />
        <MetricCard title="Warning" value={data.kpis.warningAgents || 0} subtitle="Below target quality" />
      </div>

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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <SectionCard title="Agent Runtime Table" subtitle="Sorted by current status and data availability">
            <div className="overflow-x-auto rounded-lg border border-[#00FFFF20]">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="bg-[#021B36] text-[#AFCBE3]">
                    <th className="p-2 border border-[#00FFFF20] text-left">Agent</th>
                    <th className="p-2 border border-[#00FFFF20] text-left">Segment</th>
                    <th className="p-2 border border-[#00FFFF20] text-left">Type</th>
                    <th className="p-2 border border-[#00FFFF20] text-left">Accuracy</th>
                    <th className="p-2 border border-[#00FFFF20] text-left">Success</th>
                    <th className="p-2 border border-[#00FFFF20] text-left">Latency</th>
                    <th className="p-2 border border-[#00FFFF20] text-left">Runs</th>
                    <th className="p-2 border border-[#00FFFF20] text-left">Status</th>
                    <th className="p-2 border border-[#00FFFF20] text-left">Last Run</th>
                  </tr>
                </thead>
                <tbody>
                  {!agentsWithRows ? (
                    <tr>
                      <td className="p-3 text-center text-[#9FC2DA]" colSpan={9}>
                        {loading ? "Loading agent telemetry..." : "No agent rows available yet."}
                      </td>
                    </tr>
                  ) : (
                    [...data.agents]
                      .sort((a, b) => {
                        const order = { critical: 0, warning: 1, healthy: 2, "no-data": 3 };
                        const byStatus = (order[a.status] ?? 10) - (order[b.status] ?? 10);
                        if (byStatus !== 0) return byStatus;
                        return (a.name || "").localeCompare(b.name || "");
                      })
                      .map((agent) => (
                        <tr key={agent.key} className="hover:bg-[#00FFFF0d]">
                          <td className="p-2 border border-[#00FFFF20] text-[#E8F7FF]">{agent.name}</td>
                          <td className="p-2 border border-[#00FFFF20] text-[#AFCBE3]">{agent.segment}</td>
                          <td className="p-2 border border-[#00FFFF20] text-[#AFCBE3]">{agent.type}</td>
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
                      ))
                  )}
                </tbody>
              </table>
            </div>
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
    </div>
  );
}
