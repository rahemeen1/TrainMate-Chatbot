import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import CompanySidebar from "../../components/CompanySpecific/CompanySidebar";
import CompanyPageLoader from "../../components/CompanySpecific/CompanyPageLoader";
import { DEFAULT_LICENSING_PLANS, getLicensingPlans } from "../../services/licensingConfig";

const LICENSE_PLAN_OPTIONS = ["License Basic", "License Pro"];

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
  const [licensingPlans, setLicensingPlans] = useState(DEFAULT_LICENSING_PLANS);
  const [scheduledPlan, setScheduledPlan] = useState("License Basic");


  // Fetch company and onboarding details
  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) return;

      try {
        // 1️⃣ Company info
        const companyDoc = await getDoc(doc(db, "companies", companyId));
        if (companyDoc.exists()) {
          const companyData = companyDoc.data();
          setCompanyDetails(companyData);
          setScheduledPlan(
            companyData.pendingLicensePlan || companyData.licensePlan || "License Basic"
          );
        }

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

  useEffect(() => {
    const fetchPlanConfig = async () => {
      try {
        const data = await getLicensingPlans();
        setLicensingPlans(data);
      } catch (err) {
        console.error("Failed to load licensing plans:", err);
      }
    };

    fetchPlanConfig();
  }, []);

  const proPlanDetails = {
    title: licensingPlans.pro.name,
    subtitle: licensingPlans.pro.label,
    capacity: licensingPlans.pro.capacity,
    usdPrice: `$${licensingPlans.pro.usdPrice}/month`,
    inrPrice: `PKR ${Number(licensingPlans.pro.inrPrice).toLocaleString("en-PK")}/month`,
    features: licensingPlans.pro.includes,
  };

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

    const currentPlan = companyDetails.licensePlan || initialLicense || "License Basic";
    const normalizedScheduledPlan = scheduledPlan || currentPlan;

    const planUpdatePayload =
      normalizedScheduledPlan !== currentPlan
        ? {
            pendingLicensePlan: normalizedScheduledPlan,
            pendingChangeRequestedAt: serverTimestamp(),
            pendingChangeStatus: "scheduled",
          }
        : {
            pendingLicensePlan: deleteField(),
            pendingChangeRequestedAt: deleteField(),
            pendingChangeStatus: deleteField(),
          };

    // Update company info
    await updateDoc(doc(db, "companies", companyId), {
      name: companyDetails.name,
      phone: companyDetails.phone,
      address: companyDetails.address,
      ...planUpdatePayload,
    });

    setInitialLicense(currentPlan);
    setCompanyDetails((prev) => ({
      ...prev,
      name: companyDetails.name,
      phone: companyDetails.phone,
      address: companyDetails.address,
      pendingLicensePlan:
        normalizedScheduledPlan !== currentPlan ? normalizedScheduledPlan : undefined,
    }));

    alert(
      normalizedScheduledPlan !== currentPlan
        ? `Changes saved. Plan switch to ${normalizedScheduledPlan.replace("License ", "")} is scheduled for your next renewal.`
        : "Changes saved successfully!"
    );
  } catch (err) {
    console.error("Error saving changes:", err);
    alert("Failed to save changes.");
  } finally {
    setSaving(false); // Revert button text
  }
};


  if (loading) {
    return (
      <div className="company-page-shell flex min-h-screen">
        <div className="flex-shrink-0">
          <CompanySidebar companyId={companyId} companyName={companyName} />
        </div>
        <div className="company-main-content flex-1 min-w-0 p-6 md:p-8">
          <CompanyPageLoader layout="content" message="Loading company details..." />
        </div>
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
                    (companyDetails.licensePlan || onboardingAnswers[0] || "License Basic") === "License Pro"
                      ? "bg-[#00FFFF]/20 text-[#00FFFF]"
                      : "bg-[#7FA3BF]/20 text-[#D8ECFF]"
                  }`}>
                    {(companyDetails.licensePlan || onboardingAnswers[0] || "License Basic").replace("License ", "")} License
                  </span>
                  <p className="text-xs text-[#AFCBE3] italic">
                    Valid till {new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-[#00FFFF]/80 mt-2">Renew current plan or schedule a different plan for next renewal.</p>
                  {companyDetails.pendingLicensePlan && (
                    <p className="text-xs text-[#9BE9C7] mt-1">
                      Scheduled next cycle plan: {companyDetails.pendingLicensePlan.replace("License ", "")}
                    </p>
                  )}
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
                <label className="text-[#AFCBE3] font-semibold mb-2 block">Next Renewal Plan</label>
                <select
                  value={scheduledPlan}
                  onChange={(e) => setScheduledPlan(e.target.value)}
                  className="w-full p-2 rounded border border-[#00FFFF30] bg-[#021B36]/60 text-white focus:outline-none"
                >
                  {LICENSE_PLAN_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.replace("License ", "")}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-[#AFCBE3] mt-1">This plan will apply automatically after successful renewal payment.</p>
              </div>

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

              <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30] md:col-span-2">
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
                <h3 className="text-2xl font-bold text-[#E8F7FF] mt-1">{proPlanDetails.title}</h3>
                <p className="text-[#AFCBE3]">{proPlanDetails.subtitle}</p>
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
                <p className="text-sm font-semibold text-white mt-1">{proPlanDetails.capacity}</p>
              </div>
              <div className="rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 p-3">
                <p className="text-xs text-[#8EB6D3] uppercase">USD</p>
                <p className="text-sm font-semibold text-white mt-1">{proPlanDetails.usdPrice}</p>
              </div>
              <div className="rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 p-3">
                <p className="text-xs text-[#8EB6D3] uppercase">PKR</p>
                <p className="text-sm font-semibold text-white mt-1">{proPlanDetails.inrPrice}</p>
              </div>
            </div>

            <div className="rounded-lg border border-[#00FFFF30] bg-[#031C3A]/60 p-4 mb-5">
              <p className="text-sm font-semibold text-[#00FFFF] mb-2">Included Features</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-[#AFCBE3]">
                {proPlanDetails.features.map((feature) => (
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
