import { useState } from "react";
import Header from "./Header";
import HeroSection from "./HeroSection";
import LearnMoreSection from "./LearnMoreSection";
import AuthModal from "../AuthModal";
import LoadingScreen from "./LoadingScreen";

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");

  if (isLoading) {
    return <LoadingScreen onFinish={() => setIsLoading(false)} />;
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white">
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

      <HeroSection
        onLearnMoreClick={() => setLearnMoreOpen(true)}
        onGetStartedClick={() => setAuthMode("signup")}
      />
      <LearnMoreSection
        isOpen={learnMoreOpen}
        onClose={() => setLearnMoreOpen(false)}
      />

      <AuthModal
        isOpen={authModalOpen}
        mode={authMode}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}
