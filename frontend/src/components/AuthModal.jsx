import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Mail, Lock, Briefcase, User } from "lucide-react";

export default function AuthModal({ isOpen, mode: initialMode, onClose }) {
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    companyCode: "",
  });
  const [mode, setMode] = useState(initialMode);
  const [userType, setUserType] = useState(null); // 'admin' or 'fresher'

  // ✅ Fix: Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setUserType(null);
      setFormData({ email: "", password: "", companyCode: "" });
      setShowPassword(false);
      setRememberMe(false);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;
  const isLogin = mode === "login";

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Form submitted:", { ...formData, userType });
  };

  // 🎨 Reusable card for user type selection
  const SelectCard = ({ type, icon: Icon, label }) => (
    <div
      onClick={() => setUserType(type)}
      className={`cursor-pointer flex flex-col items-center justify-center w-[45%] sm:w-[200px] h-[130px] 
      rounded-xl border transition-all duration-300 
      ${
        userType === type
          ? "border-[#00FFFF] bg-[#032A4A]/70 shadow-[0_0_25px_rgba(0,255,255,0.3)] scale-105"
          : "border-[#00FFFF30] bg-[#021B36]/70 hover:border-[#00FFFF60] hover:shadow-[0_0_20px_rgba(0,255,255,0.2)]"
      }`}
    >
      <Icon
        size={30}
        className={`mb-3 ${
          userType === type ? "text-[#00FFFF]" : "text-[#00FFFFB0]"
        }`}
      />
      <p
        className={`font-semibold ${
          userType === type ? "text-[#00FFFF]" : "text-[#AFCBE3]"
        }`}
      >
        {label}
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#02142B]/95 via-[#031C3A]/95 to-[#04354E]/95 backdrop-blur-md animate-fade-in-up">
      <div
        className="relative w-[95%] sm:w-[480px] md:w-[540px]
        bg-gradient-to-br from-[#031C3A]/95 via-[#021B36]/95 to-[#011627]/95 
        border border-[#00FFFF40] 
        rounded-2xl backdrop-blur-xl 
        shadow-[0_0_35px_rgba(0,255,255,0.25)] 
        hover:shadow-[0_0_45px_rgba(0,255,255,0.35)] 
        transition-all duration-500 ease-in-out animate-scale-in overflow-hidden"
      >
        {/* ✖ Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-[#021B36]/80 hover:bg-[#04354E] rounded-full transition-colors z-10 shadow-md border border-[#00FFFF30]"
        >
          <X size={18} className="text-[#00FFFF]" />
        </button>

        <div className="relative px-8 py-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6 animate-fade-in">
            <div className="w-14 h-14 bg-[#00FFFF]/20 rounded-2xl flex items-center justify-center shadow-[0_0_18px_#00FFFF50] border border-[#00FFFF30] mb-4">
              <span className="text-[#00FFFF] font-extrabold text-xl tracking-wider">
                TM
              </span>
            </div>

            <h2 className="text-2xl font-bold text-[#E8F7FF] mb-1">
              {isLogin ? "Welcome Back" : "Create Account"}
            </h2>
            <p className="text-[#AFCBE3] text-sm">
              {isLogin
                ? "Sign in to continue your learning journey"
                : "Start your learning journey with TrainMate"}
            </p>
          </div>

          {/* 🔹 Login Flow */}
          {isLogin ? (
            <>
              {/* Step 1 — User Type Selection */}
              {!userType ? (
                <div className="flex flex-col items-center justify-center space-y-6 animate-fade-in-up">
                  <p className="text-[#AFCBE3] text-sm text-center mb-2">
                    Are you a Company Admin or a Fresher?
                  </p>
                  <div className="flex justify-center gap-5 flex-wrap">
                    <SelectCard
                      type="admin"
                      icon={Briefcase}
                      label="Company Admin"
                    />
                    <SelectCard type="fresher" icon={User} label="Fresher" />
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="space-y-5 animate-fade-in-up w-full"
                >
                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-[#AFCBE3] mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#00FFFF]/60"
                        size={18}
                      />
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
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
                      <Lock
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#00FFFF]/60"
                        size={18}
                      />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
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

                  {/* Admin-only field */}
                  {userType === "admin" && (
                    <div>
                      <label className="block text-sm font-medium text-[#AFCBE3] mb-1.5">
                        Company Code
                      </label>
                      <input
                        type="text"
                        value={formData.companyCode}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            companyCode: e.target.value,
                          })
                        }
                        className="w-full pl-4 pr-4 py-2.5 bg-[#021B36]/60 border border-[#00FFFF30] text-white rounded-lg focus:border-[#00FFFF] focus:outline-none placeholder-gray-400 transition-all"
                        placeholder="Enter your company code"
                        required
                      />
                    </div>
                  )}

                  {/* Remember Me + Forgot */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 accent-[#00FFFF] border-gray-600 rounded focus:ring-[#00FFFF]"
                      />
                      <span className="text-sm text-[#AFCBE3]">
                        Remember me
                      </span>
                    </label>
                    <button
                      type="button"
                      className="text-sm text-[#00FFFF] hover:text-[#7FFFD4] transition-colors font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-gradient-to-r from-[#00FFFF] to-[#007BFF] 
                    text-[#02142B] font-semibold rounded-lg 
                    shadow-[0_0_20px_rgba(0,255,255,0.3)] 
                    hover:shadow-[0_0_35px_rgba(0,255,255,0.5)] 
                    transform hover:scale-105 transition-all duration-300"
                  >
                    Sign In
                  </button>

                  {/* Back button */}
                  <button
                    type="button"
                    onClick={() => setUserType(null)}
                    className="text-sm text-[#6B94B8] hover:text-[#00FFFF] block mx-auto mt-3"
                  >
                    ← Back to selection
                  </button>
                </form>
              )}
            </>
          ) : (
            // 🔹 Signup (remains same)
            <>
              <div
                className="bg-gradient-to-br from-[#021B36]/90 to-[#032A4A]/90 
                border border-[#00FFFF40] rounded-xl p-5 
                shadow-[0_0_20px_rgba(0,255,255,0.25)] 
                text-center animate-fade-in-up"
              >
                <p className="text-[#AFCBE3] text-sm leading-relaxed">
                  To create an account with{" "}
                  <span className="text-[#00FFFF] font-medium">TrainMate</span>, 
                  please contact us at{" "}
                  <span className="text-[#00FFFF] font-semibold">
                    trainmate@gmail.com
                  </span>.
                </p>
              </div>
            </>
          )}

          {/* Toggle between login/signup */}
          <div className="mt-5 text-center">
            <p className="text-[#AFCBE3] text-sm">
              {isLogin
                ? "Don't have an account? "
                : "Already have an account? "}
              <button
                onClick={() => {
                  setMode(isLogin ? "signup" : "login");
                  setUserType(null);
                }}
                className="text-[#00FFFF] hover:text-[#7FFFD4] font-semibold transition-colors"
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
