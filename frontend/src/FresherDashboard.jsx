import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

export default function FresherDashboard() {
  const location = useLocation();
  const userId = location.state?.userId; // must come from login
  const [fresherInfo, setFresherInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const fetchFresherData = async () => {
      setLoading(true);
      try {
        const companiesSnap = await getDocs(collection(db, "companies"));
        let found = null;

        for (const companyDoc of companiesSnap.docs) {
          const companyId = companyDoc.id;
          const companyName = companyDoc.data().name || companyId;

          const departmentsSnap = await getDocs(
            collection(db, "companies", companyId, "departments")
          );

          for (const deptDoc of departmentsSnap.docs) {
            const deptId = deptDoc.id;
            const deptName = deptDoc.data().name;

            const usersSnap = await getDocs(
              collection(db, "companies", companyId, "departments", deptId, "users")
            );

            const userDoc = usersSnap.docs.find(u => u.data().userId === userId);

            if (userDoc) {
              found = {
                companyId,
                companyName,
                deptId,
                deptName,
                trainingOn: userDoc.data().trainingOn,
                userName: userDoc.data().name,
              };
              break;
            }
          }

          if (found) break;
        }

        setFresherInfo(found);
      } catch (err) {
        console.error("Error fetching fresher data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFresherData();
  }, [userId]);

  if (!userId) return <p className="p-4 text-white">No userId provided.</p>;
  if (loading) return <p className="p-4 text-white">Loading your dashboard...</p>;
  if (!fresherInfo) return <p className="p-4 text-white">Fresher record not found.</p>;

  return (
    <div className="min-h-screen bg-[#031C3A] text-white p-6 flex flex-col items-center">
      <h1 className="text-3xl font-bold text-[#00FFFF] mb-4">
        Welcome, {fresherInfo.userName}!
      </h1>

      <div className="bg-[#021B36]/80 p-6 rounded-xl shadow-lg w-full max-w-md space-y-4">
        <p><span className="font-semibold">Company:</span> {fresherInfo.companyName}</p>
        <p><span className="font-semibold">Department:</span> {fresherInfo.deptName}</p>
        <p><span className="font-semibold">Training Assigned:</span> {fresherInfo.trainingOn}</p>
      </div>

      <p className="mt-6 text-[#AFCBE3] text-center">
        Best of luck on your training journey!
      </p>
    </div>
  );
}
