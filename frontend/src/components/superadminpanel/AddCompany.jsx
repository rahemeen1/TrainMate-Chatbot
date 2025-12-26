import { useState } from "react";
import { jsPDF } from "jspdf";

export default function AddCompanyForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [createdUser, setCreatedUser] = useState(null);
  const [status] = useState("active");

  /* ================= PDF GENERATOR ================= */
  const downloadPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Company Login Credentials", 20, 20);

    doc.setFontSize(12);
    doc.text(`User ID (Email): ${createdUser.email}`, 20, 40);
    doc.text(`Username: ${createdUser.username}`, 20, 55);
    doc.text(`Password: ${createdUser.password}`, 20, 70);

    doc.setFontSize(10);
    doc.text(
      "Please store these credentials securely. Password is shown once only.",
      20,
      90
    );

    doc.save(`${createdUser.username}_credentials.pdf`);
  };

  /* ================= FORM SUBMIT ================= */
 const handleSubmit = async (e) => {
  e.preventDefault();
  setMessage("");
  setCreatedUser(null);

  // ✅ Regex validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{11}$/;

  if (!name.trim() || !email.trim() || !phone.trim() || !address.trim()) {
    setMessage("❌ All fields are mandatory");
    return;
  }

  if (!emailRegex.test(email)) {
    setMessage("❌ Invalid email format");
    return;
  }

  if (!phoneRegex.test(phone)) {
    setMessage("❌ Phone must be exactly 11 digits");
    return;
  }

  try {
    const res = await fetch("http://localhost:5000/add-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        address,
        status: "active",
        createdAt: new Date(),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(`❌ ${data.message}`);
      return;
    }

    setMessage("✅ Company added successfully");

    setCreatedUser({
      username: data.username,
      email: data.email,
      password: data.password, // for PDF only
    });

    setName("");
    setEmail("");
    setPhone("");
    setAddress("");
  } catch (err) {
    console.error(err);
    setMessage("❌ Server error");
  }
};


  return (
    <div className="flex gap-6">
      {/* FORM */}
      <div className="bg-[#031C3A]/50 border border-[#00FFFF30] p-6 rounded-xl w-[420px]">
        <h2 className="text-xl text-[#00FFFF] font-semibold mb-4">
          Register New Company
        </h2>

        {message && <p className="mb-3 text-white">{message}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            placeholder="Company Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 bg-[#021B36] text-white rounded"
            required
          />
          <input
            placeholder="Company Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 bg-[#021B36] text-white rounded"
            required
          />
          <input
            placeholder="Phone (11 digits)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full p-2 bg-[#021B36] text-white rounded"
            required
          />
          <input
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full p-2 bg-[#021B36] text-white rounded"
            required
          />
          <p className="text-sm text-green-400 font-semibold">
            Status: ACTIVE
          </p>

          <button className="w-full py-2 bg-[#00FFFF] text-black rounded">
            Add Company
          </button>
        </form>
      </div>

      {/* CREDENTIALS + PDF */}
      {createdUser && (
        <div className="bg-[#031C3A]/50 border border-[#00FFFF30] p-6 rounded-xl w-80 h-fit">
          <h3 className="text-xl text-[#00FFFF] font-bold mb-2">
            Login Credentials
          </h3>

          <p className="text-[#AFCBE3] text-sm mb-3">
            Password will not be shown again.
          </p>

          <div className="space-y-3">
            <div>
              <p className="text-[#00FFFF]">Username</p>
              <input
                readOnly
                value={createdUser.username}
                className="w-full p-2 bg-[#021B36] text-white rounded"
              />
            </div>

            <div>
              <p className="text-[#00FFFF]">Password</p>
              <input
                readOnly
                value={createdUser.password}
                className="w-full p-2 bg-[#021B36] text-white rounded"
              />
            </div>

            <button
              onClick={downloadPDF}
              className="w-full py-2 bg-[#7FFFD4] text-black rounded font-semibold"
            >
              Download PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
