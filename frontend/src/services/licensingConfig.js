import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

const CONFIG_COLLECTION = "platformConfig";
const CONFIG_DOC = "licensingPlans";

export const DEFAULT_LICENSING_PLANS = {
  basic: {
    name: "Basic",
    label: "Core Training",
    subtitle: "For foundational cohort training",
    usdPrice: 59,
    inrPrice: 15500,
    capacity: "10 to 15 freshers",
    departments: "Up to 3 departments",
    includes: [
      "Customized roadmap with module details",
      "Email updates for training milestones",
      "Google Calendar integration",
      "Basic completion certificate",
      "Admin progress view for every fresher",
      "Shared onboarding timeline",
    ],
  },
  pro: {
    name: "Pro",
    label: "Adaptive Training Suite",
    subtitle: "For AI-assisted scale and automation",
    usdPrice: 199,
    inrPrice: 52500,
    capacity: "20 to 40 freshers",
    departments: "5+ departments",
    includes: [
      "Full quiz workflow with AI scores",
      "Agentic email nudges for cohorts",
      "Google Calendar automation",
      "Weak-area roadmap regeneration",
      "Final quiz to unlock certificates",
      "Admin chatbot for fresher details",
    ],
  },
};

const sanitizePlan = (plan, fallbackPlan) => ({
  name: (plan?.name || fallbackPlan.name || "").trim(),
  label: (plan?.label || fallbackPlan.label || "").trim(),
  subtitle: (plan?.subtitle || fallbackPlan.subtitle || "").trim(),
  usdPrice: Number.isFinite(Number(plan?.usdPrice)) ? Number(plan.usdPrice) : fallbackPlan.usdPrice,
  inrPrice: Number.isFinite(Number(plan?.inrPrice)) ? Number(plan.inrPrice) : fallbackPlan.inrPrice,
  capacity: (plan?.capacity || fallbackPlan.capacity || "").trim(),
  departments: (plan?.departments || fallbackPlan.departments || "").trim(),
  includes: Array.isArray(plan?.includes) && plan.includes.length
    ? plan.includes.map((item) => String(item).trim()).filter(Boolean)
    : fallbackPlan.includes,
});

export const normalizeLicensingPlans = (plans) => ({
  basic: sanitizePlan(plans?.basic, DEFAULT_LICENSING_PLANS.basic),
  pro: sanitizePlan(plans?.pro, DEFAULT_LICENSING_PLANS.pro),
});

export const getLicensingPlans = async () => {
  const ref = doc(db, CONFIG_COLLECTION, CONFIG_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return normalizeLicensingPlans(DEFAULT_LICENSING_PLANS);
  }

  const data = snap.data();
  return normalizeLicensingPlans(data?.plans || DEFAULT_LICENSING_PLANS);
};

export const saveLicensingPlans = async (plans) => {
  const ref = doc(db, CONFIG_COLLECTION, CONFIG_DOC);
  const normalizedPlans = normalizeLicensingPlans(plans);

  await setDoc(
    ref,
    {
      plans: normalizedPlans,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return normalizedPlans;
};

export const planKeyFromLicenseName = (licenseName) =>
  licenseName === "License Pro" ? "pro" : "basic";

export const licenseNameFromPlanKey = (planKey) =>
  planKey === "pro" ? "License Pro" : "License Basic";
