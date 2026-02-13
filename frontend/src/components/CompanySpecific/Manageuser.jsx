import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  collectionGroup,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  collection,
} from "firebase/firestore";
import CompanySidebar from "./CompanySidebar";

export default function ManageUser() {
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [filterDept, setFilterDept] = useState("all");
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState("");
  const [departmentsList, setDepartmentsList] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const location = window.history.state?.usr || {};
  const companyId = location.companyId || localStorage.getItem("companyId");
  const companyName =
    location.companyName || localStorage.getItem("companyName");

  useEffect(() => {
    if (companyId) localStorage.setItem("companyId", companyId);
    if (companyName) localStorage.setItem("companyName", companyName);
  }, [companyId, companyName]);

  const fetchUsers = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const usersArr = [];

      // 1. Get all departments
      const departmentsRef = collection(
        db,
        "freshers",
        companyId,
        "departments"
      );

      const deptSnap = await getDocs(departmentsRef);
      let deptIds = deptSnap.docs.map((d) => d.id);
      
      // Fallback: if no departments found via collection, try common department names
      if (deptIds.length === 0) {
        console.log("No departments found via collection, trying known departments...");
        const knownDepts = ["HR", "SOFTWAREDEVELOPMENT", "AI", "ACCOUNTING", "MARKETING", "OPERATIONS", "DATASCIENCE","IT"];
        const existingDepts = [];
        
        for (const deptName of knownDepts) {
          try {
            const usersRef = collection(
              db,
              "freshers",
              companyId,
              "departments",
              deptName,
              "users"
            );
            const snap = await getDocs(usersRef);
            if (!snap.empty) {
              existingDepts.push(deptName);
            }
          } catch (e) {
            // Skip if error
          }
        }
        deptIds = existingDepts;
      }
      
      setDepartmentsList(deptIds);

      // 2. Loop through each department
      for (const deptName of deptIds) {
        const usersRef = collection(
          db,
          "freshers",
          companyId,
          "departments",
          deptName,
          "users"
        );

        const usersSnap = await getDocs(usersRef);

        usersSnap.forEach((u) => {
          const data = u.data();
          usersArr.push({
            id: u.id,
            deptName,
            status: data.status || "active",
            trainingStatus: data.trainingStatus || "ongoing",
            ...data,
          });
        });
      }

      setUsers(usersArr);
    } catch (err) {
      console.error("❌ Fetch users failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [companyId]);

  const handleUpdate = async () => {
    const { id, deptName, name, phone } = editingUser;
    if (!id || !deptName) return;

    try {
      await updateDoc(
        doc(db, "freshers", companyId, "departments", deptName, "users", id),
        { name, phone }
      );
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      console.error("❌ Update failed:", err);
    }
  };

  const handleDelete = async (user) => {
    if (!user?.email || !user?.id || !user?.deptName) return;

    if (!window.confirm(`Delete ${user.name}?`)) return;

    try {
      setDeletingUserId(user.id);
      setDeleteSuccessMsg("");
      await fetch(
        `http://localhost:5000/api/company/users/${encodeURIComponent(
          user.email
        )}`,
        { method: "DELETE" }
      );

      await deleteDoc(
        doc(
          db,
          "freshers",
          companyId,
          "departments",
          user.deptName,
          "users",
          user.id
        )
      );

      fetchUsers();
      setDeleteSuccessMsg(`✅ ${user.name} deleted successfully`);
      setTimeout(() => setDeleteSuccessMsg(""), 3000);
    } catch (err) {
      console.error("❌ Delete failed:", err);
      alert("❌ Failed to delete user. Please try again.");
    } finally {
      setDeletingUserId(null);
    }
  };

  const filteredUsers = filterDept === "all"
    ? users
    : users.filter((u) => u.deptName === filterDept);

  const sortedUsers = filteredUsers.sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );

  const displayedCount = sortedUsers.length;

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="flex-1 p-8">
        <div>
          <h1 className="text-3xl font-bold text-[#00FFFF]">
            Manage Users <span className="text-3xl font-bold text-[#00FFFF]">({displayedCount})</span>
          </h1>
          <p className="text-[#AFCBE3] mt-1">
            {companyName} — Manage and view your company users here.
          </p>
          <br />

          {deleteSuccessMsg && (
            <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded text-green-400">
              {deleteSuccessMsg}
            </div>
          )}

          {/* Filter */}
          <div className="mb-6 flex items-center gap-3">
            <label className="text-[#AFCBE3] font-semibold">Filter by Department:</label>
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="px-4 py-2 bg-[#021B36] border border-[#00FFFF]/50 text-[#00FFFF] rounded font-semibold hover:border-[#00FFFF] transition"
            >
              <option value="all">All Departments</option>
              {departmentsList.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="p-8 text-center text-[#AFCBE3]">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-[#AFCBE3] bg-red-900/20 border border-red-500/30 rounded">
              <p className="text-red-400 font-semibold">No users found for this company.</p>
            </div>
          ) : sortedUsers.length === 0 ? (
            <div className="p-8 text-center text-[#AFCBE3]">
              No users found for department: <strong>{filterDept}</strong>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-cyan-400/20 uppercase text-cyan-300">
                    <th className="py-4 px-5 text-center">#</th>
                    <th className="py-4 px-5 text-center">Name</th>
                    <th className="py-4 px-5 text-center">Phone</th>
                    <th className="py-4 px-5 text-center">Department</th>
                    <th className="py-4 px-5 text-center">Status</th>
                    <th className="py-4 px-5 text-center">Training</th>
                    <th className="py-4 px-5 text-center">Progress</th>
                    <th className="py-4 px-5 text-center">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedUsers.map((u, i) => (
                    <tr
                      key={u.id}
                      className={`border-b border-cyan-400/10 hover:bg-cyan-400/10 ${
                        u.status === "active" ? "bg-green-900/20" : ""
                      }`}
                    >
                      <td className="py-3 px-5">{i + 1}</td>
                      <td className="py-3 px-5 font-medium text-center">{u.name}</td>
                      <td className="py-3 px-5 text-center">{u.phone || "—"}</td>
                      <td className="py-3 px-5 text-center">
                        <span className="px-3 py-1 rounded-full bg-cyan-400/20">
                          {u.deptName}
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

                      <td className="py-3 px-5 text-center">
                        <button
                          onClick={() =>
                            navigate(`/progress-details/${companyId}/${encodeURIComponent(u.deptName || "unknown")}/${u.id}`, {
                              state: {
                                userId: u.id,
                                userName: u.name,
                                userProgress: u.progress || 0,
                                companyId,
                                companyName,
                                deptName: u.deptName,
                              },
                            })
                          }
                          className={`px-3 py-1 rounded text-xs font-semibold hover:opacity-80 transition ${
                            u.progress >= 100
                              ? "bg-teal-400 text-black"
                              : "bg-teal-400/20 text-teal-300"
                          }`}
                        >
                          {u.progress >= 100
                            ? "Completed"
                            : `${u.progress || 0}%`}
                        </button>
                      </td>

                      <td className="py-3 px-5">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => setEditingUser(u)}
                            className="px-3 py-1 bg-yellow-400 text-black rounded border border-yellow-500 hover:opacity-80"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={deletingUserId === u.id}
                            className={`px-3 py-1 rounded border transition
                              ${
                                deletingUserId === u.id
                                  ? "bg-gray-500 cursor-not-allowed border-gray-600"
                                  : "bg-red-600 border-red-700 hover:opacity-80"
                              }
                            `}
                          >
                            {deletingUserId === u.id ? "Deleting..." : "Delete"}
                          </button>
                          <button
                            onClick={() =>
                              navigate(`/user-profile/${companyId}/${u.deptName}/${u.id}`)
                            }
                            className="px-3 py-1 bg-[#00FFFF] text-[#031C3A] rounded border border-cyan-400"
                          >
                            View Profile
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-[#021B36] p-6 rounded-xl w-[420px] border border-teal-400/30">
            <h3 className="text-2xl text-teal-400 mb-4">Edit User</h3>

            <input
              className="w-full mb-3 p-2 bg-transparent border border-teal-400/40 rounded"
              value={editingUser.name}
              onChange={(e) =>
                setEditingUser({ ...editingUser, name: e.target.value })
              }
            />

            <input
              className="w-full mb-4 p-2 bg-transparent border border-teal-400/40 rounded"
              value={editingUser.phone || ""}
              onChange={(e) =>
                setEditingUser({ ...editingUser, phone: e.target.value })
              }
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 bg-gray-600 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-teal-400 text-black rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
