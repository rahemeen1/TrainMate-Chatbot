

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import CompanyShellLayout from "./CompanyShellLayout";
import {
  DEFAULT_LICENSING_PLANS,
  getLicensingPlans,
  planKeyFromLicenseName,
} from "../../services/licensingConfig";

const hashString = async (value) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export default function CompanyLicensePayment() {
  const location = useLocation();
  const navigate = useNavigate();

  const companyId = location?.state?.companyId || localStorage.getItem("companyId");
  const companyName = location?.state?.companyName || localStorage.getItem("companyName") || "Company";
  const onboardingDocId = location?.state?.onboardingDocId || "";
  const targetLicense = location?.state?.targetLicense || "License Basic";
  const returnTo = location?.state?.returnTo || "/CompanySpecific/CompanyDetails";

  const [plans, setPlans] = useState(DEFAULT_LICENSING_PLANS);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const data = await getLicensingPlans();
        setPlans(data);
      } catch (err) {
        console.error("Failed to load licensing plans:", err);
      }
    };

    fetchPlans();
  }, []);

  const selectedPlanKey = planKeyFromLicenseName(targetLicense);
  const selectedPlan = plans[selectedPlanKey] || plans.basic;

  const [form, setForm] = useState({
    cardHolderName: "",
    cardNumber: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
  });
  const [processing, setProcessing] = useState(false);

  const formattedCardNumber = useMemo(() => {
    const digits = form.cardNumber.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  }, [form.cardNumber]);

  const handleFieldChange = (field, value) => {
    if (field === "cardNumber") {
      setForm((prev) => ({ ...prev, cardNumber: value.replace(/\s/g, "") }));
      return;
    }

    if (field === "cvv") {
      setForm((prev) => ({ ...prev, cvv: value.replace(/\D/g, "").slice(0, 4) }));
      return;
    }

    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePayment = async () => {
    if (!companyId) {
      alert("Company context missing. Please login again.");
      return;
    }

    const normalizedCard = form.cardNumber.replace(/\D/g, "");

    if (
      !form.cardHolderName.trim() ||
      normalizedCard.length < 12 ||
      !form.expiryMonth ||
      !form.expiryYear ||
      form.cvv.length < 3
    ) {
      alert("Please fill valid payment details.");
      return;
    }

    setProcessing(true);
    try {
      const companyDocRef = doc(db, "companies", companyId);
      const companySnap = await getDoc(companyDocRef);
      const companyData = companySnap.exists() ? companySnap.data() : {};

      const pendingLicense =
        companyData?.pendingLicensePlan === "License Pro" || companyData?.pendingLicensePlan === "License Basic"
          ? companyData.pendingLicensePlan
          : null;

      const effectiveLicense = pendingLicense || targetLicense;
      const effectivePlanKey = planKeyFromLicenseName(effectiveLicense);
      const effectivePlan = plans[effectivePlanKey] || plans.basic;

      const billingPeriodDays = 30;
      const renewalDate = new Date(Date.now() + billingPeriodDays * 24 * 60 * 60 * 1000);
      const cardHash = await hashString(normalizedCard);
      const paymentFingerprint = await hashString(
        `${companyId}|${normalizedCard}|${form.expiryMonth}|${form.expiryYear}`
      );

      await addDoc(collection(db, "companies", companyId, "billingPayments"), {
        plan: effectiveLicense,
        amountUsd: effectivePlan.usdPrice,
        amountInr: effectivePlan.inrPrice,
        currency: "USD/PKR",
        status: "success",
        cardHolderName: form.cardHolderName.trim(),
        cardLast4: normalizedCard.slice(-4),
        cardHash,
        paymentFingerprint,
        expiryMonth: form.expiryMonth,
        expiryYear: form.expiryYear,
        provider: "internal-demo",
        billingPeriodDays,
        renewalDate,
        createdAt: serverTimestamp(),
      });

      let targetOnboardingDocId = onboardingDocId;
      if (!targetOnboardingDocId) {
        const answersRef = collection(db, "companies", companyId, "onboardingAnswers");
        const answersSnap = await getDocs(query(answersRef, orderBy("createdAt", "desc"), limit(1)));
        if (!answersSnap.empty) {
          targetOnboardingDocId = answersSnap.docs[0].id;
        }
      }

      if (targetOnboardingDocId) {
        const onboardingDocRef = doc(db, "companies", companyId, "onboardingAnswers", targetOnboardingDocId);
        const onboardingDocSnap = await getDoc(onboardingDocRef);
        const prevAnswers = onboardingDocSnap.exists() ? onboardingDocSnap.data()?.answers || {} : {};

        await updateDoc(onboardingDocRef, {
          answers: {
            ...prevAnswers,
            0: effectiveLicense,
            2: effectiveLicense,
          },
        });
      }

      await updateDoc(companyDocRef, {
        licensePlan: effectiveLicense,
        billingPeriodDays,
        licenseRenewalDate: renewalDate,
        licenseStatus: "active",
        upgradedAt: serverTimestamp(),
        pendingLicensePlan: deleteField(),
        pendingChangeRequestedAt: deleteField(),
        pendingChangeStatus: deleteField(),
        pendingChangeEffectiveAt: deleteField(),
      });

      alert(`✅ Payment successful. Your ${effectiveLicense.replace("License ", "")} plan is now active.`);
      navigate(returnTo, {
        state: { companyId, companyName },
        replace: true,
      });
    } catch (err) {
      console.error("Payment failed:", err);
      alert("❌ Payment failed. Please try again.");
    } finally {
      setProcessing(false);
      setForm((prev) => ({ ...prev, cvv: "" }));
    }
  };

  return (
    <CompanyShellLayout companyId={companyId} companyName={companyName} headerLabel="License Payment" contentClassName="text-white">
      <div>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="rounded-2xl bg-[#021B36]/80 border border-[#00FFFF30] p-6">
            <p className="text-xs text-[#8EB6D3] uppercase tracking-[0.14em]">Secure Upgrade</p>
            <h1 className="text-3xl font-bold text-[#E8F7FF] mt-1">Activate {selectedPlan.name} License</h1>
            <p className="text-[#AFCBE3] mt-2">{selectedPlan.label}</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#031C3A]/70 border border-[#00FFFF30]">
                <p className="text-xs text-[#8EB6D3] uppercase">USD</p>
                <p className="text-lg font-semibold text-[#E8F7FF]">${selectedPlan.usdPrice}/month</p>
              </div>
              <div className="p-3 rounded-lg bg-[#031C3A]/70 border border-[#00FFFF30]">
                <p className="text-xs text-[#8EB6D3] uppercase">PKR</p>
                <p className="text-lg font-semibold text-[#E8F7FF]">PKR {selectedPlan.inrPrice.toLocaleString("en-PK")}/month</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-[#021B36]/75 border border-[#00FFFF30] p-6 space-y-4">
            <h2 className="text-xl font-semibold text-[#00FFFF]">Card Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm text-[#AFCBE3] mb-1 block">Cardholder Name</label>
                <input
                  type="text"
                  value={form.cardHolderName}
                  onChange={(e) => handleFieldChange("cardHolderName", e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-white focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm text-[#AFCBE3] mb-1 block">Card Number</label>
                <input
                  type="text"
                  value={formattedCardNumber}
                  onChange={(e) => handleFieldChange("cardNumber", e.target.value)}
                  maxLength={19}
                  className="w-full p-2.5 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-sm text-[#AFCBE3] mb-1 block">Expiry Month (MM)</label>
                <input
                  type="text"
                  value={form.expiryMonth}
                  onChange={(e) => handleFieldChange("expiryMonth", e.target.value.replace(/\D/g, "").slice(0, 2))}
                  className="w-full p-2.5 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-sm text-[#AFCBE3] mb-1 block">Expiry Year (YY)</label>
                <input
                  type="text"
                  value={form.expiryYear}
                  onChange={(e) => handleFieldChange("expiryYear", e.target.value.replace(/\D/g, "").slice(0, 2))}
                  className="w-full p-2.5 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-sm text-[#AFCBE3] mb-1 block">CVV</label>
                <input
                  type="password"
                  value={form.cvv}
                  onChange={(e) => handleFieldChange("cvv", e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 text-white focus:outline-none"
                />
              </div>
            </div>

            <p className="text-xs text-[#AFCBE3]">
              For security, raw card number and CVV are never stored. Only hashed card fingerprint and last 4 digits are saved.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 rounded-lg border border-[#00FFFF30] text-[#AFCBE3]"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={processing}
                className="px-5 py-2 rounded-lg bg-[#00FFFF] text-[#031C3A] font-semibold disabled:opacity-70"
              >
                {processing ? "Processing..." : "Pay & Continue"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </CompanyShellLayout>
  );
}
