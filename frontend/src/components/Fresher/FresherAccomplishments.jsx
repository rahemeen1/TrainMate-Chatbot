// FresherAccomplishments.jsx – Display Fresher Learning Accomplishments
import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs } from "firebase/firestore";
import { FresherSideMenu } from "./FresherSideMenu";

export default function FresherAccomplishments() {
  const { companyId, deptId, userId } = useParams();
  const location = useLocation();
  const companyName = location.state?.companyName || "";

  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const ref = collection(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId,
        "roadmap"
      );

      const snap = await getDocs(ref);
      setModules(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      setLoading(false);
    };
    load();
  }, [companyId, deptId, userId]);

  if (loading)
    return (
      <div className="flex h-screen bg-[#031C3A] text-white">
        <div className="w-64 bg-[#021B36]/90 p-4">
          <FresherSideMenu {...{ userId, companyId, deptId, companyName }} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-10 w-10 border-4 border-[#00FFFF] border-t-transparent rounded-full" />
        </div>
      </div>
    );

  return (
    <div className="flex h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu {...{ userId, companyId, deptId, companyName }} />
      </div>

      {/* Content */}
      <div className="flex-1 p-8 space-y-6 overflow-y-auto">
        <h1 className="text-3xl font-bold text-[#00FFFF]">
          Your Learning Accomplishments
        </h1>

        {modules.map((m) => (
          <div
            key={m.id}
            className="bg-[#021B36]/90 border border-[#00FFFF30]
            rounded-xl p-6 space-y-3"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-[#00FFFF]">
                {m.moduleTitle}
              </h2>

              {m.completed ? (
                <span className="text-green-400">✅ Completed</span>
              ) : (
                <span className="text-yellow-400">⏳ In Progress</span>
              )}
            </div>

            <p className="text-[#AFCBE3]">{m.description}</p>

            {/* Extended details from LLM */}
            {/* {m.insights && (
              <div className="text-sm text-[#AFCBE3] space-y-1">
                <p><strong>🎯 Objective:</strong> {m.insights.objective}</p>
                <p><strong>🛠 Skills Gained:</strong> {m.insights.skills}</p>
                <p><strong>🚀 Outcome:</strong> {m.insights.outcome}</p>
              </div>
            )} */}
            {m.insights && (
  <div className="text-sm text-[#AFCBE3] space-y-2">
    <p>
      <strong>🎯 Why this matters:</strong> {m.insights.whyThisMatters}
    </p>

    <p>
      <strong>🧠 Key Topics:</strong>{" "}
      {m.insights.keyTopics?.join(", ")}
    </p>

    <p>
      <strong>🛠 Tools:</strong>{" "}
      {m.insights.toolsYouWillUse?.join(", ")}
    </p>

    <p>
      <strong>🚀 Outcomes:</strong>{" "}
      {m.insights.outcomes?.join(", ")}
    </p>
  </div>
)}

            <p className="text-xs text-[#AFCBE3]">
              ⏱ Estimated time: {m.estimatedDays} days
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
