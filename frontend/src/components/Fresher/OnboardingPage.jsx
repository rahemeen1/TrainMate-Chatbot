import { useEffect, useState } from "react";
import { doc, getDoc,setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { FresherSideMenu } from "./FresherSideMenu";

export default function OnboardingPage({
  userId,
  companyId: propCompanyId,
  deptId: propDeptId,
  onFinish,
  companyName: propCompanyName, // optional from login
}) {
  const [loading, setLoading] = useState(true);

  // 🔹 Firebase data
  const [userName, setUserName] = useState("");
  const [companyName, setCompanyName] = useState(propCompanyName || "Company");
  const [trainingOn, setTrainingOn] = useState("");
  const [companyId, setCompanyId] = useState(propCompanyId);
  const [deptId, setDeptId] = useState(propDeptId);

  // 🔹 Onboarding states
  const [step, setStep] = useState(1);
  const [cvUploaded, setCvUploaded] = useState(false);
  const [expertise, setExpertise] = useState(null);
  const [level, setLevel] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        if (!userId) {
          console.error("No userId provided to OnboardingPage");
          setLoading(false);
          return;
        }

        // 🔹 Fetch fresher from `freshers` collection
        const fresherRef = doc(db, "freshers", userId);
        const fresherSnap = await getDoc(fresherRef);

        if (!fresherSnap.exists()) {
          console.error("Fresher not found in freshers collection");
          setLoading(false);
          return;
        }

        const fresherData = fresherSnap.data();

        setUserName(fresherData.name || "Fresher");
        setTrainingOn(fresherData.trainingOn || "your training");
        setCompanyId(fresherData.companyId || propCompanyId);
        setDeptId(fresherData.deptId || propDeptId);

        if (!propCompanyName && fresherData.companyName) {
          setCompanyName(fresherData.companyName);
        }

        setLoading(false);
      } catch (err) {
        console.error("Onboarding fetch error:", err);
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, propCompanyId, propDeptId, propCompanyName]);

  const saveAndContinue = async () => {
    try {
      const userRef = doc(db, "freshers", userId);

      await setDoc(
        userRef,
        {
          onboarding: {
            cvUploaded,
            expertise,
            level,
            onboardingCompleted: true,
            completedAt: new Date(),
          },
        },
        { merge: true }
      );

      if (onFinish) onFinish();
    } catch (err) {
      console.error("Error saving onboarding:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#031C3A] flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* SIDEBAR */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu companyName={companyName} />
      </div>

      {/* MAIN */}
      <div className="flex-1 p-10">
        <div className="text-left mb-10">
          <h1 className="text-2xl font-bold text-[#00FFFF]">
            Welcome {userName}!
          </h1>

          <p className="text-[#AFCBE3] max-w-1xl mt-2 text-base">
            To get started off the training program with {companyName}, answer a few questions which can help customise your roadmap.
          </p>
        </div>

        <div className="max-w-4xl mx-auto bg-[#021B36]/80 border border-[#00FFFF40] rounded-2xl p-8 shadow-[0_0_30px_rgba(0,255,255,0.25)]">
          {/* PROGRESS */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-[#AFCBE3] mb-2">
              <span>Question {step} of 3</span>
            </div>
            <div className="w-full h-3 rounded-full bg-[#021B36] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#00FFFF] to-[#007BFF]"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <>
              <h3 className="text-[#00FFFF] text-lg font-semibold mb-4">
                Upload your CV
              </h3>
              <button
                onClick={() => setCvUploaded(true)}
                className="px-6 py-3 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold"
              >
                Upload CV
              </button>
              <p className="text-sm text-[#AFCBE3] mt-2 italic opacity-80">
                Mandatory for personalized training recommendations.
              </p>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              <h3 className="text-[#00FFFF] text-lg font-semibold mb-4">
                What do you feel about your expertise in {trainingOn}?
              </h3>
              <div className="flex gap-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setExpertise(n)}
                    className={`w-12 h-12 rounded-lg font-semibold ${
                      expertise === n
                        ? "bg-[#00FFFF] text-[#031C3A]"
                        : "bg-[#021B36] border border-[#00FFFF30]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-sm text-[#AFCBE3] mt-2 italic opacity-80">5 is the highest</p>
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <>
              <h3 className="text-[#00FFFF] text-lg font-semibold mb-4">
                Select your training level
              </h3>
              <div className="flex gap-4">
                {["Basic", "Medium", "Hard"].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLevel(lvl)}
                    className={`px-6 py-3 rounded-lg ${
                      level === lvl
                        ? "bg-[#00FFFF] text-[#031C3A]"
                        : "bg-[#021B36] border border-[#00FFFF30]"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* NAV */}
          <div className="flex justify-between mt-10">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-5 py-2 bg-[#021B36] rounded-lg"
              >
                ← Back
              </button>
            )}

            {step < 3 && (
              <button
                onClick={() => setStep(step + 1)}
                className="ml-auto px-6 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold"
              >
                Continue → 
              </button>
            )}

            {step === 3 && (
              <button
                onClick={saveAndContinue}
                className="ml-auto px-6 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold"
              >
                Save & Continue
              </button>
            )}
          </div>

          {step === 3 && (
            <p className="text-xs text-[#AFCBE3] mt-4">
              By clicking continue, you agree to our{" "}
              <a
                href="https://drive.google.com/file/d/1jf2VVUd1zLdrVnkgcf-7jQaUJT_Jd53N/view?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00FFFF] underline"
              >
                Terms & Conditions
              </a>{" "}
              of TrainMate.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
