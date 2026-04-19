//ManageCompanies.jsx
import { useState, useEffect } from "react";
import axios from "axios";
import { apiUrl } from "../../services/api";

export default function ManageCompanies() {
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");


  // ✅ Fetch companies from backend
  const fetchCompanies = async () => {
    console.log("Fetching companies...");
    try {
      const res = await axios.get(apiUrl("/api/companies"));
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
    // 🔹 PUT request to backend
    const { data } = await axios.put(
      apiUrl(`/api/companies/${id}/status`),
      { status: newStatus }
    );

    console.log("Toggle response:", data);


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
      const res = await axios.put(apiUrl(`/api/companies/${id}`), {
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
      const res = await axios.delete(apiUrl(`/api/companies/${id}`));
      console.log("Delete response:", res.data);

      setCompanies((prev) => prev.filter((c) => c.id !== id));
      setMessage("✅ Company deleted!");
    } catch (err) {
      console.error("Delete error:", err.response || err);
      setMessage("❌ Delete failed: " + (err.response?.data?.message || err.message));
    }
  };

  const filteredCompanies = companies.filter((company) =>
    filter === "all" ? true : company.status === filter
  );

  const activeCount = companies.filter((company) => company.status === "active").length;
  const suspendedCount = companies.filter((company) => company.status === "suspended").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.18em] uppercase text-[#8EB6D3]">Company Administration</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#E8F7FF] mt-1">Manage Companies</h2>
            <p className="text-sm text-[#9FC2DA] mt-2">
              Update profile details, toggle status, or remove company records.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-[#021B36] border border-[#00FFFF30] text-[#AFCBE3]">
              Total: {companies.length}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-[#021B36] border border-[#00FFFF30] text-green-300">
              Active: {activeCount}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-[#021B36] border border-[#00FFFF30] text-red-300">
              Suspended: {suspendedCount}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-4 sm:p-6 space-y-4">
        {message && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              message.startsWith("✅")
                ? "bg-green-500/15 text-green-300 border border-green-500/30"
                : "bg-red-500/15 text-red-300 border border-red-500/30"
            }`}
          >
            {message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              filter === "all"
                ? "bg-[#00FFFF] text-black border-[#00FFFF]"
                : "bg-[#021B36] text-[#AFCBE3] border-[#00FFFF30]"
            }`}
          >
            All
          </button>

          <button
            onClick={() => setFilter("active")}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              filter === "active"
                ? "bg-green-500 text-black border-green-500"
                : "bg-[#021B36] text-[#AFCBE3] border-[#00FFFF30]"
            }`}
          >
            Active
          </button>

          <button
            onClick={() => setFilter("suspended")}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              filter === "suspended"
                ? "bg-red-500 text-black border-red-500"
                : "bg-[#021B36] text-[#AFCBE3] border-[#00FFFF30]"
            }`}
          >
            Suspended
          </button>
        </div>

        <div className="hidden md:block overflow-x-auto rounded-lg border border-[#00FFFF30]">
          <table className="w-full text-white text-sm">
            <thead className="bg-[#021B36] text-[#00FFFF]">
              <tr>
                <th className="p-2 text-left border border-[#00FFFF30]">Name</th>
                <th className="p-2 text-left border border-[#00FFFF30]">Email</th>
                <th className="p-2 text-left border border-[#00FFFF30]">Phone</th>
                <th className="p-2 text-left border border-[#00FFFF30]">Status</th>
                <th className="p-2 text-left border border-[#00FFFF30]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredCompanies.map((company) => (
                <tr key={company.id} className="border-b border-[#00FFFF30] hover:bg-[#00FFFF10]">
                  <td className="p-2 border border-[#00FFFF30]">{company.name || "-"}</td>
                  <td className="p-2 border border-[#00FFFF30]">{company.email || "-"}</td>
                  <td className="p-2 border border-[#00FFFF30]">{company.phone || "-"}</td>
                  <td className="p-2 border border-[#00FFFF30]">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        company.status === "active" ? "bg-green-600" : "bg-red-600"
                      }`}
                    >
                      {company.status || "-"}
                    </span>
                  </td>
                  <td className="p-2 border border-[#00FFFF30]">
                    <div className="flex gap-2">
                      <button
                        onClick={() => changeStatus(company.id, company.status)}
                        className="px-2.5 py-1 bg-yellow-400 text-black rounded"
                      >
                        Toggle
                      </button>

                      <button
                        onClick={() => setSelected(company)}
                        className="px-2.5 py-1 bg-blue-400 text-black rounded"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deleteCompany(company.id)}
                        className="px-2.5 py-1 bg-red-500 text-black rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-3">
          {filteredCompanies.map((company) => (
            <div key={company.id} className="rounded-xl border border-[#00FFFF30] bg-[#021B36] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#E8F7FF]">{company.name || "-"}</h3>
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    company.status === "active" ? "bg-green-600" : "bg-red-600"
                  }`}
                >
                  {company.status || "-"}
                </span>
              </div>

              <p className="text-xs text-[#AFCBE3]"><span className="text-[#8EB6D3]">Email:</span> {company.email || "-"}</p>
              <p className="text-xs text-[#AFCBE3]"><span className="text-[#8EB6D3]">Phone:</span> {company.phone || "-"}</p>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  onClick={() => changeStatus(company.id, company.status)}
                  className="px-2 py-1 bg-yellow-400 text-black rounded text-xs"
                >
                  Toggle
                </button>

                <button
                  onClick={() => setSelected(company)}
                  className="px-2 py-1 bg-blue-400 text-black rounded text-xs"
                >
                  Edit
                </button>

                <button
                  onClick={() => deleteCompany(company.id)}
                  className="px-2 py-1 bg-red-500 text-black rounded text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ✅ Edit Popup */}
      {selected && (
        <div className="fixed inset-0 bg-[#00000080] flex justify-center items-center p-4 z-50">
          <div className="bg-[#031C3A] p-6 rounded-xl border border-[#00FFFF50] w-full max-w-md">
            <h3 className="text-[#00FFFF] text-lg font-semibold mb-3">
              Edit Company: {selected.name}
            </h3>

            <input
              type="text"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2 border border-[#00FFFF20]"
              value={selected.name}
              onChange={(e) =>
                setSelected({ ...selected, name: e.target.value })
              }
            />

            <input
              type="email"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2 border border-[#00FFFF20]"
              value={selected.email}
              onChange={(e) =>
                setSelected({ ...selected, email: e.target.value })
              }
            />

            <input
              type="text"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2 border border-[#00FFFF20]"
              value={selected.phone}
              onChange={(e) =>
                setSelected({ ...selected, phone: e.target.value })
              }
            />

            <input
              type="text"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2 border border-[#00FFFF20]"
              value={selected.address}
              onChange={(e) =>
                setSelected({ ...selected, address: e.target.value })
              }
            />

            <div className="flex gap-2 mt-3 justify-end">
              <button
                onClick={updateCompany}
                className="px-3 py-1.5 bg-green-500 rounded text-black font-medium"
              >
                Save
              </button>

              <button
                onClick={() => setSelected(null)}
                className="px-3 py-1.5 bg-gray-500 rounded text-black font-medium"
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
