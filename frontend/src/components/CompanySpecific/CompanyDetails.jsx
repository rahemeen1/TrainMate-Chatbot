import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { db } from "../../firebase";
import { doc, getDoc, collection, getDocs, updateDoc, query, orderBy, limit } from "firebase/firestore";
import CompanySidebar from "../../components/CompanySpecific/CompanySidebar";

const COMPANY_SIZE_OPTIONS = ["Small (5-10)", "Medium (10-20)", "Large (20+)"];

export default function CompanyDetails() {
  const location = useLocation();
  const companyId = location?.state?.companyId || localStorage.getItem("companyId");
  const companyName = location?.state?.companyName || localStorage.getItem("companyName");

  const [loading, setLoading] = useState(true);
  const [companyDetails, setCompanyDetails] = useState({});
  const [onboardingAnswers, setOnboardingAnswers] = useState({ 1: "", 2: "", 3: "" });
  const [saving, setSaving] = useState(false);


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
          const answers = latestDoc.data().answers || {};
          setOnboardingAnswers({
            1: answers[1] || "",
            2: answers[2] || "",
            3: answers[3] || ""
          });
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId]);

  const handleChange = (field, value) => {
    if (field === 1) return; // Training Duration read-only
    setOnboardingAnswers(prev => ({ ...prev, [field]: value }));
  };

  const saveChanges = async () => {
  setSaving(true); // Change button text
  try {
    // Update latest onboardingAnswers
    const answersRef = collection(db, "companies", companyId, "onboardingAnswers");
    const q = query(answersRef, orderBy("createdAt", "desc"), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const latestDocId = snap.docs[0].id;
      await updateDoc(doc(db, "companies", companyId, "onboardingAnswers", latestDocId), {
        answers: onboardingAnswers
      });
    }

    // Update company info
    await updateDoc(doc(db, "companies", companyId), {
      name: companyDetails.name,
      phone: companyDetails.phone,
      address: companyDetails.address
    });

    alert("✅ Changes saved successfully!");
  } catch (err) {
    console.error("Error saving changes:", err);
    alert("❌ Failed to save changes.");
  } finally {
    setSaving(false); // Revert button text
  }
};


  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#031C3A] text-white">
        <CompanySidebar companyId={companyId} companyName={companyName} />
        <div className="flex-1 p-8 md:p-10">
          <div className="max-w-6xl mx-auto rounded-2xl border border-[#00FFFF22] bg-[#021B36]/60 backdrop-blur-sm p-8 flex items-center justify-center min-h-[300px] text-[#AFCBE3]">
            Loading company details...
          </div>
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
                <h1 className="text-3xl font-bold text-[#00FFFF]">Company Dashboard</h1>
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
            <h2 className="text-xl font-semibold text-[#00FFFF] mb-4">Company Details</h2>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
                <label className="text-[#AFCBE3] font-semibold mb-2 block">Training Duration</label>
                <input
                  type="text"
                  value={onboardingAnswers[1]}
                  disabled
                  className="w-full p-2 rounded border border-[#00FFFF30] bg-[#021B36]/60 text-white"
                />
                <p className="text-sm text-[#AFCBE3] mt-1">Cannot be changed</p>
              </div>

              <div className="p-4 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
                <label className="text-[#AFCBE3] font-semibold mb-2 block">Company Size</label>
                <select
                  value={onboardingAnswers[2]}
                  onChange={e => handleChange(2, e.target.value)}
                  className="w-full p-2 rounded border border-[#00FFFF30] bg-[#021B36]/60 text-white focus:outline-none"
                >
                  {COMPANY_SIZE_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="p-4 md:col-span-2 rounded-xl bg-[#031C3A]/70 border border-[#00FFFF30]">
                <label className="text-[#AFCBE3] font-semibold mb-2 block">Company Description</label>
                <textarea
                  rows={6}
                  value={onboardingAnswers[3]}
                  onChange={e => handleChange(3, e.target.value)}
                  className="w-full p-2 rounded border border-[#00FFFF30] resize-none bg-[#021B36]/60 text-white focus:outline-none"
                />
              </div>
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
    </div>
  );
}
