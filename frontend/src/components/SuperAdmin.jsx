import { useState } from "react";
import { X, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SuperAdmin() {
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });

  const navigate = useNavigate();

  
   const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    const role = "superadmin";

    const response = await fetch(`http://localhost:5000/login/${role}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.email,
        password: formData.password,
      }),
    });

    const data = await response.json();

    // ✅ Add this line
    console.log("Response from backend:", data);
if (response.ok && data.message.includes("login successful")) {


      alert("Login successful!");

      setTimeout(() => {
        // ✅ Also add console to check if navigate is reached
        console.log("Navigating to dashboard...");
        navigate("/admin-dashboard");
      }, 300);
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error("Error during login:", error);
    alert("Server error. Please try again later.");
  }
};


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#02142B]/95 via-[#031C3A]/95 to-[#04354E]/95 backdrop-blur-md animate-fade-in-up">
      <div
        className="relative w-[95%] sm:w-[480px] md:w-[540px]
        bg-gradient-to-br from-[#031C3A]/95 via-[#021B36]/95 to-[#011627]/95 
        border border-[#00FFFF40] rounded-2xl backdrop-blur-xl 
        shadow-[0_0_35px_rgba(0,255,255,0.25)] hover:shadow-[0_0_45px_rgba(0,255,255,0.35)]
        transition-all duration-500 ease-in-out animate-scale-in overflow-hidden"
      >
        <div className="relative px-8 py-8">
          <div className="flex flex-col items-center text-center mb-6 animate-fade-in">
            <div className="w-14 h-14 bg-[#00FFFF]/20 rounded-2xl flex items-center justify-center shadow-[0_0_18px_#00FFFF50] border border-[#00FFFF30] mb-4">
              <span className="text-[#00FFFF] font-extrabold text-xl tracking-wider">
                TM
              </span>
            </div>

            <h2 className="text-2xl font-bold text-[#E8F7FF] mb-1">
              Welcome Back
            </h2>
            <p className="text-[#AFCBE3] text-sm">
              Super Admin — Sign in to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in-up w-full">
            
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[#AFCBE3] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#00FFFF]/60" size={18} />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-11 pr-4 py-2.5 bg-[#021B36]/60 border border-[#00FFFF30] text-white rounded-lg focus:border-[#00FFFF] focus:outline-none placeholder-gray-400 transition-all"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[#AFCBE3] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#00FFFF]/60" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-11 pr-10 py-2.5 bg-[#021B36]/60 border border-[#00FFFF30] text-white rounded-lg focus:border-[#00FFFF] focus:outline-none placeholder-gray-400 transition-all"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#00FFFF]/70 hover:text-[#00FFFF] transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 accent-[#00FFFF] border-gray-600 rounded focus:ring-[#00FFFF]"
                />
                <span className="text-sm text-[#AFCBE3]">Remember me</span>
              </label>

              <button
                type="button"
                className="text-sm text-[#00FFFF] hover:text-[#7FFFD4] transition-colors font-medium"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-[#00FFFF] to-[#007BFF] text-[#02142B] font-semibold rounded-lg shadow-[0_0_20px_rgba(0,255,255,0.3)] hover:shadow-[0_0_35px_rgba(0,255,255,0.5)] transform hover:scale-105 transition-all duration-300"
            >
              Sign In
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}
