import { useEffect, useState } from "react";

export default function ManageSuperAdmins() {
  const [admins, setAdmins] = useState([]);
  const [message, setMessage] = useState("");

  // ✅ Fetch Data
  const getAdmins = async () => {
    try {
      const response = await fetch("http://localhost:5000/superadmins");
      const data = await response.json();
      setAdmins(data.admins || []);
    } catch (error) {
      console.error("Fetch Error:", error);
    }
  };

  useEffect(() => {
    getAdmins();
  }, []);

  // ✅ Delete Handler
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this admin?")) return;

    try {
      const response = await fetch(
        `http://localhost:5000/superadmins/${id}`,
        { method: "DELETE" }
      );

      const data = await response.json();
      setMessage(data.message);

      // ✅ Refresh list
      getAdmins();
    } catch (error) {
      console.error("Delete Error:", error);
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
            <th className="p-2 border-b border-[#00FFFF30]">Action</th>
          </tr>
        </thead>

        <tbody>
          {admins.length > 0 ? (
            admins.map((a) => (
              <tr key={a.id} className="hover:bg-[#021B36]/50">
                <td className="p-2 border-b border-[#00FFFF30]">{a.id}</td>
                <td className="p-2 border-b border-[#00FFFF30]">{a.email}</td>
                <td className="p-2 border-b border-[#00FFFF30]">
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="bg-red-500 px-3 py-1 rounded hover:bg-red-600 text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="p-3 text-center" colSpan="3">
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
