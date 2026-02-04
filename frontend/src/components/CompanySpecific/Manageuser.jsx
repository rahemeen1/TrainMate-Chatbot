import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  collectionGroup,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import CompanySidebar from "./CompanySidebar";

export default function ManageUser() {
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [filterDept, setFilterDept] = useState("all");
  const [deletingUserId, setDeletingUserId] = useState(null);
const [deleteSuccessMsg, setDeleteSuccessMsg] = useState("");

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
    try {
      const usersSnap = await getDocs(collectionGroup(db, "users"));
      const allUsers = [];
      usersSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.companyId === companyId) {
          allUsers.push({ id: docSnap.id, ...data });
        }
      });
      setUsers(allUsers);
    } catch (err) {
      console.error("❌ Fetch users failed:", err);
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
       setDeletingUserId(user.id);     // 🔴 start deleting
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
    }
    finally {
    setDeletingUserId(null); 
  }
  };

  const filteredUsers =
    filterDept === "all"
      ? users
      : users.filter((u) => u.deptName === filterDept);

  const departments = ["all", ...new Set(users.map((u) => u.deptName))];

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="flex-1 p-8">
      
          <div>
            <h1 className="text-3xl font-bold text-[#00FFFF]">
              Manage Users
            </h1>
            <p className="text-[#AFCBE3] mt-1">
              {companyName} — Manage your company users here.
            </p>
         <br />

          {/* Filter */}
          <div className="mb-5">
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="bg-[#021B36] border border-teal-400 px-3 py-2 rounded text-white"
            >
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-teal-400/20 text-teal-300 text-left">
                  <th className="p-3 text-center">#</th>
                  <th className="p-3 text-center">Name</th>
                  <th className="p-3 text-center">Phone</th>
                  <th className="p-3 text-center">Department</th>
                  <th className="p-3 text-center">Progress</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.length ? (
                  filteredUsers.map((u, i) => (
                    <tr
                      key={u.id}
                      className="border-b border-white/10 hover:bg-teal-400/10"
                    >
                      <td className="p-3 text-center">{i + 1}</td>
                      <td className="p-3 text-center">{u.name}</td>
                      <td className="p-3 text-center">{u.phone || "—"}</td>
                      <td className="p-3 text-center">{u.deptName || "N/A"}</td>

                      <td className="p-3 text-center">
  <div className="flex items-center justify-center gap-2">
    <span
      className={`px-2 py-1 rounded text-xs font-semibold ${
        u.progress >= 100
          ? "bg-teal-400 text-black"
          : "bg-teal-400/20 text-teal-300"
      }`}
    >
      {u.progress >= 100 ? "Completed" : `${u.progress || 0}%`}
    </span>

    <button
      onClick={() =>
        navigate(
          `/progress-details/${companyId}/${u.deptName}/${u.id}`,
          {
            state: {
              userName: u.name,
              progress: u.progress,
            },
          }
        )
      }
      className="px-2 py-1 text-xs bg-teal-600 hover:bg-teal-500 rounded"
    >
      Details
    </button>
  </div>
</td>


                      <td className="p-3">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => setEditingUser(u)}
                            className="px-3 py-1 bg-yellow-400 text-black rounded hover:opacity-80"
                          >
                            Edit
                          </button>
                         <button
  onClick={() => handleDelete(u)}
  disabled={deletingUserId === u.id}
  className={`px-3 py-1 rounded transition
    ${
      deletingUserId === u.id
        ? "bg-gray-500 cursor-not-allowed"
        : "bg-red-600 hover:opacity-80"
    }
  `}
>
  {deletingUserId === u.id ? "Deleting..." : "Delete"}
</button>

                           <button
                        onClick={() =>
                         
                         navigate(`/user-profile/${companyId}/${u.deptName}/${u.id}`)

                        }
                        className="px-3 py-1 bg-[#00FFFF] text-[#031C3A] rounded"
                      >
                        View Profile
                      </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="6"
                      className="text-center py-6 text-gray-400"
                    >
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
