import { useState } from "react";

export default function AddCompanyForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [createdUser, setCreatedUser] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setCreatedUser(null);

    if (!name || !email) {
      setMessage("Company name and email are required");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/add-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, address }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("✅ Company added successfully!");

        // ✅ username + password received from backend
        setCreatedUser({
          username: data.username,
          password: data.password,
          companyId: data.companyId,
        });

        setName("");
        setEmail("");
        setPhone("");
        setAddress("");
      } else {
        setMessage(`❌ ${data.message}`);
      }
    } catch (err) {
      console.error(err);
      setMessage("❌ Server error");
    }
  };

  return (
    <div className="flex gap-6">
      <div className="bg-[#031C3A]/50 border border-[#00FFFF30] p-6 rounded-xl shadow-lg max-w-lg">
        <h2 className="text-xl text-[#00FFFF] font-semibold mb-4">
          Register New Company
        </h2>

        {message && <p className="mb-3">{message}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            className="w-full p-2 bg-[#021B36]/60 text-white rounded border border-[#00FFFF30]"
            placeholder="Company Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <input
            type="email"
            className="w-full p-2 bg-[#021B36]/60 text-white rounded border border-[#00FFFF30]"
            placeholder="Company Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="text"
            className="w-full p-2 bg-[#021B36]/60 text-white rounded border border-[#00FFFF30]"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />

          <input
            type="text"
            className="w-full p-2 bg-[#021B36]/60 text-white rounded border border-[#00FFFF30]"
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />

          <button
            type="submit"
            className="w-full py-2 bg-[#00FFFF] text-[#02142B] font-semibold rounded hover:bg-[#7FFFD4]"
          >
            Add Company
          </button>
        </form>
      </div>

      {/* ✅ Show generated data from backend */}
            {createdUser && (
        <div className="bg-[#031C3A]/50 border border-[#00FFFF30] p-6 rounded-xl shadow-lg w-72 h-fit">
          <h3 className="text-xl font-bold text-[#00FFFF] mb-2">
            ✅ Company Added!
          </h3>

          <p className="text-[#AFCBE3]">Share these login details:</p>

          <div className="mt-3">
            <p>
              <strong className="text-[#00FFFF]">Username:</strong><br />
              {createdUser.username}
            </p>

            <p className="mt-2">
              <strong className="text-[#00FFFF]">Password:</strong><br />
              {createdUser.password}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
