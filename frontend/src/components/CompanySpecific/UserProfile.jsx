import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase"; // adjust the path
import CompanySidebar from "./CompanySidebar"; // optional, if you want sidebar


export default function UserProfile() {
  const { companyId, deptId, userId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  console.log("URL Params:", { companyId, deptId, userId }); // log params

  useEffect(() => {
    const fetchUser = async () => {
      try {
        console.log("Fetching user from Firestore...");
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

  if (loading) return <p className="text-white p-6">Loading...</p>;
  if (!user) return <p className="text-white p-6">No user found</p>;

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={user.companyName} />

      <div className="flex-1 p-6">
        <button onClick={() => window.history.back()} className="mb-4 text-[#00FFFF]">← Back</button>
        <h1 className="text-3xl font-bold mb-6">{user.name}'s Profile</h1>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="w-40 h-40 rounded-full bg-[#021B36] border-4 border-[#00FFFF] flex items-center justify-center text-6xl font-bold text-[#00FFFF]">
              {user.name.charAt(0).toUpperCase()}
            </div>
          </div>

          <div className="flex-1 bg-[#021B36] p-6 rounded-xl shadow-lg">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-[#00FFFF]">Name</h2>
              <p className="text-white">{user.name}</p>
            </div>

            <div className="mb-4">
              <h2 className="text-xl font-semibold text-[#00FFFF]">Email</h2>
              <p className="text-white">{user.email}</p>
            </div>

            <div className="mb-4">
              <h2 className="text-xl font-semibold text-[#00FFFF]">Phone</h2>
              <p className="text-white">{user.phone}</p>
            </div>

            <div className="mb-4">
              <h2 className="text-xl font-semibold text-[#00FFFF]">Training</h2>
              <p className="text-white">{user.trainingOn || "N/A"}</p>
            </div>

            <div className="mb-4">
              <h2 className="text-xl font-semibold text-[#00FFFF]">Progress</h2>
              <div className="w-full bg-[#00FFFF20] rounded h-4">
                <div
                  className="bg-[#00FFFF] h-4 rounded"
                  style={{ width: `${user.progress || 0}%` }}
                ></div>
              </div>
              <p className="text-right mt-1 text-white">{user.progress || 0}%</p>
            </div>

            <div className="mb-4">
              <h2 className="text-xl font-semibold text-[#00FFFF]">Onboarding Completed</h2>
              <p className="text-white">{user.onboarding?.onboardingCompleted ? "Yes" : "No"}</p>
            </div>

            {user.cvUrl && (
              <a
                href={user.cvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold hover:bg-[#00e5e5] transition inline-block mt-4"
              >
                View CV
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

