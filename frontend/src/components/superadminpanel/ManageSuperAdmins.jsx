import { useEffect, useState } from "react";

export default function ManageSuperAdmins() {
  const [admins, setAdmins] = useState([]);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editMode, setEditMode] = useState(null); // "email" or "password"
  const [editData, setEditData] = useState({ email: "", oldPassword: "", newPassword: "" });

  const getAdmins = async () => {
    try {
      const res = await fetch("http://localhost:5000/superadmins");
      const data = await res.json();
      setAdmins(data.admins || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    getAdmins();
  }, []);

  // Start editing and choose mode
  const handleEdit = (admin) => {
    setEditingId(admin.id);
    setEditMode(null); // reset choice
    setEditData({ email: admin.email, oldPassword: "", newPassword: "" });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditMode(null);
    setEditData({ email: "", oldPassword: "", newPassword: "" });
  };

  const handleSave = async (id) => {
    try {
      const res = await fetch(`http://localhost:5000/superadmins/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      const data = await res.json();
      setMessage(data.message);
      if (res.ok) {
        setEditingId(null);
        setEditMode(null);
        getAdmins();
      }
    } catch (err) {
      console.error(err);
      setMessage("Server error. Try later.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this admin?")) return;
    try {
      const res = await fetch(`http://localhost:5000/superadmins/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      setMessage(data.message);
      getAdmins();
    } catch (err) {
      console.error(err);
      setMessage("Server error. Try later.");
    }
  };

  return (
    <div className="bg-[#031C3A]/50 border border-[#00FFFF30] p-6 rounded-xl shadow-lg max-w-4xl">
      <h2 className="text-xl text-[#00FFFF] font-semibold mb-4">
        Manage Super Admins
      </h2>

      <table className="w-full text-left text-white border border-[#00FFFF30]">
        <thead>
          <tr className="bg-[#021B36]">
            <th className="p-2 border-b border-[#00FFFF30]">ID</th>
            <th className="p-2 border-b border-[#00FFFF30]">Email</th>
            <th className="p-2 border-b border-[#00FFFF30]">Password</th>
            <th className="p-2 border-b border-[#00FFFF30]">Action</th>
          </tr>
        </thead>
        <tbody>
          {admins.length > 0 ? (
            admins.map((a) => (
              <tr key={a.id} className="hover:bg-[#021B36]/50">
                <td className="p-2 border-b border-[#00FFFF30]">{a.adminId || a.id}</td>
                <td className="p-2 border-b border-[#00FFFF30]">
                  {editingId === a.id && editMode === "email" ? (
                    <input
                      type="email"
                      className="p-1 rounded text-black"
                      value={editData.email}
                      onChange={(e) =>
                        setEditData({ ...editData, email: e.target.value })
                      }
                    />
                  ) : (
                    a.email
                  )}
                </td>
                <td className="p-2 border-b border-[#00FFFF30]">
                  {editingId === a.id && editMode === "password" ? (
                    <>
                      <input
                        type="password"
                        className="p-1 rounded text-black mb-1"
                        placeholder="Enter old password"
                        value={editData.oldPassword}
                        onChange={(e) =>
                          setEditData({ ...editData, oldPassword: e.target.value })
                        }
                      />
                      <input
                        type="password"
                        className="p-1 rounded text-black"
                        placeholder="Enter new password"
                        value={editData.newPassword}
                        onChange={(e) =>
                          setEditData({ ...editData, newPassword: e.target.value })
                        }
                      />
                    </>
                  ) : (
                    "••••••••"
                  )}
                </td>
                <td className="p-2 border-b border-[#00FFFF30] space-x-2">
                  {editingId === a.id ? (
                    <>
                      {!editMode && (
                        <>
                          <button
                            onClick={() => setEditMode("email")}
                            className="bg-blue-500 px-3 py-1 rounded hover:bg-blue-600 text-sm"
                          >
                            Edit Email
                          </button>
                          <button
                            onClick={() => setEditMode("password")}
                            className="bg-yellow-500 px-3 py-1 rounded hover:bg-yellow-600 text-sm"
                          >
                            Edit Password
                          </button>
                        </>
                      )}
                      {editMode && (
                        <>
                          <button
                            onClick={() => handleSave(a.id)}
                            className="bg-green-500 px-3 py-1 rounded hover:bg-green-600 text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancel}
                            className="bg-gray-500 px-3 py-1 rounded hover:bg-gray-600 text-sm"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(a)}
                        className="bg-blue-500 px-3 py-1 rounded hover:bg-blue-600 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="bg-red-500 px-3 py-1 rounded hover:bg-red-600 text-sm"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="p-3 text-center" colSpan="4">
                No Super Admins found
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {message && <p className="mt-3 text-[#AFCBE3]">{message}</p>}
    </div>
  );
}
