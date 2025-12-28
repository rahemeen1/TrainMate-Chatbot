import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Mail, Lock, Briefcase, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { handleLogin } from "../components/services/authHandlers";

export default function AuthModal({ isOpen, mode: initialMode, onClose }) {
  const navigate = useNavigate();

  const [mode, setMode] = useState(initialMode);
  const [userType, setUserType] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    emailOrUsername: "",
    password: "",
  });

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setUserType(null);
      setFormData({ emailOrUsername: "", password: "" });
      setShowPassword(false);
      setRememberMe(false);
      setError("");
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const isLogin = mode === "login";

 const handleSubmit = async (e) => {
  e.preventDefault();

  const result = await handleLogin({
    userType,
    formData,
    navigate,
    onClose,
  });

  if (result?.error) setError(result.error);
};


  const SelectCard = ({ type, icon: Icon, label }) => (
    <div
      onClick={() => setUserType(type)}
      className={`cursor-pointer flex flex-col items-center justify-center w-[45%] sm:w-[200px] h-[130px]
      rounded-xl border transition-all duration-300
      ${
        userType === type
          ? "border-[#00FFFF] bg-[#032A4A]/70 scale-105"
          : "border-[#00FFFF30] bg-[#021B36]/70"
      }`}
    >
      <Icon size={30} className="mb-3 text-[#00FFFF]" />
      <p className="font-semibold text-[#AFCBE3]">{label}</p>
    </div>
  );

   return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#02142B]/95 via-[#031C3A]/95 to-[#04354E]/95 backdrop-blur-md animate-fade-in-up">
      <div className="relative w-[95%] sm:w-[480px] md:w-[540px]
        bg-gradient-to-br from-[#031C3A]/95 via-[#021B36]/95 to-[#011627]/95 
        border border-[#00FFFF40] rounded-2xl backdrop-blur-xl 
        shadow-[0_0_35px_rgba(0,255,255,0.25)] 
        hover:shadow-[0_0_45px_rgba(0,255,255,0.35)] 
        transition-all duration-500 ease-in-out animate-scale-in overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-[#021B36]/80 hover:bg-[#04354E] rounded-full transition-colors z-10 shadow-md border border-[#00FFFF30]"
        >
          <X size={18} className="text-[#00FFFF]" />
        </button>

        <div className="relative px-8 py-8">
          <div className="flex flex-col items-center text-center mb-6 animate-fade-in">
            <div className="w-14 h-14 bg-[#00FFFF]/20 rounded-2xl flex items-center justify-center shadow-[0_0_18px_#00FFFF50] border border-[#00FFFF30] mb-4">
              <span className="text-[#00FFFF] font-extrabold text-xl tracking-wider">TM</span>
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

          {isLogin && !userType && (
            <div className="flex flex-col items-center justify-center space-y-6 animate-fade-in-up">
              <p className="text-[#AFCBE3] text-sm text-center mb-2">
                Are you an Admin or a Fresher?
              </p>
              <div className="flex justify-center gap-5 flex-wrap">
                <SelectCard type="admin" icon={Briefcase} label="Admin" />
                <SelectCard type="fresher" icon={User} label="Fresher" />
              </div>
            </div>
          )}

          {isLogin && userType && (
            <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in-up w-full">
              <div>
                <label className="block text-sm font-medium text-[#AFCBE3] mb-1.5">
                  {userType === "admin" ? "Username / Company ID" : "User ID"}
                </label>
                <div className="relative">
                  {userType === "admin" ? (
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00FFFF]/60" size={18} />
                  ) : (
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00FFFF]/60" size={18} />
                  )}
                  <input
                    type="text"
                    value={formData.emailOrUsername}
                    onChange={(e) => setFormData({ ...formData, emailOrUsername: e.target.value })}
                    className="w-full pl-11 pr-4 py-2.5 bg-[#021B36]/60 border border-[#00FFFF30] text-white rounded-lg focus:border-[#00FFFF]"
                    placeholder={userType === "admin" ? "company_username" : "your_user_id"}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#AFCBE3] mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#00FFFF]/60" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-11 pr-10 py-2.5 bg-[#021B36]/60 border border-[#00FFFF30] text-white rounded-lg focus:border-[#00FFFF]"
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

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 accent-[#00FFFF] border-gray-600 rounded focus:ring-[#00FFFF]"
                  />
                
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-[#00FFFF] text-[#031C3A] font-semibold rounded-lg"
              >
                {loading ? "Logging in..." : "Sign In"}
              </button>

              <button
                type="button"
                onClick={() => setUserType(null)}
                className="text-sm text-[#6B94B8] hover:text-[#00FFFF] block mx-auto mt-3"
              >
                ← Back to selection
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
