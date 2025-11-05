import { useEffect, useState } from "react";

export default function ViewCompanies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCompanies = async () => {
    try {
      console.log("✅ Fetching companies...");
      const res = await fetch("http://localhost:5000/companies");
      const data = await res.json();
      console.log("✅ Backend response:", data);

      // ✅ FIX: backend sends array directly
      setCompanies(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Error fetching companies:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // ✅ Firestore timestamp safe formatter
  const formatDate = (ts) => {
    if (!ts) return "—";
    const seconds = ts.seconds || ts._seconds;
    return seconds ? new Date(seconds * 1000).toLocaleDateString("en-GB") : "—";
  };

  return (
    <div className="bg-[#031C3A]/50 border border-[#00FFFF30] p-6 rounded-xl shadow-lg w-full">
      <h2 className="text-xl text-[#00FFFF] font-semibold mb-4">Company List</h2>

      {loading ? (
        <p className="text-white">Loading...</p>
      ) : companies.length === 0 ? (
        <p className="text-white">No companies found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-white border border-[#00FFFF30] rounded-lg">
            <thead>
              <tr className="bg-[#021B36] text-[#00FFFF]">
                <th className="p-2 border border-[#00FFFF30]">#</th>
                <th className="p-2 border border-[#00FFFF30]">Company ID</th>
                <th className="p-2 border border-[#00FFFF30]">Name</th>
                <th className="p-2 border border-[#00FFFF30]">Email</th>
                <th className="p-2 border border-[#00FFFF30]">Phone</th>
                <th className="p-2 border border-[#00FFFF30]">Address</th>
                <th className="p-2 border border-[#00FFFF30]">Created At</th>
                <th className="p-2 border border-[#00FFFF30]">Status</th>
              </tr>
            </thead>

            <tbody>
              {companies.map((c, index) => (
                <tr key={c.id} className="hover:bg-[#00FFFF10] transition-all">
                  <td className="p-2 border border-[#00FFFF30] text-center">
                    {index + 1}
                  </td>
                  <td className="p-2 border border-[#00FFFF30]">{c.companyId}</td>
                  <td className="p-2 border border-[#00FFFF30]">{c.name}</td>
                  <td className="p-2 border border-[#00FFFF30]">{c.email}</td>
                  <td className="p-2 border border-[#00FFFF30]">{c.phone}</td>
                  <td className="p-2 border border-[#00FFFF30]">{c.address}</td>
                  <td className="p-2 border border-[#00FFFF30]">
                    {formatDate(c.createdAt)}
                  </td>
                  <td className="p-2 border border-[#00FFFF30]">
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        c.status === "active" ? "bg-green-600" : "bg-red-600"
                      }`}
                    >
                      {c.status || "unknown"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
