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
        <div className="flex flex-col items-center gap-4">
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
          <p className="text-base font-medium text-white">Loading company...</p>
        </div>
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
    <div className="flex-1 p-6 md:p-8">
      <div className="max-w-6xl mx-auto">

         <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[#00FFFF]">Manage Departments</h1>
              <p className="text-[#AFCBE3] mt-2 text-sm">
                {companyName} — Department overview and fresher distribution.
              </p>
            </div>

            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 hover:bg-[#00FFFF]/10 text-[#AFCBE3] font-semibold"
            >
              ← Back
            </button>
          </div>
          <br />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-[#00FFFF30] bg-[#021B36]/70 p-4">
            <p className="text-xs uppercase tracking-wide text-[#AFCBE3]">Total Departments</p>
            <p className="text-2xl font-bold text-[#00FFFF] mt-2">{departments.length}</p>
          </div>

          <div className="rounded-xl border border-[#00FFFF30] bg-[#021B36]/70 p-4">
            <p className="text-xs uppercase tracking-wide text-[#AFCBE3]">Total Freshers</p>
            <p className="text-2xl font-bold text-[#00FFFF] mt-2">
              {departments.reduce((sum, dept) => sum + (dept.usersCount || 0), 0)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#00FFFF30] bg-[#021B36]/80">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#031C3A]/80 text-[#00FFFF] border-b border-[#00FFFF30]">
                <th className="px-4 py-3 text-left font-semibold">Department</th>
                <th className="px-4 py-3 text-center font-semibold">Freshers</th>
                <th className="px-4 py-3 text-center font-semibold">Action</th>
              </tr>
            </thead>

            <tbody>
              {departments.length === 0 ? (
                <tr>
                  <td colSpan="3" className="p-8 text-center text-[#AFCBE3]">
                    No departments found yet.
                  </td>
                </tr>
              ) : (
                departments.map((dept) => (
                  <tr
                    key={dept.id}
                    className="border-t border-[#00FFFF20] hover:bg-[#00FFFF10] transition"
                  >
                    <td className="px-4 py-4 font-medium text-white">{(dept.name || "").toUpperCase()}</td>
                    <td className="px-4 py-4 text-center text-[#E8F7FF]">{dept.usersCount}</td>
                    <td className="px-4 py-4 text-center">
                      <button
                        className="px-3 py-1.5 rounded-lg border border-[#00FFFF30] text-[#00FFFF] font-semibold hover:bg-[#00FFFF]/10"
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
                        View Details
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
