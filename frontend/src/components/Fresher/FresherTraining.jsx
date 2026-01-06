import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { FresherSideMenu } from "./FresherSideMenu";

export default function FresherTraining() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, companyId, deptId, companyName } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [phases, setPhases] = useState([]);

  useEffect(() => {
    if (!userId || !companyId || !deptId) {
      navigate("/fresher-dashboard");
      return;
    }

    const fetchUser = async () => {
      try {
        // Fetch fresher data dynamically from Firestore
        const userRef = doc(
          db,
          "freshers",
          companyId,
          "departments",
          deptId,
          "users",
          userId
        );
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          alert("Fresher data not found!");
          navigate("/fresher-dashboard");
          return;
        }

        const data = snap.data();
        setUserData(data);
        // Fetch onboarding answers
const answersRef = doc(
  db,
  "companies",
  companyId,
  "onboardingAnswers",
  `${userId}answers` // 👈 same ID you showed
);

const answersSnap = await getDoc(answersRef);

let totalMonths = 1; // default fallback

if (answersSnap.exists()) {
  const answersData = answersSnap.data();

  // Question 1 = training duration (e.g. "3 months")
  const periodStr = answersData[1]; // "3 months"

  if (periodStr) {
    totalMonths = parseInt(periodStr); // → 3
  }
}

        const phaseCount = 3; // divide into 3 phases
       const phaseLength = Math.ceil(totalMonths / phaseCount);


        // Generate roadmap phases dynamically
        const phaseArr = Array.from({ length: phaseCount }, (_, i) => ({
          title: `Phase ${i + 1}`,
           duration: `Month ${i * phaseLength + 1} - ${Math.min(
              (i + 1) * phaseLength,
              totalMonths
            )}`,
            tasks: [
              `Complete module ${i * 3 + 1}`,
              `Complete module ${i * 3 + 2}`,
              `Complete module ${i * 3 + 3}`,
            ],
        }));

        setPhases(phaseArr);
      } catch (err) {
        console.error(err);
        alert("Error fetching fresher data");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, companyId, deptId, navigate]);

  if (loading)
    return <p className="text-white p-10">Loading fresher roadmap...</p>;

  if (!userData) return <p className="text-white p-10">No data available.</p>;

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu
          userId={userId}
          companyId={companyId}
          deptId={deptId}
          companyName={companyName}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10">
        {/* Fresher Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#00FFFF]">
            {userData.name}'s Training Roadmap
          </h1>
          <p className="text-[#AFCBE3] mt-1">
            Department: {userData.deptName} | Level: {userData.onboarding.level} | Expertise:{" "}
            {userData.onboarding.expertise}
          </p>
          {userData.cvUploaded && (
            <a
              href={userData.cvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00FFFF] underline mt-2 inline-block"
            >
              View CV
            </a>
          )}
        </div>

        {/* Roadmap Phases */}
        <div className="space-y-6">
          {phases.map((phase, idx) => (
            <div
              key={idx}
              className="bg-[#021B36]/80 p-6 rounded-xl border border-[#00FFFF30] shadow-md"
            >
              <h2 className="text-xl font-semibold text-[#00FFFF] mb-2">
                {phase.title}
              </h2>

              <p className="text-[#AFCBE3] mb-2">Duration: {phase.duration}</p>
              
              <ul className="list-disc list-inside text-[#AFCBE3] space-y-1">
                {phase.tasks.map((task, i) => (
                  <li key={i}>{task}</li>
                ))}
              </ul>
              <button
            onClick={() =>
              navigate("/roadmap", {
                state: {
                  userId,
                  companyId,
                  deptId,
                  phase: idx + 1,
                },
              })
            }
            className="px-5 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold hover:bg-white"
          >
            View Module Details
          </button>
            </div>
            
          ))}
        </div>

        <p className="text-center text-xs text-[#AFCBE3] mt-10">
          Powered by TrainMate
        </p>
      </div>
    </div>
  );
}
