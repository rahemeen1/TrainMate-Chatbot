import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Header from "./Header";
import {
  Check,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import EngagementModal from "./EngagementModal";
import AuthModal from "../AuthModal";
import { DEFAULT_LICENSING_PLANS, getLicensingPlans } from "../../services/licensingConfig";

export default function ComparePlans() {
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [plans, setPlans] = useState(DEFAULT_LICENSING_PLANS);

  const planList = [plans.basic, plans.pro];
  const featureRows = Array.from(
    new Set([...(plans.basic?.includes || []), ...(plans.pro?.includes || [])])
  ).map((feature) => ({
    title: feature,
    basic: (plans.basic?.includes || []).includes(feature),
    pro: (plans.pro?.includes || []).includes(feature),
  }));

  useEffect(() => {
    window.scrollTo(0, 0);

    const fetchPlans = async () => {
      try {
        const data = await getLicensingPlans();
        setPlans(data);
      } catch (err) {
        console.error("Failed to load licensing plans:", err);
      }
    };

    fetchPlans();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#02142B] via-[#031C3A] to-[#04354E] text-white relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute -top-40 left-[-15%] h-96 w-96 rounded-full bg-[#7C4DFF]/25 blur-[120px]" />
        <div className="absolute top-1/3 right-[-10%] h-80 w-80 rounded-full bg-[#33FFD6]/25 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-1/3 h-96 w-96 rounded-full bg-[#33FFD6]/25 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_40%)]" />
      </div>

      <Header
        onLoginClick={() => {
          setAuthMode("login");
          setAuthModalOpen(true);
        }}
        onSignUpClick={() => {
          setAuthMode("signup");
          setAuthModalOpen(true);
        }}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-16 pt-32">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6 animate-fade-in-up">
            <div className="inline-flex items-center space-x-2 bg-[#00FFFF]/10 px-4 py-2 rounded-full text-[#00FFFF] text-sm font-medium backdrop-blur-sm shadow-[0_0_10px_#00FFFF40]">
              <Sparkles size={16} />
              <span>Feature Comparison</span>
            </div>
            <h1 className="text-5xl font-bold text-white">
              Compare what <span className="text-[#00FFFF]">Basic and Pro</span> unlock for your cohort.
            </h1>
            <p className="max-w-xl text-lg text-gray-300 leading-relaxed">
              From core roadmap tracking to AI-driven assessments, choose the coverage you need to onboard at scale.
            </p>
            <div className="flex flex-wrap gap-3">
              {planList.map((plan) => (
                <div key={plan.name} className="flex flex-col gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
                    {plan.capacity}
                  </span>
                  <span className="rounded-full border border-[#00FFFF]/20 bg-[#00FFFF]/5 px-4 py-2 text-xs text-[#00FFFF]">
                    {plan.departments}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative animate-fade-in-up animation-delay-500">
            <div className="relative bg-[#071A2E]/90 rounded-3xl border border-[#00FFFF]/20 shadow-[0_0_25px_#00FFFF]/30 p-8 space-y-6 backdrop-blur-lg">
              <div className="flex items-start space-x-4 animate-slide-in-right animation-delay-1000">
                <div className="w-12 h-12 bg-[#00FFFF]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="text-[#00FFFF]" size={24} />
                </div>
                <div className="bg-[#0D2A3F] rounded-2xl p-4 flex-1">
                  <p className="text-gray-200">What plan is best for my team?</p>
                </div>
              </div>

              <div className="flex items-start space-x-4 justify-end animate-slide-in-left animation-delay-1500">
                <div className="bg-[#00FFFF]/20 rounded-2xl p-4 flex-1 text-[#00FFFF] font-medium">
                  <p>
                    Basic for teams of 10-15, Pro for teams up to 40 with AI features.
                  </p>
                </div>
                <div className="w-12 h-12 bg-[#00FFFF]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Sparkles className="text-[#00FFFF]" size={24} />
                </div>
              </div>

              <div className="flex items-start space-x-4 animate-slide-in-right animation-delay-2000">
                <div className="w-12 h-12 bg-[#00FFFF]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="text-[#00FFFF]" size={24} />
                </div>
                <div className="bg-[#0D2A3F] rounded-2xl p-4 flex-1">
                  <p className="text-gray-200">Do you offer implementation support?</p>
                </div>
              </div>

              <div className="flex space-x-2 px-4 animate-pulse animation-delay-2500 justify-center">
                <div className="w-3 h-3 bg-[#00FFFF] rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-[#00FFFF]/70 rounded-full animate-bounce animation-delay-200"></div>
                <div className="w-3 h-3 bg-[#00FFFF]/50 rounded-full animate-bounce animation-delay-400"></div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#0B122B]/80 p-8 shadow-[0_25px_60px_rgba(0,0,0,0.45)]">
          <div className="grid gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold text-white [font-family:'Space_Grotesk',sans-serif]">
                Feature-by-feature comparison
              </h2>
              <p className="text-sm text-white/70">
                Everything you need to decide on the right level of AI support.
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="grid grid-cols-[1.3fr_0.35fr_0.35fr] gap-0 text-sm">
                <div className="bg-white/5 px-4 py-3 font-semibold text-white/80">
                  Capability
                </div>
                <div className="bg-white/5 px-4 py-3 text-center font-semibold text-white/80">
                  Basic
                </div>
                <div className="bg-white/5 px-4 py-3 text-center font-semibold text-white/80">
                  Pro
                </div>
                {featureRows.map((row) => (
                  <div
                    key={row.title}
                    className="contents border-t border-white/10"
                  >
                    <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-white/80">
                      <span>{row.title}</span>
                    </div>
                    <div className="flex items-center justify-center border-t border-white/10 px-4 py-3">
                      {typeof row.basic === "string" ? (
                        <span className="text-sm font-medium text-[#00FFFF]">
                          {row.basic}
                        </span>
                      ) : row.basic ? (
                        <span className="rounded-full bg-[#00FFFF]/20 px-3 py-1 text-xs text-[#00FFFF]">
                          Included
                        </span>
                      ) : (
                        <span className="text-xs text-white/40">-</span>
                      )}
                    </div>
                    <div className="flex items-center justify-center border-t border-white/10 px-4 py-3">
                      {typeof row.pro === "string" ? (
                        <span className="text-sm font-medium text-[#00FFFF]">
                          {row.pro}
                        </span>
                      ) : row.pro ? (
                        <span className="rounded-full bg-[#00FFFF]/20 px-3 py-1 text-xs text-[#00FFFF]">
                          Included
                        </span>
                      ) : (
                        <span className="text-xs text-white/40">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col items-center gap-4 rounded-3xl border-2 border-[#00FFFF]/70 bg-gradient-to-br from-[#061528] via-[#0A1F38] to-[#0E2845] p-8 text-center shadow-[0_0_30px_rgba(0,255,255,0.4)] hover:shadow-[0_0_40px_rgba(0,255,255,0.6)] transition-all">
          <h2 className="text-2xl font-semibold text-white [font-family:'Space_Grotesk',sans-serif]">
            Need help choosing the right plan?
          </h2>
          <p className="max-w-2xl text-sm text-white/70">
            Tell us about your team and training goals. We will recommend the
            best license option for your cohort.
          </p>
          <button
            onClick={() => setEngagementOpen(true)}
            className="rounded-full bg-[#00FFFF] px-6 py-2 text-sm font-semibold text-[#020617] shadow-[0_0_18px_rgba(0,255,255,0.45)] transition hover:shadow-[0_0_28px_rgba(0,255,255,0.6)]"
          >
            Get Started
          </button>
        </section>
      </main>

      <AuthModal
        isOpen={authModalOpen}
        mode={authMode}
        onClose={() => setAuthModalOpen(false)}
      />
      <EngagementModal isOpen={engagementOpen} onClose={() => setEngagementOpen(false)} />
    </div>
  );
}
