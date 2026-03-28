import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "./Header";
import {
  Check,
  Sparkles,
} from "lucide-react";
import EngagementModal from "./EngagementModal";
import AuthModal from "../AuthModal";
import { DEFAULT_LICENSING_PLANS, getLicensingPlans } from "../../services/licensingConfig";

export default function License() {
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [plans, setPlans] = useState(DEFAULT_LICENSING_PLANS);

  useEffect(() => {
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

  const planCards = [plans.basic, plans.pro];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#02142B] via-[#031C3A] to-[#04354E] text-white relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#00FFFF]/25 rounded-full mix-blend-screen filter blur-3xl animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#007BFF]/30 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/3 left-1/2 w-[28rem] h-[28rem] bg-[#00FFFF]/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-4000"></div>
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
              <span>Licensing Plans</span>
            </div>
            <h1 className="text-5xl font-bold text-white">
              Built for <span className="text-[#00FFFF]">cohort success</span>, from 10 to 40 at a time.
            </h1>
            <p className="max-w-xl text-lg text-gray-300 leading-relaxed">
              Choose the license that matches your training intensity. Both plans include hands-on onboarding, roadmap clarity, and transparent progress tracking.
            </p>
            <div className="flex flex-wrap gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
                Roadmaps
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
                Admin dashboards
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
                AI insights
              </span>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/0 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)] animate-fade-in-up animation-delay-200">
            <h2 className="text-lg font-semibold text-white">
              What every license includes
            </h2>
            <p className="mt-2 text-sm text-white/70">
              Support, onboarding assistance, and fresher-ready content structure
              for every team.
            </p>
            <ul className="mt-6 space-y-4 text-sm text-white/80">
              {[
                "Dedicated onboarding cadence",
                "Secure role-based access",
                "Progress analytics dashboards",
                "Smart reminders for training milestones",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 rounded-full bg-[#00FFFF]/20 p-1">
                    <Check size={14} className="text-[#00FFFF]" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          {planCards.map((plan, index) => (
            <div
              key={plan.name}
              className={`rounded-3xl p-8 shadow-[0_25px_60px_rgba(0,0,0,0.45)] animate-fade-in-up ${
                index === 0
                  ? "border border-[#00FFFF]/30 bg-[#0B122B]/90"
                  : "border border-[#00FFFF]/40 bg-gradient-to-br from-[#0B122B] via-[#0C1B35] to-[#0E2743] animation-delay-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">{plan.name}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white [font-family:'Space_Grotesk',sans-serif]">
                    {plan.label}
                  </h3>
                </div>
                <span className="rounded-full bg-[#00FFFF]/20 px-3 py-1 text-xs font-semibold text-[#00FFFF]">
                  {plan.capacity}
                </span>
              </div>
              <div className="mt-4 rounded-lg bg-[#00FFFF]/10 px-3 py-2">
                <p className="text-lg font-semibold text-[#00FFFF]">${plan.usdPrice}/month</p>
                <p className="text-xs text-white/60">Rs {Number(plan.inrPrice).toLocaleString("en-IN")}/month</p>
              </div>
              <div className="mt-2">
                <span className="rounded-full border border-[#00FFFF]/20 bg-[#00FFFF]/5 px-3 py-1 text-xs text-[#AEEFFF]">
                  {plan.departments}
                </span>
              </div>
              <div className="mt-6 space-y-4">
                {(plan.includes || []).map((feature) => (
                  <div
                    key={`${plan.name}-${feature}`}
                    className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-[#00FFFF]/10">
                      <Check size={18} className="text-[#00FFFF]" />
                    </div>
                    <p className="text-sm font-semibold text-white">{feature}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="flex flex-col items-center gap-4 rounded-3xl border-2 border-[#00FFFF]/70 bg-gradient-to-br from-[#061528] via-[#0A1F38] to-[#0E2845] p-8 text-center shadow-[0_0_30px_rgba(0,255,255,0.4)] hover:shadow-[0_0_40px_rgba(0,255,255,0.6)] transition-all">
          <h2 className="text-2xl font-semibold text-white [font-family:'Space_Grotesk',sans-serif]">
            Ready to align your training pipeline?
          </h2>
          <p className="max-w-2xl text-sm text-white/70">
            Start with Basic or scale up to Pro to unlock adaptive quizzes,
            agentic scoring, and AI admin assistance.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setEngagementOpen(true)}
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white/80 transition hover:border-white/60 hover:text-white"
            >
              Talk to Us
            </button>
            <Link
              to="/compare-plans"
              className="rounded-full bg-[#00FFFF] px-5 py-2 text-sm font-semibold text-[#020617] shadow-[0_0_18px_rgba(0,255,255,0.45)] transition hover:shadow-[0_0_28px_rgba(0,255,255,0.6)]"
            >
              Compare Plans
            </Link>
          </div>
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
