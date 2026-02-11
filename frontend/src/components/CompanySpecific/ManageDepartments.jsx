import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import CompanySidebar from "./CompanySidebar";


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
    if (!companyId) return; 

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
  "freshers",
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
            Loading Department Details...
          </p>
        </div>
      </div>
    );
  }

  return (
  <div className="flex min-h-screen bg-[#031C3A] text-white">
    
    {/* Sidebar - LEFT */}
    <CompanySidebar
      companyId={companyId}
      companyName={companyName}
    />

    {/* Main Content - RIGHT */}
    <div className="flex-1 p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#00FFFF] ">
              Manage Departments
            </h1>
            <p className="text-[#AFCBE3] mt-1 ">
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
                  <td colSpan="3" className="p-6 text-center text-[#AFCBE3]">
                    No departments found
                  </td>
                </tr>
              ) : (
                departments.map((dept) => (
                  <tr
                    key={dept.id}
                    className="border-t border-[#00FFFF20] hover:bg-[#00FFFF10]"
                  >
                    <td className="p-4 font-medium">{(dept.name || "").toUpperCase()}</td>
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
  </div>
);

}
