import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { doc, getDoc, collection, getDocs, updateDoc, query, orderBy, limit } from "firebase/firestore";
import CompanySidebar from "../../components/CompanySpecific/CompanySidebar";
import CompanyPageLoader from "../../components/CompanySpecific/CompanyPageLoader";

const LICENSE_PLAN_OPTIONS = ["License Basic", "License Pro"];

const PRO_PLAN_DETAILS = {
  title: "Pro",
  subtitle: "Adaptive Training Suite",
  capacity: "20 to 40 freshers",
  usdPrice: "$199/month",
  inrPrice: "Rs 52,500/month",
  features: [
    "Full quiz suite",
    "Agentic emails",
    "Google Calendar automation",
    "Weak-area roadmap",
    "Agentic scores",
    "Final unlock quiz",
    "Admin chatbot",
  ],
};

export default function CompanyDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const companyId = location?.state?.companyId || localStorage.getItem("companyId");
  const companyName = location?.state?.companyName || localStorage.getItem("companyName");

  const [loading, setLoading] = useState(true);
  const [companyDetails, setCompanyDetails] = useState({});
  const [onboardingAnswers, setOnboardingAnswers] = useState({ 0: "", 2: "", 3: "", 4: "", 5: "" });
  const [batchSize, setBatchSize] = useState("");
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [initialLicense, setInitialLicense] = useState("License Basic");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [onboardingDocId, setOnboardingDocId] = useState("");


  // Fetch company and onboarding details
  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) return;

      try {
        // 1️⃣ Company info
        const companyDoc = await getDoc(doc(db, "companies", companyId));
        if (companyDoc.exists()) setCompanyDetails(companyDoc.data());

        // 2️⃣ Fetch the latest onboardingAnswers dynamically
        const answersRef = collection(db, "companies", companyId, "onboardingAnswers");
        const q = query(answersRef, orderBy("createdAt", "desc"), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const latestDoc = snap.docs[0];
          const data = latestDoc.data();
          setOnboardingDocId(latestDoc.id);
          const answers = data.answers || {};
          setOnboardingAnswers({
            0: answers[0] || "",
            2: answers[2] || "",
            3: answers[3] || "",
            4: answers[4] || "",
            5: answers[5] || ""
          });
          setBatchSize(answers[3] || "");
          setInitialLicense(answers[0] || "License Basic");
        }

        // 3️⃣ Fetch selected departments
        const deptsRef = collection(db, "companies", companyId, "departments");
        const deptsSnap = await getDocs(deptsRef);
        const deptNames = deptsSnap.docs.map(doc => doc.data().name || doc.id);
        setSelectedDepts(deptNames);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId]);

  const handleChange = (field, value) => {
    if (field === 2 || field === 3) return; // Training Duration and Batch Size read-only

    if (field === 0 && value === "License Pro" && onboardingAnswers[0] !== "License Pro") {
      setShowUpgradeModal(true);
      return;
    }

    setOnboardingAnswers(prev => ({ ...prev, [field]: value }));
  };

  const proceedToUpgradePayment = () => {
    setShowUpgradeModal(false);
    navigate("/company-license-payment", {
      state: {
        companyId,
        companyName: companyDetails.name || companyName,
        targetLicense: "License Pro",
        onboardingDocId,
      },
    });
  };

  const saveChanges = async () => {
  setSaving(true); // Change button text
  try {
    if (initialLicense !== "License Pro" && onboardingAnswers[0] === "License Pro") {
      navigate("/company-license-payment", {
        state: {
          companyId,
          companyName: companyDetails.name || companyName,
          targetLicense: "License Pro",
          onboardingDocId,
        },
      });
      return;
    }

    // Update latest onboardingAnswers
    const answersRef = collection(db, "companies", companyId, "onboardingAnswers");
    const q = query(answersRef, orderBy("createdAt", "desc"), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const latestDocId = onboardingDocId || snap.docs[0].id;
      await updateDoc(doc(db, "companies", companyId, "onboardingAnswers", latestDocId), {
        answers: onboardingAnswers
      });
    }

    // Update company info
    await updateDoc(doc(db, "companies", companyId), {
      name: companyDetails.name,
      phone: companyDetails.phone,
      address: companyDetails.address,
      licensePlan: onboardingAnswers[0] || "License Basic"
    });

    setInitialLicense(onboardingAnswers[0] || "License Basic");

    alert("Changes saved successfully!");
  } catch (err) {
    console.error("Error saving changes:", err);
    alert("Failed to save changes.");
  } finally {
    setSaving(false); // Revert button text
  }
};


  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#031C3A] text-white">
        <CompanySidebar companyId={companyId} companyName={companyName} />
        <CompanyPageLoader message="Loading company details..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />
      <div className="flex-1 p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="rounded-2xl border border-[#00FFFF30] bg-[#021B36]/80 shadow-lg px-6 py-5 md:px-8 md:py-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-[#00FFFF]">Company Details</h1>
                <p className="text-[#AFCBE3] mt-1">Manage company profile and onboarding configuration</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="px-3 py-2 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70">
                  <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Company</p>
                  <p className="text-sm font-semibold text-white">{companyDetails.name || companyName || "N/A"}</p>
                </div>
                <div className="px-3 py-2 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70">
                  <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Status</p>
                  <p className="text-sm font-semibold text-[#00FFFF]">Active</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#00FFFF22] bg-[#021B36]/70 p-5 md:p-6">
           
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
              {["name", "phone", "address"].map(field => (
                <div key={field} className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
                  <label className="text-[#AFCBE3] font-semibold mb-2 block">
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                  </label>
                  <input
                    type="text"
                    value={companyDetails[field] || ""}
                    onChange={e => setCompanyDetails({ ...companyDetails, [field]: e.target.value })}
                    className="w-full p-2 rounded border border-[#00FFFF30] bg-[#021B36]/60 text-white focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#00FFFF22] bg-[#021B36]/70 p-5 md:p-6 space-y-5">
            <h2 className="text-xl font-semibold text-[#00FFFF]">Onboarding Details</h2>

            {/* Row 1: License Plan and Training Duration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30] flex flex-col justify-start">
                <label className="text-[#AFCBE3] font-semibold mb-3 block">Current Plan</label>
                <div className="space-y-2">
                  <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold border border-[#00FFFF] text-center block ${
                    onboardingAnswers[0] === "License Pro"
                      ? "bg-[#00FFFF]/20 text-[#00FFFF]"
                      : "bg-[#7FA3BF]/20 text-[#D8ECFF]"
                  }`}>
                    {(onboardingAnswers[0] || "License Basic").replace("License ", "")} License
                  </span>
                  <p className="text-xs text-[#AFCBE3] italic">
                    Valid till {new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-[#00FFFF]/80 mt-2">
                    You can update license after current subscription expires.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
                <label className="text-[#AFCBE3] font-semibold mb-2 block">Training Duration</label>
                <input
                  type="text"
                  value={onboardingAnswers[2]}
                  disabled
                  className="w-full p-2 rounded border border-[#00FFFF30] bg-[#021B36]/60 text-white"
                />
                <p className="text-sm text-[#AFCBE3] mt-1">Cannot be changed</p>
              </div>
            </div>

            {/* Row 2: Departments and Batch Size */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
                <label className="text-[#AFCBE3] font-semibold mb-2 block">Selected Departments</label>
                <div className="flex flex-wrap gap-2 p-2 rounded border border-[#00FFFF30] bg-[#021B36]/60 min-h-[40px]">
                  {selectedDepts.length > 0 ? (
                    selectedDepts.map(dept => (
                      <span key={dept} className="px-2 py-1 rounded bg-[#00FFFF]/20 text-[#00FFFF] text-sm">
                        {dept}
                      </span>
                    ))
                  ) : (
                    <span className="text-[#AFCBE3] text-sm">No departments selected</span>
                  )}
                </div>
                <p className="text-sm text-[#AFCBE3] mt-1">Cannot be changed</p>
              </div>

              <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
                <label className="text-[#AFCBE3] font-semibold mb-2 block">Batch Size</label>
                <input
                  type="text"
                  value={batchSize}
                  disabled
                  className="w-full p-2 rounded border border-[#00FFFF30] bg-[#021B36]/60 text-white"
                />
                <p className="text-sm text-[#AFCBE3] mt-1">Auto-selected based on plan</p>
              </div>
            </div>

            {/* Row 3: Company Description */}
            <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
              <label className="text-[#AFCBE3] font-semibold mb-2 block">Company Description</label>
              <textarea
                rows={6}
                value={onboardingAnswers[4]}
                onChange={e => handleChange(4, e.target.value)}
                className="w-full p-2 rounded border border-[#00FFFF30] resize-none bg-[#021B36]/60 text-white focus:outline-none"
              />
            </div>

            {/* Row 4: Payment Method */}
            <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
              <label className="text-[#AFCBE3] font-semibold mb-2 block">Payment Method</label>
              <input
                type="text"
                value={onboardingAnswers[5]}
                disabled
                className="w-full p-2 rounded border border-[#00FFFF30] bg-[#021B36]/60 text-white"
              />
              <p className="text-sm text-[#AFCBE3] mt-1">Cannot be changed</p>
            </div>
          </div>

          <div className="flex justify-center pt-2">
            <button
              onClick={saveChanges}
              disabled={saving}
              className="px-8 py-2.5 bg-teal-400 text-black rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save All Changes"}
            </button>
          </div>
        </div>
      </div>

      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/65 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-[#021B36] border border-[#00FFFF30] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[#8EB6D3]">Upgrade Plan</p>
                <h3 className="text-2xl font-bold text-[#E8F7FF] mt-1">{PRO_PLAN_DETAILS.title}</h3>
                <p className="text-[#AFCBE3]">{PRO_PLAN_DETAILS.subtitle}</p>
              </div>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="text-[#AFCBE3] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 p-3">
                <p className="text-xs text-[#8EB6D3] uppercase">Capacity</p>
                <p className="text-sm font-semibold text-white mt-1">{PRO_PLAN_DETAILS.capacity}</p>
              </div>
              <div className="rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 p-3">
                <p className="text-xs text-[#8EB6D3] uppercase">USD</p>
                <p className="text-sm font-semibold text-white mt-1">{PRO_PLAN_DETAILS.usdPrice}</p>
              </div>
              <div className="rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 p-3">
                <p className="text-xs text-[#8EB6D3] uppercase">INR</p>
                <p className="text-sm font-semibold text-white mt-1">{PRO_PLAN_DETAILS.inrPrice}</p>
              </div>
            </div>

            <div className="rounded-lg border border-[#00FFFF30] bg-[#031C3A]/60 p-4 mb-5">
              <p className="text-sm font-semibold text-[#00FFFF] mb-2">Included Features</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-[#AFCBE3]">
                {PRO_PLAN_DETAILS.features.map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="px-4 py-2 rounded-lg border border-[#00FFFF30] text-[#AFCBE3]"
              >
                Cancel
              </button>
              <button
                onClick={proceedToUpgradePayment}
                className="px-5 py-2 rounded-lg bg-[#00FFFF] text-[#031C3A] font-semibold"
              >
                Proceed to Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
