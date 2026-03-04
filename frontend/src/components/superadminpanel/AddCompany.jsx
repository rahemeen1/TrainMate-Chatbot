//AddCompany.jsx
import { useState } from "react";

export default function AddCompanyForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [createdUser, setCreatedUser] = useState(null);
  const [status] = useState("active");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          <h3 className="text-lg font-semibold text-[#AFCBE3] mb-1">Account Setup</h3>
          <p className="text-sm text-[#7FA3BF] mb-4">Status appears after successful company creation.</p>

          {createdUser ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4 space-y-2">
                <p className="flex items-center gap-2 text-green-300 font-semibold">
                  <span className="text-xl">✅</span> Company Created Successfully
                </p>
                <p className="text-sm text-green-200">
                  Login credentials have been securely sent to:
                </p>
                <p className="text-sm font-mono text-[#00FFFF] break-all">
                  {createdUser.email}
                </p>
              </div>

              <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4 space-y-2">
                <p className="text-sm text-blue-200">
                  <span className="font-semibold">📧 Password Delivery:</span> For security, the password is not displayed here. The complete login credentials have been securely sent to the company email address.
                </p>
              </div>

             
              
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[#00FFFF30] p-4 text-sm text-[#AFCBE3]">
              Submit the form to create the company account and send login credentials to the provided email.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
