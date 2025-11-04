import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function Header({ onLoginClick, onSignUpClick }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#020617]/90 backdrop-blur-md border-b border-[#00FFFF]/20 shadow-[0_0_10px_#00FFFF30]">
      <nav className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 bg-[#00FFFF]/20 rounded-xl flex items-center justify-center shadow-[0_0_10px_#00FFFF]">
              <span className="text-[#00FFFF] font-extrabold text-base">TM</span>
            </div>
            <h2 className="text-xl font-bold text-[#00FFFF]">    TrainMate</h2>
          </div>

          {/* Desktop Buttons */}
          <div className="hidden md:flex items-center space-x-5">
            <button
              onClick={onLoginClick}
              className="px-5 py-2 text-[#00FFFF] font-medium hover:text-white hover:drop-shadow-[0_0_10px_#00FFFF] transition-all duration-300"
            >
              Login
            </button>
            <button
              onClick={onSignUpClick}
              className="px-6 py-2 bg-[#00FFFF] text-[#000] font-semibold rounded-full hover:shadow-[0_0_20px_#00FFFF] transform hover:scale-105 transition-all duration-300"
            >
              Sign Up
            </button>
          </div>

          {/* Mobile Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-[#00FFFF]"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-3 animate-fade-in">
            <button
              onClick={() => {
                onLoginClick();
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-[#00FFFF] hover:bg-[#00FFFF]/10 rounded-lg transition-colors"
            >
              Login
            </button>
            <button
              onClick={() => {
                onSignUpClick();
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left px-4 py-2 bg-[#00FFFF] text-black font-semibold rounded-lg hover:shadow-[0_0_15px_#00FFFF] transition-all"
            >
              Sign Up
            </button>
          </div>
        )}
      </nav>
    </header>
  );
}
