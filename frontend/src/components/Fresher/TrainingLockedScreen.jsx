// TrainingLockedScreen.jsx
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

export default function TrainingLockedScreen({ userData, variant = "full" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const resolvedUserData = userData || location.state?.userData || null;
  const [lockDuration, setLockDuration] = useState("");
  const [daysLocked, setDaysLocked] = useState(0);

  useEffect(() => {
    if (resolvedUserData?.trainingLockedAt) {
      const lockedDate = new Date(
        resolvedUserData.trainingLockedAt.toDate
          ? resolvedUserData.trainingLockedAt.toDate()
          : resolvedUserData.trainingLockedAt
      );
      const now = new Date();
      const diffMs = now - lockedDate;
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      setDaysLocked(days);
      
      if (days > 0) {
        setLockDuration(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setLockDuration(`${hours}h`);
      } else {
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setLockDuration(`${minutes}m`);
      }
    }
  }, [resolvedUserData]);

  const handleGoDashboard = () => {
    navigate("/fresher-dashboard", { replace: true });
  };

  const handleRequestUnlock = () => {
    // This would typically open a modal or send an email to admin
    const adminEmail = resolvedUserData?.adminEmail || "admin@company.com";
    const subject = `Training Unlock Request - ${resolvedUserData?.name || "User"}`;
    const body = `I am requesting to unlock my training access. Module: ${resolvedUserData?.lockedModule || "N/A"}. Reason for lock: ${resolvedUserData?.trainingLockedReason || "N/A"}`;
    window.location.href = `mailto:${adminEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
        @keyframes tmShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        @keyframes tmWarning {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
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

      <div className="relative max-w-4xl w-full mx-4">
        {/* Warning Banner */}
        <div className="mb-4 bg-red-900/30 border border-red-500/50 rounded-lg p-3 flex items-center gap-3">
          <span className="text-xl" style={{ animation: "tmWarning 1.5s ease-in-out infinite" }}>⚠️</span>
          <p className="text-red-200 text-sm">Your training access is restricted. Immediate action may be required.</p>
        </div>

        <div className="rounded-2xl p-[2px] bg-gradient-to-br from-[#00FFFF]/50 via-[#00FFFF]/30 to-[#00FFFF]/40">
          <div className="bg-[#021B36]/95 border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="grid md:grid-cols-[200px_1fr] gap-8 items-start">
              {/* Left Section - Icon & Lock Status */}
              <div className="flex flex-col items-center md:items-start">
                <span className="uppercase tracking-[0.2em] text-[11px] px-3 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-300">
                  Access Blocked
                </span>
                <div className="relative mt-6">
                  <div
                    className="absolute inset-0 rounded-full bg-red-500/20 blur-xl"
                    style={{ animation: "tmPulse 2.2s ease-in-out infinite" }}
                  />
                  <div className="w-28 h-28 bg-gradient-to-br from-red-500/25 to-red-600/10 rounded-full flex items-center justify-center border border-red-500/40" style={{ animation: "tmFloat 3s ease-in-out infinite" }}>
                    <span className="text-7xl">🔐</span>
                  </div>
                </div>
                {daysLocked > 0 && (
                  <div className="mt-4 text-center">
                    <p className="text-xs text-[#AFCBE3]">Locked for</p>
                    <p className="text-lg font-bold text-[#00FFFF]">{lockDuration}</p>
                  </div>
                )}
              </div>

              {/* Right Section - Details */}
              <div>
                <h1 className="text-4xl font-bold text-red-400 mb-2">
                  Training Access Locked
                </h1>
                <p className="text-[#AFCBE3] mb-6 leading-relaxed">
                  Your training has been paused by your company admin. This is a protective measure to ensure your learning path is effective and aligned with your progress.
                </p>

                {/* Lock Reason & Details */}
                <div className="space-y-4 mb-6">
                  {resolvedUserData?.lockedModule && (
                    <div className="bg-[#00FFFF]/10 border border-[#00FFFF]/25 rounded-lg p-4">
                      <p className="text-xs text-[#00FFFF] font-semibold uppercase tracking-wide mb-1">Affected Module</p>
                      <p className="text-[#AFCBE3]">{resolvedUserData.lockedModule}</p>
                    </div>
                  )}

                  {resolvedUserData?.trainingLockedReason && (
                    <div className="bg-red-500/15 border border-red-500/30 rounded-lg p-4">
                      <p className="text-xs text-red-300 font-semibold uppercase tracking-wide mb-1">Lock Reason</p>
                      <p className="text-[#AFCBE3]">{resolvedUserData.trainingLockedReason}</p>
                    </div>
                  )}

                  {resolvedUserData?.trainingLockedAt && (
                    <div className="bg-[#00FFFF]/10 border border-[#00FFFF]/25 rounded-lg p-4">
                      <p className="text-xs text-[#00FFFF] font-semibold uppercase tracking-wide mb-1">Locked Since</p>
                      <p className="text-[#AFCBE3]">
                        {new Date(
                          resolvedUserData.trainingLockedAt.toDate
                            ? resolvedUserData.trainingLockedAt.toDate()
                            : resolvedUserData.trainingLockedAt
                        ).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Next Steps */}
                <div className="bg-[#00FFFF]/5 border border-[#00FFFF]/20 rounded-lg p-4 mb-6">
                  <p className="text-xs text-[#00FFFF] font-semibold uppercase tracking-wide mb-2">What to do next</p>
                  <ul className="text-sm text-[#AFCBE3] space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-[#00FFFF] mt-0.5">→</span>
                      <span>Contact your company admin for review and unlock</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#00FFFF] mt-0.5">→</span>
                      <span>Request details on what needs improvement</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#00FFFF] mt-0.5">→</span>
                      <span>Work on the suggested improvements and reapply</span>
                    </li>
                  </ul>
                </div>

                {/* Admin Contact Section */}
                {resolvedUserData?.adminName || resolvedUserData?.adminEmail ? (
                  <div className="bg-[#00FFFF]/15 border border-[#00FFFF]/35 rounded-lg p-4 mb-6">
                    <p className="text-xs text-[#00FFFF] font-semibold uppercase tracking-wide mb-2">Admin Contact</p>
                    {resolvedUserData?.adminName && (
                      <p className="text-[#AFCBE3] mb-1"><span className="font-semibold">Name:</span> {resolvedUserData.adminName}</p>
                    )}
                    {resolvedUserData?.adminEmail && (
                      <p className="text-[#AFCBE3]"><span className="font-semibold">Email:</span> {resolvedUserData.adminEmail}</p>
                    )}
                  </div>
                ) : null}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleRequestUnlock}
                    className="flex-1 bg-gradient-to-r from-[#00FFFF] to-[#00C9D6] hover:from-[#00FFFF] hover:to-[#00AFC0] text-[#031C3A] font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-[1.02] shadow-lg shadow-[#00FFFF]/20"
                  >
                    📧 Request Unlock
                  </button>
                  <button
                    onClick={handleGoDashboard}
                    className="flex-1 bg-white/10 hover:bg-white/15 text-[#00FFFF] font-bold py-3 px-6 rounded-lg transition-all duration-300 border border-[#00FFFF]/40 hover:border-[#00FFFF]/60"
                  >
                    Back to Dashboard
                  </button>
                </div>

                <p className="text-xs text-[#AFCBE3] mt-5 text-center sm:text-left">
                  For urgent assistance, reach out to your company admin or TrainMate support.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
