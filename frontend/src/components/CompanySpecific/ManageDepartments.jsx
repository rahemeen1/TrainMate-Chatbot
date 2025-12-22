import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, useLocation } from "react-router-dom";

export default function ManageDepartments() {
  const navigate = useNavigate();
  const location = useLocation();

  // 🔐 companyId ko state me rakhen (StrictMode safe)
  const [companyId, setCompanyId] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔹 companyId load (state OR localStorage)
  useEffect(() => {
    const id =
      location?.state?.companyId || localStorage.getItem("companyId");
    const name =
      location?.state?.companyName || localStorage.getItem("companyName");

    setCompanyId(id);
    setCompanyName(name || "Company");
  }, [location]);

  // 🔹 departments fetch
  useEffect(() => {
    if (!companyId) return; // ⛔ wait until available

    const fetchDepartments = async () => {
      try {
        setLoading(true);

        const deptRef = collection(
          db,
          "companies",
          companyId,
          "departments"
        );

        const snapshot = await getDocs(deptRef);

        const deptData = await Promise.all(
          snapshot.docs.map(async (deptDoc) => {
            const usersRef = collection(
              db,
              "companies",
              companyId,
              "departments",
              deptDoc.id,
              "users"
            );

            const usersSnap = await getDocs(usersRef);

            return {
              id: deptDoc.id,
              name: deptDoc.data().name,
              usersCount: usersSnap.size,
            };
          })
        );

        setDepartments(deptData);
      } catch (err) {
        console.error("Error fetching departments:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDepartments();
  }, [companyId]);

  // 🔹 loading / safety states
  if (!companyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#031C3A] text-white">
        Loading company...
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#031C3A] text-white">
        Loading departments...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#031C3A] text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#00FFFF]">
              Manage Departments
            </h1>
            <p className="text-[#AFCBE3] mt-1">
              {companyName} — Departments Overview
            </p>
          </div>

          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-[#021B36] rounded-lg hover:bg-[#032A4A]"
          >
            ← Back
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-[#00FFFF30]">
          <table className="w-full">
            <thead>
              <tr className="bg-[#021B36] text-[#00FFFF]">
                <th className="p-4 text-left">Department</th>
                <th className="p-4 text-center">Freshers</th>
                <th className="p-4 text-center">Action</th>
              </tr>
            </thead>

            <tbody>
              {departments.length === 0 ? (
                <tr>
                  <td
                    colSpan="3"
                    className="p-6 text-center text-[#AFCBE3]"
                  >
                    No departments found
                  </td>
                </tr>
              ) : (
                departments.map((dept) => (
                  <tr
                    key={dept.id}
                    className="border-t border-[#00FFFF20] hover:bg-[#00FFFF10]"
                  >
                    <td className="p-4 font-medium">{dept.name}</td>
                    <td className="p-4 text-center">{dept.usersCount}</td>
                    <td className="p-4 text-center">
                      <button
                        className="text-[#00FFFF] underline"
                        onClick={() =>
                          navigate(`/departments/${dept.id}`, {
                            state: {
                              companyId,
                              companyName,
                              deptId: dept.id,
                              deptName: dept.name,
                            },
                          })
                        }
                      >
                        View Details →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
