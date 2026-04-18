//frontend/src/components/superadminpanel/SuperAdminAnalytics.jsx
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["#00FFFF", "#EC4899", "#A78BFA", "#F59E0B", "#60A5FA", "#F87171"];

const formatTimestamp = (timestamp) => {
  if (!timestamp) return "—";
  const seconds = timestamp.seconds || timestamp._seconds;
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-GB");
};

const normalizeStatus = (status) => {
  if (!status) return "unknown";
  if (status === "active") return "active";
  return "inactive";
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

function SectionCard({ title, children }) {
  return (
    <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-[#AFCBE3] mb-4">{title}</h3>
      {children}
    </div>
  );
}

function MultiLineTick({ x, y, payload }) {
  const [line1, line2] = String(payload.value).split("\n");

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#AFCBE3" fontSize="12">
        <tspan x="0" dy="12">{line1}</tspan>
        {line2 ? <tspan x="0" dy="14">{line2}</tspan> : null}
      </text>
    </g>
  );
}

export default function SuperAdminAnalytics({ analytics }) {
  const [slicer, setSlicer] = useState({
    status: "all",
    period: "all",
    topCities: "6",
  });

  const filteredRecentCompanies = useMemo(() => {
    const now = new Date();

    return analytics.recentCompanies.filter((company) => {
      const companyStatus = normalizeStatus(company.status);
      if (slicer.status !== "all" && companyStatus !== slicer.status) {
        return false;
      }

      if (slicer.period === "all") {
        return true;
      }

      const seconds = company?.createdAt?.seconds || company?.createdAt?._seconds;
      if (!seconds) return false;
      const createdDate = new Date(seconds * 1000);

      if (slicer.period === "30d") {
        const threshold = new Date(now);
        threshold.setDate(now.getDate() - 30);
        return createdDate >= threshold;
      }

      if (slicer.period === "thisMonth") {
        return (
          createdDate.getMonth() === now.getMonth() &&
          createdDate.getFullYear() === now.getFullYear()
        );
      }

      return true;
    });
  }, [analytics.recentCompanies, slicer.status, slicer.period]);

  const qualityAndAdoptionData = useMemo(
    () => [
      { name: "Onboarding\nCompletion", value: analytics.onboardingCompletionRate },
      { name: "Profile\nCompleteness", value: analytics.profileCompletenessRate },
    ],
    [analytics.onboardingCompletionRate, analytics.profileCompletenessRate]
  );

  return (
    <div className="space-y-6">
      {/* <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-4 sm:p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <p className="text-sm text-[#AFCBE3] font-semibold">Dashboard Slicer</p>
            <p className="text-xs text-[#7FA3BF] mt-1">
              Filter your dashboard and companies from one control panel.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full xl:w-auto xl:min-w-[560px]">
            <select
              value={slicer.status}
              onChange={(e) => setSlicer((prev) => ({ ...prev, status: e.target.value }))}
              className="bg-[#021B36] text-[#E8F7FF] border border-[#00FFFF30] rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Status: All</option>
              <option value="active">Status: Active</option>
              <option value="inactive">Status: Inactive</option>
            </select>

            <select
              value={slicer.period}
              onChange={(e) => setSlicer((prev) => ({ ...prev, period: e.target.value }))}
              className="bg-[#021B36] text-[#E8F7FF] border border-[#00FFFF30] rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Period: All Time</option>
              <option value="thisMonth">Period: This Month</option>
              <option value="30d">Period: Last 30 Days</option>
            </select>

            <select
              value={slicer.topCities}
              onChange={(e) => setSlicer((prev) => ({ ...prev, topCities: e.target.value }))}
              className="bg-[#021B36] text-[#E8F7FF] border border-[#00FFFF30] rounded-lg px-3 py-2 text-sm"
            >
              <option value="4">Top Cities: 4</option>
              <option value="6">Top Cities: 6</option>
              <option value="8">Top Cities: 8</option>
            </select>
          </div>
        </div>

        <div className="border-t border-[#00FFFF20] pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-[#AFCBE3]"> Companies</h3>
            <span className="text-xs text-[#7FA3BF]">{filteredRecentCompanies.length} records</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#00FFFF20]">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-[#021B36] text-[#AFCBE3]">
                  <th className="p-2 border border-[#00FFFF20] text-left">Company</th>
                  <th className="p-2 border border-[#00FFFF20] text-left">Email</th>
                  <th className="p-2 border border-[#00FFFF20] text-left">Location</th>
                  <th className="p-2 border border-[#00FFFF20] text-left">Created</th>
                  <th className="p-2 border border-[#00FFFF20] text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecentCompanies.length === 0 ? (
                  <tr>
                    <td className="p-3 text-center text-[#9FC2DA]" colSpan={5}>
                      No companies match slicer filters.
                    </td>
                  </tr>
                ) : (
                  filteredRecentCompanies.map((company) => {
                    const status = normalizeStatus(company.status);
                    return (
                      <tr key={company.id} className="hover:bg-[#00FFFF0d]">
                        <td className="p-2 border border-[#00FFFF20]">{company.name}</td>
                        <td className="p-2 border border-[#00FFFF20]">{company.email}</td>
                        <td className="p-2 border border-[#00FFFF20]">{company.address}</td>
                        <td className="p-2 border border-[#00FFFF20]">{formatTimestamp(company.createdAt)}</td>
                        <td className="p-2 border border-[#00FFFF20]">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              status === "active" ? "bg-green-600" : "bg-red-600"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div> */}
      

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="New This Month"
          value={analytics.newCompaniesThisMonth}
          subtitle="Based on company created date"
        />
        <MetricCard
          title="Onboarding Completion"
          value={`${analytics.onboardingCompletionRate}%`}
          subtitle="Companies with onboarding answers"
        />
        <MetricCard
          title="Profile Completeness"
          value={`${analytics.profileCompletenessRate}%`}
          subtitle="Core profile fields complete"
        />
        <MetricCard
          title="Inactive Companies"
          value={analytics.inactiveCompanies}
          subtitle="Needs admin attention"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SectionCard title="Data Quality & Adoption">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={qualityAndAdoptionData}>
              <CartesianGrid stroke="#1f3a5a" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#AFCBE3" interval={0} height={48} tick={<MultiLineTick />} />
              <YAxis stroke="#AFCBE3" allowDecimals={false} domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="value" fill="#60A5FA" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Team Size Distribution">
          <ResponsiveContainer width="100%" height={270}>
            <PieChart>
              <Pie
                data={analytics.teamSizeDistribution}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label
              >
                {analytics.teamSizeDistribution.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      
    </div>
  );
}
