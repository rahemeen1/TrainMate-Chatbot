//manageuser.jsx - Component for company to manage their users (view, edit, delete)
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  collectionGroup,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import CompanySidebar from "./CompanySidebar"; 

const normalizeId = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (["undefined", "null", "nan"].includes(normalized.toLowerCase())) return "";
  return normalized;
};

export default function ManageUser() {
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [filterDept, setFilterDept] = useState("all");
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState("");
  const [departmentsList, setDepartmentsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quotaStatus, setQuotaStatus] = useState(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  const navigate = useNavigate();
  const location = window.history.state?.usr || {};
  const companyId = normalizeId(location.companyId || localStorage.getItem("companyId"));
  const companyName =
    location.companyName || localStorage.getItem("companyName");

  useEffect(() => {
    if (companyId) {
      localStorage.setItem("companyId", companyId);
    } else {
      localStorage.removeItem("companyId");
    }
    if (companyName) localStorage.setItem("companyName", companyName);
  }, [companyId, companyName]);

  const fetchUsers = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const usersQuery = query(
        collectionGroup(db, "users"),
        where("companyId", "==", companyId)
      );
      const usersSnap = await getDocs(usersQuery);

      const usersArr = [];
      const deptSet = new Set();

      usersSnap.forEach((u) => {
        const data = u.data();
        const pathSegments = u.ref.path.split("/");
        const deptFromPath = pathSegments[3] || "Unknown";
        const deptName = data.deptName || data.deptId || deptFromPath;

        deptSet.add(deptName);
        usersArr.push({
          id: u.id,
          deptName,
          status: data.status || "active",
          trainingStatus: data.trainingStatus || "ongoing",
          ...data,
        });
      });

      setDepartmentsList(Array.from(deptSet).sort());
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

  // Fetch quota status
  useEffect(() => {
    const fetchQuota = async () => {
      if (!companyId) return;
      try {
        setQuotaLoading(true);
        const res = await fetch(`http://localhost:5000/api/company/${companyId}/user-quota`);
        if (res.ok) {
          const quotaData = await res.json();
          setQuotaStatus(quotaData);
        } else {
          console.error("Failed to fetch quota status:", res.status);
        }
      } catch (err) {
        console.error("Error fetching quota:", err);
      } finally {
        setQuotaLoading(false);
      }
    };

    fetchQuota();
    // Refetch quota every 30 seconds
    const quotaInterval = setInterval(fetchQuota, 30000);
    return () => clearInterval(quotaInterval);
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
    if (deletingUserId) return;
    if (!user?.email || !user?.id || !user?.deptName) return;

    if (!window.confirm(`Delete ${user.name}?`)) return;

    try {
      setDeletingUserId(user.id);
      setDeleteSuccessMsg("");
      
      const deleteRes = await fetch(
        `http://localhost:5000/api/company/users/${encodeURIComponent(
          user.email
        )}`,
        { method: "DELETE" }
      );

      if (!deleteRes.ok) {
        const errText = await deleteRes.text();
        throw new Error(errText || "Delete failed");
      }

      fetchUsers();
      setDeleteSuccessMsg(`✅ ${user.name} deleted successfully`);
      setTimeout(() => setDeleteSuccessMsg(""), 3000);
      
      // Refetch quota after deletion with delay to allow backend tracking to complete
      setTimeout(async () => {
        try {
          const res = await fetch(`http://localhost:5000/api/company/${companyId}/user-quota`);
          if (res.ok) {
            const quotaData = await res.json();
            setQuotaStatus(quotaData);
          }
        } catch (err) {
          console.error("Failed to refetch quota:", err);
        }
      }, 800);
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
  const isDeletingAnyUser = deletingUserId !== null;

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
  {/* Sidebar (fixed width, no shrink) */}
  <div className="flex-shrink-0">
      <CompanySidebar companyId={companyId} companyName={companyName} />
      </div>
      <div className="flex-1 min-w-0 p-8">
        <div>
          <h1 className="text-3xl font-bold text-[#00FFFF]">
            Manage Users <span className="text-3xl font-bold text-[#00FFFF]">({displayedCount})</span>
          </h1>
          <p className="text-[#AFCBE3] mt-1">
            {companyName} — Manage and view your company users here.
          </p>

          {/* Quota Status */}
          {quotaStatus && (
            <div className="mt-4 p-4 bg-[#021B36] border border-[#00FFFF]/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#00FFFF] font-semibold">{quotaStatus.plan} Plan</p>
                  <p className="text-[#AFCBE3] text-sm mt-1">
                    Active Users: {quotaStatus.currentCount} | Total Added (including deleted): {quotaStatus.totalEverAdded} | Maximum: {quotaStatus.maxAllowed}
                  </p>
                  {quotaStatus.deletedCount > 0 && (
                    <p className="text-[#AFCBE3]/60 text-xs mt-1">
                      ({quotaStatus.deletedCount} deleted users count towards limit)
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="w-32 h-2 bg-[#00FFFF]/20 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${quotaStatus.canAdd ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{width: `${Math.min(100, (quotaStatus.totalEverAdded / quotaStatus.maxAllowed) * 100)}%`}}
                    ></div>
                  </div>
                  <p className="text-xs text-[#AFCBE3] mt-1">
                    {Math.round((quotaStatus.totalEverAdded / quotaStatus.maxAllowed) * 100)}%
                  </p>
                </div>
              </div>
            </div>
          )}
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
              disabled={isDeletingAnyUser}
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
            <div className="overflow-x-auto max-w-full">
            <table className="w-full text-sm border-collapse
                 min-w-[900px]
                 lg:min-w-0">
                <thead>
                  <tr className="bg-cyan-400/20 uppercase text-cyan-300">
                    <th className="py-3 px-3 lg:px-4 text-center">#</th>
                    <th className="py-3 px-3 lg:px-4 text-center">Name</th>
                    <th className="py-3 px-3 lg:px-4 text-center">Phone</th>
                    <th className="py-3 px-3 lg:px-4 text-center">Department</th>
                    <th className="py-3 px-3 lg:px-4 text-center">Status</th>
                    <th className="py-3 px-3 lg:px-4 text-center">Training</th>
                    <th className="py-3 px-3 lg:px-4 text-center">Progress</th>
                    <th className="py-3 px-3 lg:px-4 text-center">Actions</th>
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
                      <td className="py-2 px-3 lg:px-4 text-center whitespace-nowrap">{i + 1}</td>
                      <td className="py-2 px-3 lg:px-4 text-center whitespace-nowrap">{u.name}</td>
                      <td className="py-2 px-3 lg:px-4 text-center whitespace-nowrap">{u.phone || "—"}</td>
                      <td className="py-2 px-3 lg:px-4 text-center whitespace-nowrap">
                        <span className="px-3 py-1 rounded-full bg-cyan-400/20">
                          {u.deptName}
                        </span>
                      </td>

                      <td className="py-2 px-3 lg:px-4 text-center whitespace-nowrap">
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

                      <td className="py-2 px-3 lg:px-4 text-center whitespace-nowrap">
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

                      <td className="py-2 px-3 lg:px-4 text-center whitespace-nowrap">
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
                          disabled={isDeletingAnyUser}
                          className={`px-3 py-1 rounded text-xs font-semibold hover:opacity-80 transition ${
                            u.progress >= 100
                              ? "bg-teal-400 text-black"
                              : "bg-teal-400/20 text-teal-300"
                          } ${isDeletingAnyUser ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          {u.progress >= 100
                            ? "Completed"
                            : `${u.progress || 0}%`}
                        </button>
                      </td>

                      <td className="py-2 px-3 lg:px-4 text-center whitespace-nowrap">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => setEditingUser(u)}
                            disabled={isDeletingAnyUser}
                            className={`px-3 py-1 bg-yellow-400 text-black rounded border border-yellow-500 hover:opacity-80 ${
                              isDeletingAnyUser ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={isDeletingAnyUser}
                            className={`px-3 py-1 rounded border transition
                              ${
                                deletingUserId === u.id
                                  ? "bg-gray-500 cursor-not-allowed border-gray-600"
                                  : isDeletingAnyUser
                                  ? "bg-red-600/60 cursor-not-allowed border-red-700"
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
                            disabled={isDeletingAnyUser}
                            className={`px-3 py-1 bg-[#00FFFF] text-[#031C3A] rounded border border-cyan-400 ${
                              isDeletingAnyUser ? "opacity-60 cursor-not-allowed" : ""
                            }`}
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
                disabled={isDeletingAnyUser}
                className={`px-4 py-2 bg-gray-600 rounded ${
                  isDeletingAnyUser ? "opacity-60 cursor-not-allowed" : ""
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={isDeletingAnyUser}
                className={`px-4 py-2 bg-teal-400 text-black rounded ${
                  isDeletingAnyUser ? "opacity-60 cursor-not-allowed" : ""
                }`}
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
