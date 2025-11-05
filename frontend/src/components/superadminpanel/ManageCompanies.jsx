import { useState, useEffect } from "react";

export default function ManageCompanies() {
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  // ✅ Fetch companies
  const fetchCompanies = async () => {
  console.log("✅ Fetching companies...");
  try {
    const res = await fetch("http://localhost:5000/companies");
    const data = await res.json();
    console.log("✅ Received companies from backend:", data);
    setCompanies(data); // ✅ FIXED
  } catch (err) {
    console.error("❌ Error fetching companies:", err);
  }
};

  useEffect(() => {
    fetchCompanies();
  }, []);

  // ✅ Toggle Status
  const changeStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";

    console.log("🔁 Toggle Request:");
    console.log("Company ID:", id);
    console.log("Old Status:", currentStatus);
    console.log("New Status:", newStatus);

    try {
      const res = await fetch(`http://localhost:5000/companies/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      console.log("✅ Toggle Response:", data);

      if (res.ok) {
        console.log("✅ Updating UI state...");
        setCompanies((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
        );
        setMessage("✅ Status updated!");
      } else {
        console.log("❌ Backend returned error:", data);
        setMessage("❌ Update failed");
      }
    } catch (err) {
      console.error("❌ Toggle error:", err);
    }
  };

  // ✅ Update company (Edit)
  const updateCompany = async () => {
    console.log("✏️ Editing company:", selected);

    try {
      const res = await fetch(
        `http://localhost:5000/companies/${selected.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: selected.email,
            phone: selected.phone,
            address: selected.address,
          }),
        }
      );

      const data = await res.json();
      console.log("✅ Edit Response from backend:", data);

      if (res.ok) {
        console.log("✅ Updating UI state with edited company...");
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === selected.id
              ? {
                  ...c,
                  email: selected.email,
                  phone: selected.phone,
                  address: selected.address,
                }
              : c
          )
        );
        setMessage("✅ Company updated!");
        setSelected(null);
      } else {
        setMessage("❌ Edit failed");
        console.error("❌ Backend edit error:", data);
      }
    } catch (err) {
      console.error("❌ Edit error:", err);
    }
  };

  // ✅ Delete Company
  const deleteCompany = async (id) => {
    console.log("🗑 Deleting company:", id);

    if (!window.confirm("Delete this company?")) return;

    try {
      const res = await fetch(`http://localhost:5000/companies/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      console.log("✅ Delete Response:", data);

      if (res.ok) {
        setCompanies((prev) => prev.filter((c) => c.id !== id));
        setMessage("✅ Company deleted!");
      }
    } catch (err) {
      console.error("❌ Delete error:", err);
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
            <th className="p-2">Company ID</th>
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
              <td className="p-2">{c.companyIdNum}</td>
              <td className="p-2">{c.name}</td>
              <td className="p-2">{c.email}</td>
              <td className="p-2">{c.phone || "-"}</td>

              <td className="p-2">
                <span
                  className={`px-2 py-1 rounded ${
                    c.status === "active" ? "bg-green-600" : "bg-red-600"
                  }`}
                >
                  {c.status}
                </span>
              </td>

              <td className="p-2 flex gap-2">
                <button
                  onClick={() => {
                    console.log("⚡ Toggle button clicked for:", c.id);
                    changeStatus(c.id, c.status);
                  }}
                  className="px-2 py-1 bg-yellow-400 text-black rounded"
                >
                  Toggle
                </button>

                <button
                  onClick={() => {
                    console.log("✏️ Edit button clicked:", c);
                    setSelected(c);
                  }}
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

      {/* ✅ EDIT POPUP */}
      {selected && (
        <div className="fixed top-0 left-0 w-full h-full bg-[#00000080] flex justify-center items-center">
          <div className="bg-[#031C3A] p-6 rounded-xl border border-[#00FFFF50] w-96">
            <h3 className="text-[#00FFFF] text-lg font-semibold mb-3">
              Edit Company: {selected.name}
            </h3>

            <input
              type="email"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2"
              value={selected.email}
              onChange={(e) => {
                console.log("✏️ Email updated:", e.target.value);
                setSelected({ ...selected, email: e.target.value });
              }}
            />

            <input
              type="text"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2"
              value={selected.phone}
              onChange={(e) => {
                console.log("📞 Phone updated:", e.target.value);
                setSelected({ ...selected, phone: e.target.value });
              }}
            />

            <input
              type="text"
              className="w-full p-2 bg-[#021B36] text-white rounded mb-2"
              value={selected.address}
              onChange={(e) => {
                console.log("📍 Address updated:", e.target.value);
                setSelected({ ...selected, address: e.target.value });
              }}
            />

            <div className="flex gap-2 mt-3">
              <button
                onClick={updateCompany}
                className="px-3 py-1 bg-green-500 rounded text-black"
              >
                Save
              </button>

              <button
                onClick={() => {
                  console.log("❌ Closing edit popup");
                  setSelected(null);
                }}
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
