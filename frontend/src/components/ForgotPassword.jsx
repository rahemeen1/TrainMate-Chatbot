import { useState } from "react";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState(1);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:5000/reset-password-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      alert(data.message);
      if (res.ok) setStep(2);
    } catch (err) {
      console.error(err);
      alert("Error sending reset email");
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return alert("Passwords do not match!");

    try {
      const res = await fetch("http://localhost:5000/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword }),
      });
      const data = await res.json();
      alert(data.message);
    } catch (err) {
      console.error(err);
      alert("Error updating password");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#02142B] text-white">
      <div className="bg-[#031C3A] p-8 rounded-xl shadow-xl w-full max-w-md border border-[#00FFFF30]">
        <h2 className="text-2xl font-bold mb-6 text-[#00FFFF] text-center">
          {step === 1 ? "Reset Password" : "Set New Password"}
        </h2>

        {step === 1 ? (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 rounded bg-[#021B36]/60 border border-[#00FFFF30] text-white"
            />
            <button
              type="submit"
              className="w-full bg-[#00FFFF] text-[#02142B] py-2 rounded font-semibold hover:scale-105 transition"
            >
              Send Reset Email
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full px-4 py-2 rounded bg-[#021B36]/60 border border-[#00FFFF30] text-white"
            />
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-2 rounded bg-[#021B36]/60 border border-[#00FFFF30] text-white"
            />
            <button
              type="submit"
              className="w-full bg-[#00FFFF] text-[#02142B] py-2 rounded font-semibold hover:scale-105 transition"
            >
              Update Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
