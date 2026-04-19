import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { apiUrl } from "../../services/api";
import FresherShellLayout from "./FresherShellLayout";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import axios from "axios";

export default function OnboardingPage({
  userId,
  companyId: propCompanyId,
  deptId: propDeptId,
  onFinish,
  companyName: propCompanyName,
  onboardingNotice,
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
  const [cvUploadUrl, setCvUploadUrl] = useState("");
  const [cvValidationResult, setCvValidationResult] = useState(null);
  const [cvValidationError, setCvValidationError] = useState(null);
  const [validatingCv, setValidatingCv] = useState(false);
  const [expertise, setExpertise] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const storage = getStorage();

  const normalizeValidationIssues = (issues = [], reason = "") => {
    const normalizedReason = String(reason || "").trim().toLowerCase();
    const unique = new Set();

    for (const issue of Array.isArray(issues) ? issues : []) {
      const cleaned = String(issue || "").trim();
      if (!cleaned) continue;
      if (cleaned.toLowerCase() === normalizedReason) continue;
      unique.add(cleaned);
    }

    return Array.from(unique);
  };

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

  const validateCvAndGoNext = async () => {
    if (!cvFile) {
      setSavingError("Please upload your CV first.");
      return;
    }

    try {
      setSavingError("");
      setCvValidationError(null);
      setValidatingCv(true);
      setCvUploaded(false);
      setCvUploadUrl("");
      setCvValidationResult(null);

      const extension = cvFile.name.split(".").pop();
      const storageRef = ref(storage, `cvs/${companyId}/${deptId}/${userId}.${extension}`);
      console.log("⬆️ Uploading CV to Storage:", storageRef.fullPath);
      await uploadBytes(storageRef, cvFile);
      const cvUrl = await getDownloadURL(storageRef);
      console.log("✅ CV uploaded. URL:", cvUrl);

      const validationResponse = await axios.post(apiUrl("/api/roadmap/validate-cv"), {
        cvUrl,
        trainingOn,
      });

      const validatedCv = validationResponse?.data?.cvValidation || null;

      setCvUploadUrl(cvUrl);
      setCvValidationResult(validatedCv);
      setCvUploaded(true);
      setStep(2);

      console.log("✅ CV validated at onboarding step 1:", validatedCv || {});
    } catch (validationErr) {
      const cvValidation = validationErr?.response?.data?.cvValidation;
      const reason =
        validationErr?.response?.data?.error ||
        cvValidation?.reason ||
        "Uploaded document does not look like a valid CV.";
      const issues = normalizeValidationIssues(cvValidation?.issues, reason);

      console.warn("⚠️ Onboarding CV validation failed:", { reason, cvValidation });

      setCvUploaded(false);
      setCvUploadUrl("");
      setCvValidationResult(null);
      setCvValidationError({
        title: "CV Validation Failed",
        actionText: "Uploaded file is not a valid CV. Please upload a professional CV and try again.",
      });
      setSavingError("");
    } finally {
      setValidatingCv(false);
    }
  };

  // =====================================================
  // 🔹 SAVE ONBOARDING WITH CV UPLOAD
  // =====================================================
  const saveAndContinue = async () => {
    try {
      setSaving(true);
      setSavingError("");
      setSaveSuccess(false);

      if (!cvUploaded || !cvUploadUrl) {
        setSavingError("Please validate your CV in Step 1 before continuing.");
        setSaving(false);
        return;
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
            cvUploaded: !!cvUploadUrl,
            cvValidation: {
              isValidCV: true,
              validatedAt: new Date(),
              score: cvValidationResult?.score ?? null,
              confidence: cvValidationResult?.confidence ?? null,
              classificationSource: cvValidationResult?.classificationSource || null,
              reason: cvValidationResult?.reason || "Validated during onboarding",
            },
            expertise,
            onboardingCompleted: true,
            completedAt: new Date(),
          
          },
          cvUrl: cvUploadUrl || null,
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
    <FresherShellLayout
      userId={userId}
      companyId={companyId}
      deptId={deptId}
      companyName={companyName}
      headerLabel="Onboarding"
    >
      <div className="p-4 md:p-10">
        {onboardingNotice && (
          <div className="mb-6 max-w-4xl mx-auto rounded-xl border border-yellow-400/40 bg-yellow-500/10 p-4">
            <p className="text-yellow-300 font-semibold">⚠️ CV Re-upload Required</p>
            <p className="text-[#FCEFC7] text-sm mt-1">{onboardingNotice}</p>
          </div>
        )}

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
              <h3 className="text-[#00FFFF] text-lg font-semibold mb-2">
                Upload your CV
              </h3>
              <p className="text-[#AFCBE3] text-sm mb-4">
                We'll analyze your CV to understand your current skills and experience in <span className="text-[#00FFFF] font-semibold">{trainingOn}</span>. This helps us create a personalized learning roadmap tailored to your skill gaps.
              </p>

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
                    setCvUploaded(false);
                    setCvUploadUrl("");
                    setCvValidationResult(null);
                    setCvValidationError(null);
                    setSavingError("");
                  }}
                />
              </label>

              {cvFile && (
                <p className="text-green-400 mt-2 font-medium">
                  Selected: {cvFile.name}
                </p>
              )}

              <p className="text-[#AFCBE3] text-xs italic mt-2">
                Accepted formats: .pdf, .doc, .docx
              </p>

              {cvValidationError && (
                <div className="mt-4 rounded-xl border border-red-500/50 bg-gradient-to-b from-red-500/10 to-red-600/10 p-5 text-left shadow-[0_8px_24px_rgba(239,68,68,0.12)]">
                  <p className="text-red-300 font-semibold text-base">⚠️ {cvValidationError.title || "CV Validation Failed"}</p>
                  <p className="text-[#FFD8D8] text-sm mt-3 font-semibold">
                    {cvValidationError.actionText || "Please upload a professional CV and try again."}
                  </p>
                </div>
              )}

              {cvUploaded && cvValidationResult && (
                <div className="mt-4 rounded-xl border border-green-500/50 bg-green-500/10 p-4">
                  <p className="text-green-300 font-semibold">✅ CV validated successfully</p>
                  <p className="text-[#D6FDE3] text-xs mt-1">
                    Score: {cvValidationResult?.score ?? "N/A"} | Confidence: {cvValidationResult?.confidence ?? "N/A"}
                  </p>
                </div>
              )}
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              <h3 className="text-[#00FFFF] text-lg font-semibold mb-2">
                How expert are you in <span className="text-[#00FFC2]">{trainingOn}</span>?
              </h3>
              <p className="text-[#AFCBE3] text-sm mb-6">
                Tell us your expertise level on a scale of 1-5. This helps us calibrate the difficulty of your training roadmap and provide appropriate resources for your skill level.
              </p>
              <div className="flex gap-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setExpertise(n)}
                    className={`w-12 h-12 rounded-lg font-semibold transition-all ${
                      expertise === n
                        ? "bg-[#00FFFF] text-[#031C3A] shadow-lg shadow-[#00FFFF]/50"
                        : "bg-[#021B36] border border-[#00FFFF30] hover:border-[#00FFFF]/70 text-[#AFCBE3]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[#AFCBE3] text-xs mt-4">
                1 = Beginner | 5 = Expert
              </p>
            </>
          )}

          {/* ERROR MESSAGE */}
          {savingError && !cvValidationError && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg">
              <p className="text-red-300 font-semibold">⚠️ {savingError}</p>
            </div>
          )}

          {/* NAVIGATION */}
          <div className="flex justify-between mt-10">
            {step > 1 && !saving && !validatingCv && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-5 py-2 bg-[#021B36] rounded-lg hover:bg-[#021B36]/80 transition"
              >
                ← Back
              </button>
            )}

            {step < 2 && (
              <button
                onClick={validateCvAndGoNext}
                disabled={
                  (step === 1 && !cvFile) || (step === 2 && expertise === null) || saving || validatingCv
                }
                className={`ml-auto px-6 py-2 rounded-lg font-semibold ${
                  (step === 1 && !cvFile) || (step === 2 && expertise === null) || saving || validatingCv
                    ? "bg-gray-500 cursor-not-allowed"
                    : "bg-[#00FFFF] text-[#031C3A] hover:bg-[#00e0e0]"
                }`}
              >
                {validatingCv ? "Validating CV..." : "Continue →"}
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
    </FresherShellLayout>
  );
}
