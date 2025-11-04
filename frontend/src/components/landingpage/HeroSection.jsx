import { MessageCircle, Sparkles, ChevronRight } from 'lucide-react';

export default function HeroSection({ onLearnMoreClick, onGetStartedClick }) {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#02142B] via-[#031C3A] to-[#04354E] text-white">
      {/* Soft glowing background accents */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#00FFFF]/25 rounded-full mix-blend-screen filter blur-3xl animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#007BFF]/30 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/3 left-1/2 w-[28rem] h-[28rem] bg-[#00FFFF]/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-6 lg:px-12 py-20 pt-32">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text section */}
          <div className="space-y-8 animate-fade-in-up">
            <div className="inline-flex items-center space-x-2 bg-[#00FFFF]/10 px-4 py-2 rounded-full text-[#00FFFF] text-sm font-medium backdrop-blur-sm shadow-[0_0_10px_#00FFFF40]">
              <Sparkles size={16} />
              <span>AI-Powered Training Assistant</span>
            </div>

            <h1 className="text-5xl font-bold text-[#]">     
              Smarter Onboarding,{' '}
             <h1 className="text-5xl font-bold text-[#00FFFF]"> Smarter Teams </h1>
              
            </h1>

            <p className="text-lg text-gray-200 max-w-lg leading-relaxed">
              <span className="text-[#00FFFF] font-semibold">TrainMate</span> simplifies onboarding and training through adaptive AI — guiding employees intelligently, anywhere in the world.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={onLearnMoreClick}
                className="group px-8 py-4 border border-[#00FFFF] text-[#00FFFF] rounded-lg font-semibold 
                hover:bg-[#00FFFF]/10 hover:shadow-[0_0_20px_#00FFFF] transition-all duration-300 flex items-center justify-center space-x-2"
              >
                <span>Learn More</span>
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={onGetStartedClick}
                className="px-8 py-4 bg-[#00FFFF] text-black rounded-lg font-bold hover:shadow-[0_0_25px_#00FFFF] 
                transition-all duration-300 transform hover:scale-105"
              >
                Get Started
              </button>
            </div>
          </div>

          {/* Right: Mock chat bubble preview */}
          <div className="relative animate-fade-in-up animation-delay-500">
            <div className="relative bg-[#071A2E]/90 rounded-3xl border border-[#00FFFF]/20 shadow-[0_0_25px_#00FFFF]/30 p-8 space-y-6 backdrop-blur-lg">
              <div className="flex items-start space-x-4 animate-slide-in-right animation-delay-1000">
                <div className="w-12 h-12 bg-[#00FFFF]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="text-[#00FFFF]" size={24} />
                </div>
                <div className="bg-[#0D2A3F] rounded-2xl p-4 flex-1">
                  <p className="text-gray-200">How do I access the employee handbook?</p>
                </div>
              </div>

              <div className="flex items-start space-x-4 justify-end animate-slide-in-left animation-delay-1500">
                <div className="bg-[#00FFFF]/20 rounded-2xl p-4 flex-1 text-[#00FFFF] font-medium">
                  <p>
                    I can help you with that! Would you like the full handbook or a summary?
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
                  <p className="text-gray-200">Summarize the leave policies.</p>
                </div>
              </div>

              <div className="flex space-x-2 px-4 animate-pulse animation-delay-2500 justify-center">
                <div className="w-3 h-3 bg-[#00FFFF] rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-[#00FFFF]/70 rounded-full animate-bounce animation-delay-200"></div>
                <div className="w-3 h-3 bg-[#00FFFF]/50 rounded-full animate-bounce animation-delay-400"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
