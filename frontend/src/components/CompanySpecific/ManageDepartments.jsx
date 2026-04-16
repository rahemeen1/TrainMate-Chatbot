import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import CompanyPageLoader from "./CompanyPageLoader";
import CompanyShellLayout from "./CompanyShellLayout";


export default function ManageDepartments() {
  const navigate = useNavigate();
  const location = useLocation();

  // 🔐 companyId ko state me rakhen (StrictMode safe)
  const [companyId, setCompanyId] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const totalFreshers = departments.reduce(
    (sum, dept) => sum + (dept.usersCount || 0),
    0
  );

  const avgFreshersPerDept = departments.length
    ? Math.round(totalFreshers / departments.length)
    : 0;

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
      <CompanyShellLayout companyName={companyName || "Company"} headerLabel="Departments">
          <CompanyPageLoader layout="content" message="Loading company..." />
      </CompanyShellLayout>
    );
  }

  if (loading) {
    return (
      <CompanyShellLayout companyId={companyId} companyName={companyName} headerLabel="Departments">
          <CompanyPageLoader layout="content" message="Loading Department Details..." />
      </CompanyShellLayout>
    );
  }

  return (
    <CompanyShellLayout companyId={companyId} companyName={companyName} headerLabel="Departments">
      <div>
        <div className="company-container space-y-6">
          <section className="company-card p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#AFCBE3]">
                  Department Control Center
                </p>
                <h1 className="company-title mt-2">
                  Manage Departments
                </h1>
                <p className="company-subtitle">
                  {companyName} - Department overview and fresher distribution.
                </p>
              </div>

              <button
                onClick={() => navigate(-1)}
                className="company-outline-btn"
              >
                ← Back
              </button>
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="company-kpi-card">
              <p className="company-kpi-label">Total Departments</p>
              <p className="company-kpi-value">{departments.length}</p>
            </div>

            <div className="company-kpi-card">
              <p className="company-kpi-label">Total Freshers</p>
              <p className="company-kpi-value">{totalFreshers}</p>
            </div>

            <div className="company-kpi-card sm:col-span-2 lg:col-span-1">
              <p className="company-kpi-label">Avg Freshers / Dept</p>
              <p className="company-kpi-value">{avgFreshersPerDept}</p>
            </div>
          </section>

          <section className="company-table-wrap">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="company-table-head-row">
                    <th className="px-4 py-3 text-left font-semibold">Department</th>
                    <th className="px-4 py-3 text-center font-semibold">Freshers</th>
                    <th className="px-4 py-3 text-center font-semibold">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {departments.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="company-empty-state">
                        No departments found yet.
                      </td>
                    </tr>
                  ) : (
                    departments.map((dept, index) => (
                      <tr
                        key={dept.id}
                        className={`company-table-row ${
                          index % 2 === 0 ? "bg-[#041D39]/20" : "bg-transparent"
                        }`}
                      >
                        <td className="px-4 py-4 font-medium text-white">
                          {(dept.name || "").toUpperCase()}
                        </td>
                        <td className="px-4 py-4 text-center text-[#E8F7FF]">
                          {dept.usersCount}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            className="company-outline-btn px-3 py-1.5"
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
          </section>
        </div>
      </div>
    </CompanyShellLayout>
  );

}
