import { useState, useEffect } from "react";

export default function NewSuperAdmin() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [message, setMessage] = useState("");
  const [nextId, setNextId] = useState(null); // ✅ store next ID

  // ✅ Fetch next admin ID on component mount
  const fetchNextId = async () => {
    try {
      const res = await fetch("http://localhost:5000/superadmins");
      const data = await res.json();
      const admins = data.admins || [];

      if (admins.length === 0) {
        setNextId(1); // First admin
      } else {
        // Find max adminId
        const maxId = Math.max(...admins.map((a) => a.adminId || 0));
        setNextId(maxId + 1);
      }
    } catch (err) {
      console.error("Error fetching next ID:", err);
      setNextId(null);
    }
  };

  useEffect(() => {
    fetchNextId();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    try {
      const res = await fetch("http://localhost:5000/add-superadmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      setMessage(data.message);

      if (res.ok) {
        setFormData({ email: "", password: "" });
        fetchNextId(); // Refresh next ID
      }
    } catch (err) {
      setMessage("Server error. Try later.");
    }
  };

  return (
    <div className="bg-[#031C3A]/50 border border-[#00FFFF30] p-6 rounded-xl shadow-lg max-w-lg">
      <h2 className="text-xl text-[#00FFFF] font-semibold mb-4">
        Add Super Admin
      </h2>

      {nextId !== null && (
        <p className="text-[#AFCBE3] mb-2">Next Admin ID: {nextId}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          required
          className="w-full p-2 bg-[#021B36]/60 text-white rounded border border-[#00FFFF30]"
          value={formData.email}
          onChange={(e) =>
            setFormData({ ...formData, email: e.target.value })
          }
        />

        <input
          type="password"
          placeholder="Password"
          required
          className="w-full p-2 bg-[#021B36]/60 text-white rounded border border-[#00FFFF30]"
          value={formData.password}
          onChange={(e) =>
            setFormData({ ...formData, password: e.target.value })
          }
        />

        <button className="w-full py-2 bg-[#00FFFF] text-[#02142B] font-semibold rounded hover:bg-[#7FFFD4]">
          Add Super Admin
        </button>
      </form>

      {message && <p className="mt-3 text-sm text-[#AFCBE3]">{message}</p>}
    </div>
  );
}
