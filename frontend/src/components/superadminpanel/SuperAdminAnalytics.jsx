//frontend/src/components/superadminpanel/SuperAdminAnalytics.jsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#00FFFF", "#FF4D4D"];

export default function SuperAdminAnalytics({ stats }) {
  const barData = [
    { name: "Companies", value: stats.companies },
    { name: "Users", value: stats.users },
  ];

  const pieData = [
    { name: "Active Companies", value: stats.companies },
    { name: "Suspended", value: Math.max(0, stats.totalCompanies - stats.companies) },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-10">
      
      {/* 📊 Bar Chart */}
      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-[#AFCBE3] mb-4">
          Platform Growth
        </h3>

        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={barData}>
            <XAxis dataKey="name" stroke="#AFCBE3" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#00FFFF" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 🥧 Pie Chart */}
      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-[#AFCBE3] mb-4">
          Company Status
        </h3>

        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              outerRadius={90}
              label
            >
              {pieData.map((_, index) => (
                <Cell key={index} fill={COLORS[index]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
