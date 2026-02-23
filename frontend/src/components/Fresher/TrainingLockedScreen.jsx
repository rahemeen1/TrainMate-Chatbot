// TrainingLockedScreen.jsx
import { useNavigate } from "react-router-dom";

export default function TrainingLockedScreen({ userData, variant = "full" }) {
  const navigate = useNavigate();

  const handleGoDashboard = () => {
    navigate("/fresher-dashboard", { replace: true });
  };

  const isEmbedded = variant === "embedded";
  const wrapperClass = isEmbedded
    ? "w-full h-full text-white flex items-center justify-center"
    : "fixed inset-0 text-white flex items-center justify-center z-50 overflow-hidden";

  return (
    <div
      className={wrapperClass}
      style={{ fontFamily: '"Space Grotesk", "Sora", "Segoe UI", sans-serif' }}
    >
      <style>{`
        @keyframes tmPulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes tmFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>

      {/* Background layers */}
      {!isEmbedded && (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#031C3A_0%,#031C3A_50%,#021B36_100%)]" />
          <div className="absolute inset-0 opacity-20 bg-[linear-gradient(90deg,transparent_0%,rgba(0,255,255,0.12)_50%,transparent_100%)]" />
          <div className="absolute -top-24 -left-24 w-72 h-72 bg-[#00FFFF]/12 blur-3xl rounded-full" />
          <div className="absolute -bottom-28 -right-28 w-80 h-80 bg-[#00FFFF]/15 blur-3xl rounded-full" />
        </>
      )}

      <div className="relative max-w-3xl w-full mx-4">
        <div className="rounded-2xl p-[2px] bg-gradient-to-br from-[#00FFFF]/50 via-[#00FFFF]/30 to-[#00FFFF]/40">
          <div className="bg-[#021B36]/95 border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="grid md:grid-cols-[180px_1fr] gap-6 items-center">
              <div className="flex flex-col items-center md:items-start">
                <span className="uppercase tracking-[0.2em] text-[11px] px-3 py-1 rounded-full bg-[#00FFFF]/15 border border-[#00FFFF]/40 text-[#00FFFF]">
                  Access Hold
                </span>
                <div className="relative mt-5">
                  <div
                    className="absolute inset-0 rounded-full bg-[#00FFFF]/20 blur-xl"
                    style={{ animation: "tmPulse 2.2s ease-in-out infinite" }}
                  />
                  <div className="w-24 h-24 bg-gradient-to-br from-[#00FFFF]/25 to-[#00FFFF]/10 rounded-full flex items-center justify-center border border-[#00FFFF]/40" style={{ animation: "tmFloat 3s ease-in-out infinite" }}>
                    <span className="text-6xl">🔒</span>
                  </div>
                </div>
              </div>

              <div>
                <h1 className="text-3xl font-bold text-[#00FFFF] mb-3">
                  Training Locked
                </h1>
                <p className="text-[#AFCBE3] mb-2">
                  TrainMate has paused your access to protect the learning path.
                </p>
                <p className="text-[#AFCBE3] text-sm mb-5">
                  Contact your company admin to review and unlock your training.
                </p>

                {userData?.trainingLockedReason && (
                  <div className="bg-[#00FFFF]/10 border border-[#00FFFF]/25 rounded-lg p-4 mb-4">
                    <p className="text-sm text-[#AFCBE3]">
                      <span className="font-semibold text-[#00FFFF]">Reason:</span> {userData.trainingLockedReason}
                    </p>
                  </div>
                )}

                <div className="bg-[#00FFFF]/10 border border-[#00FFFF]/30 rounded-lg p-4 mb-5">
                  <p className="text-sm text-[#AFCBE3]">
                    Ask your admin to review your attempts and reopen this module.
                  </p>
                </div>

                {userData?.trainingLockedAt && (
                  <p className="text-xs text-[#AFCBE3] mb-5">
                    Locked on: {new Date(
                      userData.trainingLockedAt.toDate
                        ? userData.trainingLockedAt.toDate()
                        : userData.trainingLockedAt
                    ).toLocaleString()}
                  </p>
                )}

                <button
                  onClick={handleGoDashboard}
                  className="w-full md:w-auto bg-gradient-to-r from-[#00FFFF] to-[#00C9D6] hover:from-[#00FFFF] hover:to-[#00AFC0] text-[#031C3A] font-bold py-3 px-8 rounded-lg transition-all duration-300 transform hover:scale-[1.02] shadow-lg shadow-[#00FFFF]/20"
                >
                  Go to Dashboard
                </button>

                <p className="text-xs text-[#AFCBE3] mt-5">
                  For urgent help, contact your company admin or TrainMate support.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
