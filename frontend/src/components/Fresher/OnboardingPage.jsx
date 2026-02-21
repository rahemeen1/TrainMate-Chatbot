import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { FresherSideMenu } from "./FresherSideMenu";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function OnboardingPage({
  userId,
  companyId: propCompanyId,
  deptId: propDeptId,
  onFinish,
  companyName: propCompanyName,
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
  const [cvFile, setCvFile] = useState(null);
  const [cvUploaded, setCvUploaded] = useState(false);
  const [expertise, setExpertise] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const storage = getStorage();

  // =====================================================
  // 🔹 FETCH USER
  // =====================================================
  useEffect(() => {
    const fetchUser = async () => {
      try {
        if (!userId || !companyId || !deptId) {
          console.error("Missing IDs for onboarding");
          setLoading(false);
          return;
        }

        const userRef = doc(
          db,
          "freshers",
          companyId,
          "departments",
          deptId,
          "users",
          userId
        );

        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          console.error("User not found in onboarding");
          setLoading(false);
          return;
        }

        const data = snap.data();

        setUserName(data.name || "Fresher");
        setTrainingOn(data.trainingOn || "your training");

        if (!propCompanyName && data.companyName) {
          setCompanyName(data.companyName);
        }

        setLoading(false);
      } catch (err) {
        console.error("Onboarding fetch error:", err);
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, companyId, deptId, propCompanyName]);

  // =====================================================
  // 🔹 SAVE ONBOARDING WITH CV UPLOAD
  // =====================================================
  const saveAndContinue = async () => {
    try {
      setSaving(true);
      setSavingError("");
      setSaveSuccess(false);

      let cvUrl = "";

      // Upload CV if selected
      if (cvFile) {
        try {
          const extension = cvFile.name.split(".").pop();
          const storageRef = ref(storage, `cvs/${companyId}/${deptId}/${userId}.${extension}`);
          console.log("⬆️ Uploading CV to Storage:", storageRef.fullPath);
          await uploadBytes(storageRef, cvFile);
          cvUrl = await getDownloadURL(storageRef);
          console.log("✅ CV uploaded. URL:", cvUrl);
          setCvUploaded(true);
        } catch (uploadErr) {
          console.error("❌ CV upload failed:", uploadErr);
          setSavingError("Failed to upload CV. Please try again.");
          setSaving(false);
          return;
        }
      }

      // Save onboarding info + CV URL
      const userRef = doc(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId
      );

      await setDoc(
        userRef,
        {
          onboarding: {
            cvUploaded: !!cvUrl,
            expertise,
            onboardingCompleted: true,
            completedAt: new Date(),
          
          },
          cvUrl: cvUrl || null,
        },
        { merge: true }
      );

      console.log("📄 Onboarding saved for user:", userId);
      setSaveSuccess(true);
      setSaving(false);
      
      // Call onFinish after slight delay for success feedback
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 2500);
    } catch (err) {
      console.error("Error saving onboarding:", err);
      setSavingError(err.message || "Failed to save onboarding. Please try again.");
      setSaving(false);
    }
  };

  // =====================================================
  // 🔹 LOADING
  // =====================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-[#031C3A] flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  // =====================================================
  // 🔹 UI
  // =====================================================
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
          <p className="text-[#AFCBE3] max-w-xl mt-2">
            To get started with {companyName}, answer a few questions to
            customize your roadmap.
          </p>
        </div>

        <div className="max-w-4xl mx-auto bg-[#021B36]/80 border border-[#00FFFF40] rounded-2xl p-8">
          {/* PROGRESS */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-[#AFCBE3] mb-2">
              <span>Question {step} of 2</span>
            </div>
            <div className="w-full h-3 rounded-full bg-[#021B36] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#00FFFF] to-[#007BFF]"
                style={{ width: `${(step / 2) * 100}%` }}
              />
            </div>
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <>
              <h3 className="text-[#00FFFF] text-lg font-semibold mb-4">
                Upload your CV
              </h3>

              <label className="inline-flex items-center justify-center px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg cursor-pointer font-semibold hover:bg-[#00e0e0] transition-colors text-base">
      {cvFile ? `Selected` : "Choose File"}
      <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const validTypes = [
                      "application/pdf",
                      "application/msword",
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ];

                    if (!validTypes.includes(file.type)) {
                      alert("Only PDF or Word files allowed!");
                      console.log("❌ Invalid file type:", file.type);
                      return;
                    }

                    console.log("✅ Selected file:", file.name, file.type);
                    setCvFile(file);
                  }}
                />
              </label>

              {cvFile && (
                <p className="text-green-400 mt-2 font-medium">
                  Selected: {cvFile.name}
                </p>
              )}

              <p className="text-[#AFCBE3] text-sm italic mt-2">
                Accepted formats: .pdf, .doc, .docx
              </p>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              <h3 className="text-[#00FFFF] text-lg font-semibold mb-4">
                Your expertise in {trainingOn}?
              </h3>
              <div className="flex gap-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setExpertise(n)}
                    className={`w-12 h-12 rounded-lg ${
                      expertise === n
                        ? "bg-[#00FFFF] text-[#031C3A]"
                        : "bg-[#021B36] border border-[#00FFFF30]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ERROR MESSAGE */}
          {savingError && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg">
              <p className="text-red-300 font-semibold">⚠️ {savingError}</p>
            </div>
          )}

          {/* NAVIGATION */}
          <div className="flex justify-between mt-10">
            {step > 1 && !saving && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-5 py-2 bg-[#021B36] rounded-lg hover:bg-[#021B36]/80 transition"
              >
                ← Back
              </button>
            )}

            {step < 2 && (
              <button
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && !cvFile) || (step === 2 && expertise === null) || saving
                }
                className={`ml-auto px-6 py-2 rounded-lg font-semibold ${
                  (step === 1 && !cvFile) || (step === 2 && expertise === null) || saving
                    ? "bg-gray-500 cursor-not-allowed"
                    : "bg-[#00FFFF] text-[#031C3A] hover:bg-[#00e0e0]"
                }`}
              >
                Continue →
              </button>
            )}

            {step === 2 && (
              <button
                onClick={saveAndContinue}
                disabled={expertise === null || saving}
                className={`ml-auto px-6 py-2 rounded-lg font-semibold flex items-center gap-2 ${
                  expertise === null || saving
                    ? "bg-gray-500 cursor-not-allowed"
                    : saveSuccess
                    ? "bg-green-500 text-white"
                    : "bg-[#00FFFF] text-[#031C3A] hover:bg-[#00e0e0]"
                }`}
              >
                {saving ? (
                  <>
                    <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : saveSuccess ? (
                  <>✅ Saved!</>
                ) : (
                  "Save & Continue"
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SUCCESS TOAST */}
      <div
        className={`fixed top-6 right-6 z-50 transition-all duration-500 ease-out ${
          saveSuccess
            ? "translate-x-0 opacity-100"
            : "translate-x-8 opacity-0 pointer-events-none"
        }`}
      >
        <div className="max-w-sm px-5 py-4 rounded-xl border border-green-500/60 bg-[#021B36] shadow-lg">
          <p className="text-green-300 font-semibold">✅ Onboarding completed</p>
          <p className="text-[#AFCBE3] text-sm mt-1">Redirecting in a few seconds...</p>
        </div>
      </div>
    </div>
  );
}
