// src/pages/OnboardingPage.jsx
import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { FresherSideMenu } from "./FresherSideMenu";

export default function OnboardingPage({ userId, companyId, deptId, onFinish }) {
  const [step, setStep] = useState(1);
  const [level, setLevel] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [cvFile, setCvFile] = useState(null);

  const handleUploadCV = (e) => {
    if (e.target.files[0]) setCvFile(e.target.files[0]);
  };

  const saveAnswersToDB = async () => {
    const userDocRef = doc(db, "companies", companyId, "departments", deptId, "users", userId);
    await setDoc(
      userDocRef,
      {
        onboarding: {
          cvUploaded: !!cvFile,
          level,
          specifications,
          onboardingCompleted: true,
          completedAt: new Date(),
        },
      },
      { merge: true }
    );

    if (onFinish) onFinish();
  };

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        {/* Logo Section */}
       
        <FresherSideMenu />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Onboarding Card */}
        <div className="w-full max-w-3xl p-6 rounded-xl border-2 border-[#00FFFF] bg-[#021B36]/80 shadow-[0_0_25px_rgba(0,255,255,0.3)]">
          {/* Gradient progress */}
          <div className="w-full h-3 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-[#00FFFF] to-[#007BFF] transition-all duration-500"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>

          {/* Welcome text */}
          <p className="text-[#00FFFF] font-semibold text-lg mb-4">
            Welcome! Before starting your training, please answer a few questions.
          </p>

          {/* Step content */}
          {step === 1 && (
            <>
              <p className="text-[#00FFFF] font-semibold mb-2">Upload your CV</p>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleUploadCV}
                className="w-full text-white mb-4"
              />
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-[#00FFFF] font-semibold mb-2">Rate your expertise in this topic</p>
              <div className="flex gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`px-4 py-2 rounded ${
                      level === `${n}` ? "bg-[#00FFFF] text-[#031C3A]" : "bg-[#021B36]/50"
                    }`}
                    onClick={() => setLevel(`${n}`)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-[#00FFFF] font-semibold mb-2">Your specifications</p>
              <textarea
                rows={5}
                value={specifications}
                onChange={(e) => setSpecifications(e.target.value)}
                className="w-full p-3 rounded-lg bg-[#021B36]/70 text-white border border-[#00FFFF30]"
                placeholder="Write your specifications here..."
              />
            </>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-6">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-6 py-2 bg-[#021B36] rounded-lg hover:bg-[#032A4A]"
              >
                &larr; Back
              </button>
            )}
            {step < 3 && (
              <button
                onClick={() => setStep(step + 1)}
                className="px-6 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold"
              >
                Next &rarr;
              </button>
            )}
            {step === 3 && (
              <button
                onClick={saveAnswersToDB}
                className="px-6 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold"
              >
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
