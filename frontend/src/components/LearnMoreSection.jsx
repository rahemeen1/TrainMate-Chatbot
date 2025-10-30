import { Upload, Brain, GraduationCap, TrendingUp, X } from 'lucide-react';
import { useEffect } from 'react';

export default function LearnMoreSection({ isOpen, onClose }) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => (document.body.style.overflow = 'unset');
  }, [isOpen]);

  if (!isOpen) return null;

  const steps = [
    {
      icon: Upload,
      title: 'Upload Files',
      description: 'Add your PDFs and training material securely.',
      gradient: 'from-[#00BFFF]/70 to-[#0047AB]/80',
      delay: 'animation-delay-200',
    },
    {
      icon: Brain,
      title: 'AI Organizes',
      description: 'AI reads and creates your knowledge base.',
      gradient: 'from-[#0047AB]/80 to-[#001F3F]',
      delay: 'animation-delay-400',
    },
    {
      icon: GraduationCap,
      title: 'Learn Smarter',
      description: 'Get quizzes, flashcards, and quick insights.',
      gradient: 'from-[#001F3F] to-[#000000]',
      delay: 'animation-delay-600',
    },
    {
      icon: TrendingUp,
      title: 'Track Growth',
      description: 'See your progress and improvement stats.',
      gradient: 'from-[#000000] to-[#00BFFF]/70',
      delay: 'animation-delay-800',
    },
  ];

  return (
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in">

      <div
     className="relative max-w-5xl w-full mx-4 
bg-gradient-to-br from-[#02142B]/95 via-[#031C3A]/90 to-[#04354E]/90 
border border-[#00FFFF20] 
rounded-3xl backdrop-blur-lg 
shadow-[0_0_25px_rgba(0,255,255,0.2)] 
hover:shadow-[0_0_35px_rgba(0,255,255,0.3)] 
transition-all duration-500 ease-in-out 
animate-scale-in overflow-hidden"

      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-[#001F3F]/70 hover:bg-[#003366]/70 rounded-full transition-all"
        >
          <X size={20} className="text-[#00FFFF]" />
        </button>

        <div className="p-6 sm:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-[#00FFFF] mb-2">
              How TrainMate Works
            </h2>
            <p className="text-gray-300 text-sm">
              Just four quick steps to start learning smarter.
            </p>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`group bg-[#0a0f1a]/60 border border-[#00FFFF20]
                rounded-xl p-4 hover:bg-[#0a0f1a]/80
                hover:shadow-[0_0_15px_#00FFFF40]
                transition-all duration-300 animate-fade-in-up ${step.delay}`}
              >
                <div
                  className={`w-10 h-10 bg-gradient-to-br ${step.gradient} rounded-lg flex items-center justify-center mb-3`}
                >
                  <step.icon className="text-[#00FFFF]" size={22} />
                </div>
                <h3 className="text-base font-semibold text-[#00FFFF] mb-1">
                  {step.title}
                </h3>
                <p className="text-gray-400 text-xs leading-snug">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-8 text-center">
            <button
              onClick={onClose}
             className="px-6 py-2 bg-gradient-to-r from-[#00FFFF] to-[#007BFF]
text-[#02142B] font-bold rounded-lg 
shadow-[0_0_20px_rgba(0,255,255,0.3)] 
hover:shadow-[0_0_35px_rgba(0,255,255,0.4)] 
transform hover:scale-105 transition-all duration-300"

            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
