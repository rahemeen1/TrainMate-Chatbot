import { useState, useEffect } from "react";
import axios from "axios";

export default function ManageCompanies() {
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  // ✅ Fetch companies from backend
  const fetchCompanies = async () => {
    console.log("Fetching companies...");
    try {
      const res = await axios.get("http://localhost:5000/companies");
      setCompanies(res.data);
      console.log("Companies fetched:", res.data);
    } catch (err) {
      console.error("Error fetching companies:", err);
      setMessage("❌ Failed to fetch companies");
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // ✅ Toggle Status
  const changeStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    console.log(`Toggling status for ${id}: ${currentStatus} -> ${newStatus}`);
    try {
      const res = await axios.put(`http://localhost:5000/companies/${id}/status`, {
        status: newStatus,
      });
      console.log("Toggle response:", res.data);

      setCompanies((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
      );
      setMessage("✅ Status updated!");
    } catch (err) {
      console.error("Toggle error:", err);
      setMessage("❌ Status update failed");
    }
  };

  // ✅ Update Company
  const updateCompany = async () => {
    if (!selected) return;
    const { id, name, email, phone, address } = selected;

    if (!name || !email || !phone || !address) {
      setMessage("❌ All fields are mandatory");
      return;
    }

    console.log("Updating company:", selected);

    try {
      const res = await axios.put(`http://localhost:5000/companies/${id}`, {
        name,
        email,
        phone,
        address,
      });
      console.log("Update response:", res.data);

      setCompanies((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, name, email, phone, address } : c
        )
      );
      setMessage("✅ Company updated!");
      setSelected(null);
    } catch (err) {
      console.error("Edit error:", err.response || err);
      setMessage("❌ Update failed: " + (err.response?.data?.message || err.message));
    }
  };

  // ✅ Delete Company
  const deleteCompany = async (id) => {
    if (!window.confirm("Delete this company?")) return;
    console.log("Deleting company:", id);

    try {
      const res = await axios.delete(`http://localhost:5000/companies/${id}`);
      console.log("Delete response:", res.data);

      setCompanies((prev) => prev.filter((c) => c.id !== id));
      setMessage("✅ Company deleted!");
    } catch (err) {
      console.error("Delete error:", err.response || err);
      setMessage("❌ Delete failed: " + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl text-[#00FFFF] font-bold mb-4">
        Manage Companies
      </h2>

      {message && <p className="text-green-400 mb-3">{message}</p>}

      <table className="w-full text-white border border-[#00FFFF30]">
        <thead className="bg-[#021B36]">
          <tr>
            <th className="p-2">Name</th>
            <th className="p-2">Email</th>
            <th className="p-2">Phone</th>
            <th className="p-2">Status</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>

        <tbody>
          {companies.map((c) => (
            <tr key={c.id} className="border-b border-[#00FFFF30]">
              <td className="p-2">{c.name || "-"}</td>
              <td className="p-2">{c.email || "-"}</td>
              <td className="p-2">{c.phone || "-"}</td>
              <td className="p-2">
                <span
                  className={`px-2 py-1 rounded ${
                    c.status === "active" ? "bg-green-600" : "bg-red-600"
                  }`}
                >
                  {c.status || "-"}
                </span>
              </td>
              <td className="p-2 flex gap-2">
                <button
                  onClick={() => changeStatus(c.id, c.status)}
                  className="px-2 py-1 bg-yellow-400 text-black rounded"
                >
                  Toggle
                </button>

                <button
                  onClick={() => setSelected(c)}
                  className="px-2 py-1 bg-blue-400 text-black rounded"
                >
                  Edit
                </button>

                <button
                  onClick={() => deleteCompany(c.id)}
                  className="px-2 py-1 bg-red-500 text-black rounded"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ✅ Edit Popup */}
      {selected && (
        <div className="fixed top-0 left-0 w-full h-full bg-[#00000080] flex justify-center items-center">
          <div className="bg-[#031C3A] p-6 rounded-xl border border-[#00FFFF50] w-96">
            <h3 className="text-[#00FFFF] text-lg font-semibold mb-3">
              Edit Company: {selected.name}
            </h3>

            <input
              type="text"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2"
              value={selected.name}
              onChange={(e) =>
                setSelected({ ...selected, name: e.target.value })
              }
            />

            <input
              type="email"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2"
              value={selected.email}
              onChange={(e) =>
                setSelected({ ...selected, email: e.target.value })
              }
            />

            <input
              type="text"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2"
              value={selected.phone}
              onChange={(e) =>
                setSelected({ ...selected, phone: e.target.value })
              }
            />

            <input
              type="text"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2"
              value={selected.address}
              onChange={(e) =>
                setSelected({ ...selected, address: e.target.value })
              }
            />

            <div className="flex gap-2 mt-3">
              <button
                onClick={updateCompany}
                className="px-3 py-1 bg-green-500 rounded text-black"
              >
                Save
              </button>

              <button
                onClick={() => setSelected(null)}
                className="px-3 py-1 bg-gray-500 rounded text-black"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
