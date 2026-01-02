import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { useLocation } from "react-router-dom";
import CompanySidebar from "./CompanySidebar";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function Analytics() {
  const location = useLocation();

  const companyId =
    location?.state?.companyId || localStorage.getItem("companyId");
  const companyName =
    location?.state?.companyName || localStorage.getItem("companyName");

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!companyId) return;

      try {
         const chartData = [];

        // 🔹 1️⃣ Fetch departments dynamically
        const departmentsRef = collection(
          db,
          "companies",
          companyId,
          "departments"
        );

        const departmentsSnap = await getDocs(departmentsRef);
        const departments = departmentsSnap.docs.map((doc) => doc.id);
        
        for (const dept of departments) {
          const usersRef = collection(
            db,
            "freshers",
            companyId,
            "departments",
            dept,
            "users"
          );

          const snap = await getDocs(usersRef);

          chartData.push({
            department: dept,
            users: snap.size,
          });
        }

        setData(chartData);
      } catch (err) {
        console.error("Analytics error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [companyId]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#031C3A] text-white">
        Loading analytics...
      </div>
    );

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#00FFFF]">
              Company Analytics
            </h1>
            <p className="text-[#AFCBE3] mt-1">
              Department-wise user distribution
            </p>
          </div>

          {/* Chart Card */}
          <div className="bg-[#021B36]/70 border border-[#00FFFF30] rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[#00FFFF] mb-4">
              Users per Department
            </h2>

            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(13, 88, 200, 0.13)" />
                  <XAxis dataKey="department" stroke="#AFCBE3" />
                  <YAxis stroke="#AFCBE3" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#021B36",
                      border: "1px solid #00FFFF50",
                      color: "#fff",
                    }}
                  />
                  <Bar dataKey="users" fill="#00FFFF" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
            {data.map((d) => (
              <div
                key={d.department}
                className="p-5 bg-[#021B36]/60 border border-[#00FFFF30] rounded-xl shadow-md hover:scale-105 transition"
              >
                <p className="text-[#AFCBE3] text-sm">{d.department}</p>
                <p className="text-2xl font-bold text-[#00FFFF]">
                  {d.users}
                </p>
                <p className="text-xs text-gray-400 mt-1">Total Users</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
