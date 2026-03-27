import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";

const VALID_PLANS = new Set(["License Basic", "License Pro"]);

const normalizePlan = (value) => {
  if (typeof value !== "string") return null;
  const plan = value.trim();
  return VALID_PLANS.has(plan) ? plan : null;
};

const getLatestDocData = (snap) => {
  if (snap.empty) return null;

  const docs = snap.docs.slice().sort((a, b) => {
    const aTs = a.data()?.createdAt;
    const bTs = b.data()?.createdAt;
    const aMs = aTs?.toDate ? aTs.toDate().getTime() : 0;
    const bMs = bTs?.toDate ? bTs.toDate().getTime() : 0;
    return bMs - aMs;
  });

  return docs[0]?.data() || null;
};

export const getCompanyLicensePlan = async (companyId) => {
  if (!companyId) return "License Basic";

  try {
    const billingSnap = await getDocs(collection(db, "companies", companyId, "billingPayments"));
    const latestBilling = getLatestDocData(billingSnap);
    const billingPlan = normalizePlan(latestBilling?.plan);
    if (billingPlan) return billingPlan;

    const onboardingSnap = await getDocs(collection(db, "companies", companyId, "onboardingAnswers"));
    const latestOnboarding = getLatestDocData(onboardingSnap);
    const answers = latestOnboarding?.answers || {};
    const onboardingPlan =
      normalizePlan(answers?.[2]) ||
      normalizePlan(answers?.["2"]) ||
      normalizePlan(answers?.[0]) ||
      normalizePlan(answers?.["0"]);
    if (onboardingPlan) return onboardingPlan;

    const companySnap = await getDoc(doc(db, "companies", companyId));
    const companyPlan = normalizePlan(companySnap.data()?.licensePlan);
    if (companyPlan) return companyPlan;
  } catch (err) {
    console.warn("Failed to detect company license plan:", err?.message || err);
  }

  return "License Basic";
};
