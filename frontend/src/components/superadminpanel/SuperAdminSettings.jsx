import { useEffect, useState } from "react";
import { apiUrl } from "../../services/api";


export default function SuperAdminSettings() {
  const [admins, setAdmins] = useState([]);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editMode, setEditMode] = useState(null); 
  const [editData, setEditData] = useState({ email: "", oldPassword: "", newPassword: "" });

  const getAdmins = async () => {
    try {
      const res = await fetch(apiUrl("/api/superadmins"));
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
    const payload =
      editMode === "email"
        ? { email: editData.email }
        : {
            oldPassword: editData.oldPassword,
            newPassword: editData.newPassword,
          };

    const res = await fetch(apiUrl(`/api/superadmins/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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



  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.18em] uppercase text-[#8EB6D3]">Account Security</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#E8F7FF] mt-1">Super Admin Settings</h2>
            <p className="text-sm text-[#9FC2DA] mt-2">
              Manage super admin email and password details with secure update controls.
            </p>
          </div>

          <div className="text-sm px-3 py-1.5 rounded-lg bg-[#021B36] border border-[#00FFFF30] text-[#AFCBE3]">
            Super Admins: {admins.length}
          </div>
        </div>
      </div>

      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-4 sm:p-6 space-y-4">
        {message && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              message.toLowerCase().includes("error") || message.startsWith("❌")
                ? "bg-red-500/15 text-red-300 border border-red-500/30"
                : "bg-green-500/15 text-green-300 border border-green-500/30"
            }`}
          >
            {message}
          </p>
        )}

        <div className="hidden md:block overflow-x-auto rounded-lg border border-[#00FFFF30]">
          <table className="w-full text-left text-white text-sm">
            <thead>
              <tr className="bg-[#021B36] text-[#00FFFF]">
                <th className="p-2 border border-[#00FFFF30]">ID</th>
                <th className="p-2 border border-[#00FFFF30]">Email</th>
                <th className="p-2 border border-[#00FFFF30]">Password</th>
                <th className="p-2 border border-[#00FFFF30]">Action</th>
              </tr>
            </thead>
            <tbody>
              {admins.length > 0 ? (
                admins.map((a) => (
                  <tr key={a.id} className="hover:bg-[#021B36]/50">
                    <td className="p-2 border border-[#00FFFF30]">{a.adminId || a.id}</td>
                    <td className="p-2 border border-[#00FFFF30]">
                      {editingId === a.id && editMode === "email" ? (
                        <input
                          type="email"
                          className="w-full p-2 rounded bg-[#021B36] border border-[#00FFFF20] text-white"
                          value={editData.email}
                          onChange={(e) =>
                            setEditData({ ...editData, email: e.target.value })
                          }
                        />
                      ) : (
                        a.email
                      )}
                    </td>
                    <td className="p-2 border border-[#00FFFF30]">
                      {editingId === a.id && editMode === "password" ? (
                        <div className="space-y-2">
                          <input
                            type="password"
                            className="w-full p-2 rounded bg-[#021B36] border border-[#00FFFF20] text-white"
                            placeholder="Enter old password"
                            value={editData.oldPassword}
                            onChange={(e) =>
                              setEditData({ ...editData, oldPassword: e.target.value })
                            }
                          />
                          <input
                            type="password"
                            className="w-full p-2 rounded bg-[#021B36] border border-[#00FFFF20] text-white"
                            placeholder="Enter new password"
                            value={editData.newPassword}
                            onChange={(e) =>
                              setEditData({ ...editData, newPassword: e.target.value })
                            }
                          />
                        </div>
                      ) : (
                        "••••••••"
                      )}
                    </td>
                    <td className="p-2 border border-[#00FFFF30]">
                      <div className="flex flex-wrap gap-2">
                        {editingId === a.id ? (
                          <>
                            {!editMode && (
                              <>
                                <button
                                  onClick={() => setEditMode("email")}
                                  className="bg-blue-500 px-3 py-1.5 rounded hover:bg-blue-600 text-sm text-black font-medium"
                                >
                                  Edit Email
                                </button>
                                <button
                                  onClick={() => setEditMode("password")}
                                  className="bg-yellow-500 px-3 py-1.5 rounded hover:bg-yellow-600 text-sm text-black font-medium"
                                >
                                  Edit Password
                                </button>
                              </>
                            )}
                            {editMode && (
                              <>
                                <button
                                  onClick={() => handleSave(a.id)}
                                  className="bg-green-500 px-3 py-1.5 rounded hover:bg-green-600 text-sm text-black font-medium"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancel}
                                  className="bg-gray-500 px-3 py-1.5 rounded hover:bg-gray-600 text-sm text-black font-medium"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={() => handleEdit(a)}
                            className="bg-blue-500 px-3 py-1.5 rounded hover:bg-blue-600 text-sm text-black font-medium"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-3 text-center text-[#AFCBE3]" colSpan="4">
                    No Super Admins found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-3">
          {admins.length > 0 ? (
            admins.map((a) => (
              <div key={a.id} className="rounded-xl border border-[#00FFFF30] bg-[#021B36] p-4 space-y-3">
                <p className="text-xs text-[#8EB6D3]">ID: {a.adminId || a.id}</p>

                <div>
                  <p className="text-xs text-[#8EB6D3] mb-1">Email</p>
                  {editingId === a.id && editMode === "email" ? (
                    <input
                      type="email"
                      className="w-full p-2 rounded bg-[#031C3A] border border-[#00FFFF20] text-white"
                      value={editData.email}
                      onChange={(e) =>
                        setEditData({ ...editData, email: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-sm text-[#E8F7FF]">{a.email}</p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-[#8EB6D3] mb-1">Password</p>
                  {editingId === a.id && editMode === "password" ? (
                    <div className="space-y-2">
                      <input
                        type="password"
                        className="w-full p-2 rounded bg-[#031C3A] border border-[#00FFFF20] text-white"
                        placeholder="Enter old password"
                        value={editData.oldPassword}
                        onChange={(e) =>
                          setEditData({ ...editData, oldPassword: e.target.value })
                        }
                      />
                      <input
                        type="password"
                        className="w-full p-2 rounded bg-[#031C3A] border border-[#00FFFF20] text-white"
                        placeholder="Enter new password"
                        value={editData.newPassword}
                        onChange={(e) =>
                          setEditData({ ...editData, newPassword: e.target.value })
                        }
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-[#E8F7FF]">••••••••</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {editingId === a.id ? (
                    <>
                      {!editMode && (
                        <>
                          <button
                            onClick={() => setEditMode("email")}
                            className="bg-blue-500 px-3 py-1.5 rounded text-xs text-black font-medium"
                          >
                            Edit Email
                          </button>
                          <button
                            onClick={() => setEditMode("password")}
                            className="bg-yellow-500 px-3 py-1.5 rounded text-xs text-black font-medium"
                          >
                            Edit Password
                          </button>
                        </>
                      )}
                      {editMode && (
                        <>
                          <button
                            onClick={() => handleSave(a.id)}
                            className="bg-green-500 px-3 py-1.5 rounded text-xs text-black font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancel}
                            className="bg-gray-500 px-3 py-1.5 rounded text-xs text-black font-medium"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => handleEdit(a)}
                      className="bg-blue-500 px-3 py-1.5 rounded text-xs text-black font-medium"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-[#AFCBE3]">No Super Admins found</p>
          )}
        </div>
      </div>
    </div>
  );
}
