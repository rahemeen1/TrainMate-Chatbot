import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import CompanySidebar from "./CompanySidebar";

export default function ProgressDetails() {
  const { companyId, deptName: encodedDeptName, userId } = useParams();
  const deptName = decodeURIComponent(encodedDeptName || "");
  const navigate = useNavigate();

  const [modules, setModules] = useState([]);
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 🔹 Fetch roadmap modules
        const q = query(
          collection(
            db,
            "freshers",
            companyId,
            "departments",
            deptName,
            "users",
            userId,
            "roadmap"
          ),
          orderBy("order", "asc")
        );

        const snap = await getDocs(q);
        const roadmapData = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setModules(roadmapData);

        // 🔹 Fetch user info
        const userSnap = await getDocs(
          collection(
            db,
            "freshers",
            companyId,
            "departments",
            deptName,
            "users"
          )
        );

        const user = userSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .find((u) => u.id === userId);

        setUserInfo(user || null);
      } catch (err) {
        console.error("❌ Progress fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, deptName, userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#031C3A] flex items-center justify-center text-teal-400">
        Loading roadmap progress...
      </div>
    );
  }

  const roadmapCreatedDate = modules[0]?.createdAt
    ? new Date(modules[0].createdAt.seconds * 1000).toDateString()
    : "N/A";

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
      <CompanySidebar companyId={companyId} />

      {/* Main Content */}
      <div className="flex-1 p-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold text-[#00FFFF] mb-2">
              Employee Roadmap Progress
            </h1>
            <p className="text-[#AFCBE3] mb-6">
              Detailed module-wise completion overview
            </p>
          </div>
          <div>
            <button
              onClick={() => navigate(-1)}
              className="px-3 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Employee Info Card */}
        <div className="bg-[#021B36] border border-teal-400/30 rounded-xl p-6 mb-8 max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-gray-400">Employee Name</p>
              <p className="text-lg font-semibold text-teal-300">
                {userInfo?.name || "N/A"}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Department</p>
              <p className="text-lg">{deptName}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Roadmap Created On</p>
              <p className="text-lg">{roadmapCreatedDate}</p>
            </div>
          </div>
        </div>

        {/* Roadmap Modules */}
        <div className="max-w-4xl space-y-5">
          {modules.map((m) => (
            <div
              key={m.id}
              className={`relative pl-6 border-l-4 rounded-xl p-5
                ${
                  m.status === "completed"
                    ? "border-teal-400 bg-teal-400/10"
                    : "border-yellow-400 bg-yellow-400/5"
                }
              `}
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">
                  {m.order}. {m.moduleTitle}
                </h2>

                <span
                  className={`px-3 py-1 text-xs rounded font-bold
                    ${
                      m.status === "completed"
                        ? "bg-teal-400 text-black"
                        : "bg-yellow-400/20 text-yellow-300"
                    }
                  `}
                >
                  {m.status.toUpperCase()}
                </span>
              </div>

              <p className="text-sm text-[#CFE8FF] mb-3">
                {m.description}
              </p>

              <div className="flex justify-between text-xs text-gray-300">
                <span>⏱ {m.estimatedDays} days</span>
              
              </div>
            </div>
          ))}

          {!modules.length && (
            <div className="text-center text-gray-400 py-10">
              <p className="text-lg text-[#AFCBE3]">
                {userInfo?.name
                  ? `${userInfo.name} hasn't onboarded yet.`
                  : "This user hasn't onboarded yet."}
              </p>
              <p className="text-sm mt-2">No roadmap created for this user.</p>
              <div className="mt-4">
                
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
