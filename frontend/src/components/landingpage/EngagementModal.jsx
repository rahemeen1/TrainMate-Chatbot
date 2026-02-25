import { X, Mail } from "lucide-react";

export default function EngagementModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-gradient-to-br from-[#0B122B] via-[#0E1836] to-[#121C3E] p-8 shadow-[0_25px_70px_rgba(0,0,0,0.5)] animate-scale-in">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white/70 transition hover:text-white"
        >
          <X size={18} />
        </button>

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#33FFD6]/15 text-[#33FFD6]">
          <Mail size={22} />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-white">
          Get started with TrainMate
        </h2>
        <p className="mt-2 text-sm text-white/70">
          Share your training goals and cohort size. Our team will guide you to
          the right plan and setup.
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            Contact us
          </p>
          <a
            href="mailto:trainmate01@gmail.com"
            className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#33FFD6] hover:text-white"
          >
            <Mail size={16} />
            trainmate01@gmail.com
          </a>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white/80 transition hover:border-white/60 hover:text-white"
          >
            Close
          </button>
          <a
            href="mailto:trainmate01@gmail.com"
            className="rounded-full bg-[#33FFD6] px-5 py-2 text-sm font-semibold text-[#050B1E] shadow-[0_0_18px_rgba(51,255,214,0.45)] transition hover:shadow-[0_0_28px_rgba(51,255,214,0.6)]"
          >
            Email Us
          </a>
        </div>
      </div>
    </div>
  );
}
