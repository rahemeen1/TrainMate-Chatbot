//UserProfile.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase"; 
import CompanySidebar from "./CompanySidebar"; 
export default function UserProfile() {
  const { companyId, deptId, userId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roadmapModules, setRoadmapModules] = useState([]);
  const [roadmapLoading, setRoadmapLoading] = useState(true);
  const [expandedSkills, setExpandedSkills] = useState({});
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          console.log("User data fetched:", snap.data());
          setUser(snap.data());
        } else {
          console.warn("User not found");
          alert("User not found");
        }
      } catch (err) {
        console.error("Error fetching user info:", err);
        alert("Error fetching user info");
      } finally {
        setLoading(false);
      }
    };

    if (companyId && deptId && userId) {
      fetchUser();
    } else {
      console.error("Missing params");
      setLoading(false);
    }
  }, [companyId, deptId, userId]);
  useEffect(() => {
  const fetchRoadmap = async () => {
    if (!companyId || !deptId || !userId) return;

    try {
      const roadmapRef = collection(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId,
        "roadmap"
      );

      const snap = await getDocs(roadmapRef);

      const modules = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => a.order - b.order); // order = module number

      setRoadmapModules(modules);
    } catch (err) {
      console.error("Error fetching roadmap:", err);
    } finally {
      setRoadmapLoading(false);
    }
  };

  fetchRoadmap();
}, [companyId, deptId, userId]);

  if (loading) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar stays as it is */}
      <CompanySidebar companyId={companyId}/>

      {/* Main content loading area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
        {/* Rotating hourglass */}
        <svg
          className="animate-spin h-8 w-8 text-[#00FFFF]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="M12 2C6.477 2 2 6.477 2 12h2a8 8 0 0116 0h2c0-5.523-4.477-10-10-10zm0 20c5.523 0 10-4.477 10-10h-2a8 8 0 01-16 0H2c0 5.523 4.477 10 10 10z"
          />
        </svg>

        <p className="text-base font-medium text-white">
          Loading User Profile...
        </p>
      </div>
    </div>
  );
}
if (!user) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white items-center justify-center">
      <p className="text-2xl font-semibold">No user found</p>
    </div>
  );
}
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={user.companyName} />

      <div className="flex-1 p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Top Bar with Back Button */}
          <div className="flex items-center justify-between">
            <button 
              onClick={() => window.history.back()} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-[#00FFFF]/10 transition text-[#AFCBE3] font-medium"
            >
              ← Back to Users
            </button>
          </div>

          {/* Header Section */}
          <div className="rounded-2xl border border-[#00FFFF30] bg-[#021B36]/80 shadow-lg p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                {/* Avatar */}
                <div className="w-24 h-24 rounded-full bg-[#031C3A] border-3 border-[#00FFFF] flex items-center justify-center text-4xl font-bold text-[#00FFFF] flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>

                {/* Name and Quick Info */}
                <div>
                  <h1 className="text-3xl font-bold text-[#00FFFF]">{user.name}</h1>
                  <p className="text-[#AFCBE3] mt-2">{user.email}</p>
                  <p className="text-[#AFCBE3]">{user.phone}</p>
                </div>
              </div>

              {/* CV and Status */}
              <div className="flex flex-col gap-3">
                {user.cvUrl && (
                  <a
                    href={user.cvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold hover:opacity-90 transition text-center"
                  >
                    Download CV
                  </a>
                )}
                <div className="px-4 py-2 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-center">
                  <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Status</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mt-1
                    ${user.status === "active"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"}
                  `}>
                    {user.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Training Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
              <p className="text-[#AFCBE3] text-sm font-medium">Training On</p>
              <p className="text-lg font-semibold text-[#00FFFF] mt-2">{user.trainingOn || "N/A"}</p>
            </div>

            <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
              <p className="text-[#AFCBE3] text-sm font-medium">Training Level</p>
              <p className="text-lg font-semibold text-[#00FFFF] mt-2 capitalize">{user.trainingLevel || "N/A"}</p>
            </div>

            <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
              <p className="text-[#AFCBE3] text-sm font-medium">Onboarding</p>
              <p className="text-lg font-semibold text-[#00FFFF] mt-2">{user.onboarding?.onboardingCompleted ? "✓ Completed" : "Pending"}</p>
            </div>
          </div>

          {/* Progress Section */}
          <div className="rounded-2xl border border-[#00FFFF22] bg-[#021B36]/70 p-5 md:p-6">
            <h2 className="text-xl font-semibold text-[#00FFFF] mb-4">Overall Progress</h2>
            <div className="space-y-3">
              <div className="w-full bg-[#00FFFF20] rounded-full h-5 overflow-hidden border border-[#00FFFF30]">
                <div
                  className="bg-gradient-to-r from-[#00FFFF] to-[#00BFD4] h-5 rounded-full transition-all duration-300"
                  style={{ width: `${user.progress || 0}%` }}
                ></div>
              </div>
              <p className="text-right text-[#AFCBE3] font-semibold">{user.progress || 0}% Complete</p>
            </div>
          </div>

          {/* Training Stats */}
          <div className="rounded-2xl border border-[#00FFFF22] bg-[#021B36]/70 p-5 md:p-6">
            <h2 className="text-xl font-semibold text-[#00FFFF] mb-4">Training Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Active Days", value: user.trainingStats?.activeDays },
                { label: "Current Streak", value: user.trainingStats?.currentStreak },
                { label: "Missed Days", value: user.trainingStats?.missedDays },
                { label: "Expected Days", value: user.trainingStats?.totalExpectedDays },
              ].map((item, i) => (
                <div key={i} className="p-4 bg-[#031C3A]/70 rounded-lg border border-[#00FFFF30] text-center">
                  <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">{item.label}</p>
                  <p className="text-2xl font-bold text-[#00FFFF] mt-2">{item.value ?? 0}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Training Roadmap Section */}
          <div className="rounded-2xl border border-[#00FFFF22] bg-[#021B36]/70 p-5 md:p-6">
            <h2 className="text-xl font-semibold text-[#00FFFF] mb-4">Training Roadmap</h2>

            {roadmapLoading ? (
              <div className="flex items-center justify-center py-8">
                <svg
                  className="animate-spin h-6 w-6 text-[#00FFFF]"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    fill="currentColor"
                    d="M12 2C6.477 2 2 6.477 2 12h2a8 8 0 0116 0h2c0-5.523-4.477-10-10-10zm0 20c5.523 0 10-4.477 10-10h-2a8 8 0 01-16 0H2c0 5.523 4.477 10 10 10z"
                  />
                </svg>
                <p className="text-[#AFCBE3] ml-3">Loading roadmap...</p>
              </div>
            ) : roadmapModules.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-yellow-400 font-medium">Roadmap not generated yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[#AFCBE3] border-b border-[#00FFFF30] bg-[#031C3A]/60">
                      <th className="px-4 py-3 text-left font-semibold">Module</th>
                      <th className="px-4 py-3 text-left font-semibold">Skills Covered</th>
                      <th className="px-4 py-3 text-center font-semibold">Days</th>
                      <th className="px-4 py-3 text-center font-semibold">Status</th>
                      <th className="px-4 py-3 text-center font-semibold">Quiz Overview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roadmapModules.map((m) => (
                      <tr key={m.id} className="border-b border-[#00FFFF10] hover:bg-[#031C3A]/40 transition">
                        <td className="px-4 py-4 font-semibold text-white">
                          Module {m.order}: {m.moduleTitle}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                              {expandedSkills[m.id]
                                ? m.skillsCovered?.map((s, i) => (
                                    <span key={i} className="px-2 py-1 bg-[#00FFFF]/10 border border-[#00FFFF30] rounded text-xs text-[#AFCBE3]">
                                      {s}
                                    </span>
                                  ))
                                : m.skillsCovered?.slice(0, 3).map((s, i) => (
                                    <span key={i} className="px-2 py-1 bg-[#00FFFF]/10 border border-[#00FFFF30] rounded text-xs text-[#AFCBE3]">
                                      {s}
                                    </span>
                                  ))}
                            </div>
                            {m.skillsCovered?.length > 3 && (
                              <button
                                onClick={() => setExpandedSkills(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                                className="text-left px-2 py-1 text-xs text-[#00FFFF] hover:text-[#00e5e5] font-medium transition"
                              >
                                {expandedSkills[m.id] ? "← View Less" : `View More (+${m.skillsCovered.length - 3})`}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-center text-white font-medium">{m.estimatedDays} days</td>

                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold
                            ${m.completed
                              ? "bg-green-500/20 text-green-400"
                              : "bg-yellow-500/20 text-yellow-400"}
                          `}>
                            {m.completed ? "✓ Completed" : "Pending"}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col gap-1 text-xs">

                            {/* Quiz Generated */}
                            <span className={`px-2 py-1 rounded-full font-semibold
                              ${m.quizGenerated
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-gray-500/20 text-gray-400"}
                            `}>
                              {m.quizGenerated ? "Quiz Generated" : "No Quiz"}
                            </span>

                            {/* Attempts */}
                            <span className="text-[#AFCBE3]">
                              Attempts: <strong>{m.quizAttempts ?? 0}</strong>
                            </span>

                            {/* Passed / Failed */}
                            {m.quizGenerated && (
                              <span className={`font-semibold
                                ${m.quizPassed ? "text-green-400" : "text-red-400"}
                              `}>
                                {m.quizPassed ? "✓ Passed" : "✗ Not Passed"}
                              </span>
                            )}

                          </div>
                        </td>
                      </tr>

                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

