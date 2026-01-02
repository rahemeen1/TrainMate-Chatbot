import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { useLocation } from "react-router-dom";
import CompanySidebar from "./CompanySidebar";

export default function ActiveUsers() {
  const [users, setUsers] = useState([]);

  const location = useLocation();
  const companyId =
    location?.state?.companyId || localStorage.getItem("companyId");
  const companyName =
    location?.state?.companyName || localStorage.getItem("companyName");

  const departments = ["IT", "HR", "Finance", "Marketing"];

  const fetchUsers = async () => {
    const usersArr = [];

    for (const dept of departments) {
      const usersRef = collection(
        db,
        "freshers",
        companyId,
        "departments",
        dept,
        "users"
      );

      const snap = await getDocs(usersRef);

      snap.forEach(d => {
        const data = d.data();
        usersArr.push({
          id: d.id,
          dept,
          status: data.status || "active",
          trainingStatus: data.trainingStatus || "ongoing",
          ...data,
        });
      });
    }

    setUsers(usersArr);
  };

  useEffect(() => {
    if (companyId) fetchUsers();
  }, [companyId]);

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="flex-1 p-8">
        
           <h2 className="text-3xl font-bold text-[#00FFFF]">
              Active Users
            </h2>
            <br></br>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-cyan-400/20 uppercase text-cyan-300">
                  <th className="py-4 px-5 text-left">#</th>
                  <th className="py-4 px-5 text-left">Name</th>
                  <th className="py-4 px-5 text-left">Phone</th>
                  <th className="py-4 px-5 text-left">Department</th>
                  <th className="py-4 px-5 text-center">Status</th>
                  <th className="py-4 px-5 text-center">Training</th>
                </tr>
              </thead>

              <tbody>
                {users.map((u, i) => (
                  <tr
                    key={u.id}
                    className={`border-b border-cyan-400/10 hover:bg-cyan-400/10 ${
                      u.status === "active" ? "bg-green-900/20" : ""
                    }`}
                  >
                    <td className="py-3 px-5">{i + 1}</td>
                    <td className="py-3 px-5 font-medium">{u.name}</td>
                    <td className="py-3 px-5">{u.phone || "—"}</td>

                    <td className="py-3 px-5">
                      <span className="px-3 py-1 rounded-full bg-cyan-400/20">
                        {u.dept}
                      </span>
                    </td>

                    <td className="py-3 px-5 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          u.status === "active"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>

                    <td className="py-3 px-5 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          u.trainingStatus === "completed"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {u.trainingStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
       
      </div>
    </div>
  );
}
