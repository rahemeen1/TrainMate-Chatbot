import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "./firebase";

export default function FresherDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, companyId, deptId } = location.state || {};
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !companyId || !deptId) {
      console.error("❌ Missing userId, companyId, or deptId");
      setLoading(false);
      return;
    }

    const fetchUserData = async () => {
      try {
        console.log("🔍 Fetching user document for:", userId);

        const userDocRef = doc(db, "companies", companyId, "departments", deptId, "users", userId);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          console.log("✅ User data found:", data);
          setInfo({
            name: data.name,
            email: data.email,
            phone: data.phone,
            trainingOn: data.trainingOn,
            progress: data.progress,
            company: companyId,
            department: deptId,
          });
        } else {
          console.warn("❌ User document does not exist in Firestore");
        }
      } catch (err) {
        console.error("🔥 Error fetching user data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId, companyId, deptId]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/"); // Redirect to login page
  };

  if (loading) return <p>Loading fresher data...</p>;

  if (!info)
    return <p className="text-red-400">User data not found. Check your credentials.</p>;

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Side Menu always visible */}
      <div className="bg-[#021B36] w-64 p-6 space-y-6">
        <h2 className="text-xl font-bold mb-4">Menu</h2>
        <ul className="space-y-3">
          <li className="hover:text-[#00FFFF] cursor-pointer">Dashboard</li>
          <li className="hover:text-[#00FFFF] cursor-pointer">Training</li>
          <li className="hover:text-[#00FFFF] cursor-pointer">Progress</li>
          <li className="hover:text-red-500 cursor-pointer" onClick={handleLogout}>Logout</li>
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-8">
        <h2 className="text-2xl font-bold mb-4">Welcome, {info.name} 🎉</h2>
        <p><b>Company:</b> {info.company}</p>
        <p><b>Department:</b> {info.department}</p>
        <p><b>Training On:</b> {info.trainingOn}</p>
        <p><b>Email:</b> {info.email}</p>
        <p><b>Phone:</b> {info.phone}</p>
        <p><b>Progress:</b> {info.progress}%</p>
        <p>Best of luck 🚀</p>
      </div>
    </div>
  );
}
