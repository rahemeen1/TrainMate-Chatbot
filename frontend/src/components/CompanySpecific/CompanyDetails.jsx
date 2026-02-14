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
        <div className="flex-1 flex items-center justify-center text-[#AFCBE3]">
          Loading company details...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />
      <div className="flex-1 p-8 max-w-5xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-[#00FFFF] text-center mb-6">Company Details</h1>

        {/* Company Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {["name", "phone", "address"].map(field => (
            <div key={field} className="p-6 rounded-xl bg-[#021B36]/80 border border-[#00FFFF30] shadow-lg">
              <label className="text-[#AFCBE3] font-semibold mb-2 block">
                {field.charAt(0).toUpperCase() + field.slice(1)}
              </label>
              <input
                type="text"
                value={companyDetails[field] || ""}
                onChange={e => setCompanyDetails({ ...companyDetails, [field]: e.target.value })}
                className="w-full p-2 rounded border border-[#00FFFF30] bg-[#021B36]/50 text-white focus:outline-none"
              />
            </div>
          ))}
        </div>

        {/* Onboarding Details */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-[#00FFFF] mb-4">Onboarding Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Training Duration */}
            <div className="p-6 rounded-xl bg-[#021B36]/80 border border-[#00FFFF30] shadow-lg">
              <label className="text-[#AFCBE3] font-semibold mb-2 block">Training Duration</label>
              <input
                type="text"
                value={onboardingAnswers[1]}
                disabled
                className="w-full p-2 rounded border border-[#00FFFF30] bg-[#021B36]/50 text-white"
              />
              <p className="text-sm text-[#AFCBE3] mt-1">Cannot be changed</p>
            </div>

            {/* Company Size */}
            <div className="p-6 rounded-xl bg-[#021B36]/80 border border-[#00FFFF30] shadow-lg">
              <label className="text-[#AFCBE3] font-semibold mb-2 block">Company Size</label>
              <select
                value={onboardingAnswers[2]}
                onChange={e => handleChange(2, e.target.value)}
                className="w-full p-2 rounded border border-[#00FFFF30] bg-[#021B36]/50 text-white focus:outline-none"
              >
                {COMPANY_SIZE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Company Description */}
            <div className="p-6 md:col-span-2 rounded-xl bg-[#021B36]/80 border border-[#00FFFF30] shadow-lg">
              <label className="text-[#AFCBE3] font-semibold mb-2 block">Company Description</label>
              <textarea
                rows={6}
                value={onboardingAnswers[3]}
                onChange={e => handleChange(3, e.target.value)}
                className="w-full p-2 rounded border border-[#00FFFF30] resize-none bg-[#021B36]/50 text-white focus:outline-none"
              />
            </div>

          </div>
        </div>

        <div className="flex justify-end">
          <button
  onClick={saveChanges}
  disabled={saving} // optional: prevent multiple clicks
  className="px-6 py-2 bg-teal-400 text-black rounded-lg font-semibold hover:opacity-90 transition"
>
  {saving ? "Saving..." : "Save All Changes"}
</button>

        </div>
      </div>
    </div>
  );
}
