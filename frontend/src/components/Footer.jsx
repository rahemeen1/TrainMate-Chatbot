import { Github, Twitter, Linkedin, Mail } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    { icon: Twitter, href: "#", label: "Twitter" },
    { icon: Linkedin, href: "#", label: "LinkedIn" },
    { icon: Github, href: "#", label: "GitHub" },
    { icon: Mail, href: "#", label: "Email" },
  ];

  return (
    <footer className="bg-gradient-to-br from-[#020617] via-[#0a0f2c] to-[#000000] text-white border-t border-[#00FFFF]/20">
      <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between text-center md:text-left gap-6">

        {/* LEFT - Links */}
        <div className="flex items-center justify-center space-x-4">
          {socialLinks.map(({ icon: Icon, href, label }) => (
            <a
              key={label}
              href={href}
              aria-label={label}
              className="text-gray-400 hover:text-[#00FFFF] transition-colors"
            >
              <Icon size={20} />
            </a>
          ))}
        </div>

        {/* CENTER - Brand */}
        <div className="text-center space-y-1">
          <p className="text-gray-500 text-xs mt-1">
            © {currentYear} TrainMate. All rights reserved.
          </p>
        </div>

        {/* RIGHT - Brand Icon */}
        <div className="flex items-center justify-end space-x-3">
          <div className="w-9 h-9 bg-[#00FFFF]/20 rounded-xl flex items-center justify-center shadow-[0_0_10px_#00FFFF]">
            <span className="text-[#00FFFF] font-extrabold text-base">TM</span>
          </div>
          <h2 className="text-xl font-bold text-[#00FFFF]">TrainMate</h2>
        </div>

      </div>
    </footer>
  );
}
