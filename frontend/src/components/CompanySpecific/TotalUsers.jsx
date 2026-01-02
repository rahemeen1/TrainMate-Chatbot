import React, { useEffect, useState } from "react";
import { db } from "../../firebase";
import { useLocation } from "react-router-dom";
import CompanySidebar from "./CompanySidebar";
import { collectionGroup, getDocs, query, where } from "firebase/firestore";

export default function TotalUsers() {
  const [users, setUsers] = useState([]);
  const location = useLocation();

  const companyId =
    location?.state?.companyId || localStorage.getItem("companyId");
  const companyName =
    location?.state?.companyName || localStorage.getItem("companyName");

 

useEffect(() => {
  if (!companyId) return;

  const fetchUsers = async () => {
    try {
      const usersArr = [];
      const q = query(
        collectionGroup(db, "users"),
        where("companyId", "==", companyId)
      );

      const snap = await getDocs(q);

      snap.forEach(doc => {
  const data = doc.data();

  usersArr.push({
    name: data.name || "N/A",
    dept: data.deptName || "N/A",
    trainingStatus: data.trainingStatus || "ongoing",
  });
});

      setUsers(usersArr);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  fetchUsers();
}, [companyId]);


  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="flex-1 p-6">
        <h2 className="text-3xl font-bold text-[#00FFFF] mb-3">
            Total Users
          </h2>

          <p className="text-lg text-gray-300 mb-6">
            Total Users Found:{" "}
            <span className="font-semibold text-[#00FFFF]">
              {users.length}
            </span>
          </p>

          <div className="overflow-x-auto flex justify-center">

            <table className="min-w-full border border-[#00FFFF40] rounded-md bg-[#021B36]/40">
              <thead>
                <tr className="bg-[#00FFFF20] text-[#00FFFF] text-sm uppercase">
                  <th className="py-3 px-4 text-center">#</th>
                  <th className="py-3 px-4 text-center">Name</th>
                  <th className="py-3 px-4 text-center">Department</th>
                  <th className="py-3 px-4 text-center">Training Status</th>

                </tr>
              </thead>

              <tbody>
                {users.length ? (
                  users.map((u, i) => (
                    <tr
                      key={i}
                      className="hover:bg-[#00FFFF15] transition-all text-sm"
                    >
                      <td className="py-2 px-4 text-center">{i + 1}</td>
                      <td className="py-2 px-4 text-center">{u.name}</td>
                      <td className="py-2 px-4 text-center">{u.dept}</td>
                      <td className="py-2 px-4 text-center capitalize">
  <span
    className={`px-2 py-1 rounded text-xs ${
      u.trainingStatus === "completed"
        ? "bg-green-600/30 text-green-400"
        : "bg-yellow-600/30 text-yellow-400"
    }`}
  >
    {u.trainingStatus}
  </span>
</td>

                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="text-center py-4 text-gray-400">
                      No Users Found For This Company
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </div>
    </div>
  );
}
