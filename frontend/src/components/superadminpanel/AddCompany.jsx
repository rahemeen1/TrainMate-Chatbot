//AddCompany.jsx
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  if (isSubmitting) return;

  setIsSubmitting(true);
  setMessage("");
  setCreatedUser(null);

  // ✅ Regex validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{11}$/;

  if (!name.trim() || !email.trim() || !phone.trim() || !address.trim()) {
    setMessage("❌ All fields are mandatory");
    setIsSubmitting(false);
    return;
  }

  if (!emailRegex.test(email)) {
    setMessage("❌ Invalid email format");
    setIsSubmitting(false);
    return;
  }

  if (!phoneRegex.test(phone)) {
    setMessage("❌ Phone must be exactly 11 digits");
    setIsSubmitting(false);
    return;
  }

  try {
    const res = await fetch("http://localhost:5000/api/add-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        address,
        status,
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
  } finally {
    setIsSubmitting(false);
  }
};


  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 sm:p-6">
        <p className="text-xs tracking-[0.18em] uppercase text-[#8EB6D3]">Company Management</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-[#E8F7FF] mt-1">Add New Company</h2>
        <p className="text-sm text-[#9FC2DA] mt-2">
          Create a company profile and generate one-time login credentials securely.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-[#AFCBE3]">Company Details</h3>
            <span className="text-xs text-[#7FA3BF]">All fields are mandatory</span>
          </div>

          {message && (
            <div
              className={`mb-4 rounded-lg px-3 py-2 text-sm ${
                message.startsWith("✅")
                  ? "bg-green-500/15 text-green-300 border border-green-500/30"
                  : "bg-red-500/15 text-red-300 border border-red-500/30"
              }`}
            >
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm text-[#AFCBE3]">Company Name</label>
                <input
                  placeholder="Enter company name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 bg-[#021B36] text-white rounded-lg border border-[#00FFFF20] focus:outline-none focus:border-[#00FFFF70]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-[#AFCBE3]">Company Email</label>
                <input
                  type="email"
                  placeholder="Enter company email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2.5 bg-[#021B36] text-white rounded-lg border border-[#00FFFF20] focus:outline-none focus:border-[#00FFFF70]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-[#AFCBE3]">Phone</label>
                <input
                  placeholder="11 digits"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 bg-[#021B36] text-white rounded-lg border border-[#00FFFF20] focus:outline-none focus:border-[#00FFFF70]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-[#AFCBE3]">Address</label>
                <input
                  placeholder="Enter company address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-2.5 bg-[#021B36] text-white rounded-lg border border-[#00FFFF20] focus:outline-none focus:border-[#00FFFF70]"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
              <p className="text-sm text-green-400 font-semibold">Status: {status.toUpperCase()}</p>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-semibold transition-colors ${
                  isSubmitting
                    ? "bg-[#00FFFF80] text-black cursor-not-allowed"
                    : "bg-[#00FFFF] text-black hover:bg-[#7FFFD4]"
                }`}
              >
                {isSubmitting ? "Adding Company..." : "Add Company"}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 sm:p-6 h-fit">
          <h3 className="text-lg font-semibold text-[#AFCBE3] mb-1">Login Credentials</h3>
          <p className="text-sm text-[#7FA3BF] mb-4">Credentials appear after successful company creation.</p>

          {createdUser ? (
            <div className="space-y-3">
              <div>
                <p className="text-[#00FFFF] text-sm mb-1">Username</p>
                <input
                  readOnly
                  value={createdUser.username}
                  className="w-full p-2.5 bg-[#021B36] text-white rounded-lg border border-[#00FFFF20]"
                />
              </div>

              <div>
                <p className="text-[#00FFFF] text-sm mb-1">Password</p>
                <input
                  readOnly
                  value={createdUser.password}
                  className="w-full p-2.5 bg-[#021B36] text-white rounded-lg border border-[#00FFFF20]"
                />
              </div>

              <p className="text-xs text-[#AFCBE3]">Password will not be shown again. Download securely.</p>

              <button
                onClick={downloadPDF}
                className="w-full py-2.5 bg-[#7FFFD4] text-black rounded-lg font-semibold hover:brightness-95 transition-all"
              >
                Download PDF
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[#00FFFF30] p-4 text-sm text-[#AFCBE3]">
              Submit the form to generate username and password for the company account.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
