import { collection, getDocs, query, orderBy, limit, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const DAY_MS = 24 * 60 * 60 * 1000;

export const toDateSafe = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const normalizePlan = (value) => {
  if (value === "License Pro") return "License Pro";
  return "License Basic";
};

const deriveRenewalDate = (companyData, billingData) => {
  const explicitRenewal =
    toDateSafe(billingData?.renewalDate) ||
    toDateSafe(billingData?.nextRenewalDate) ||
    toDateSafe(billingData?.licenseRenewalDate) ||
    toDateSafe(companyData?.licenseRenewalDate) ||
    toDateSafe(companyData?.nextRenewalDate);

  if (explicitRenewal) return explicitRenewal;

  const baseDate =
    toDateSafe(billingData?.createdAt) ||
    toDateSafe(companyData?.upgradedAt) ||
    toDateSafe(companyData?.createdAt);

  if (!baseDate) return null;

  const billingPeriodDays =
    Number(billingData?.billingPeriodDays) ||
    Number(companyData?.billingPeriodDays) ||
    30;

  return new Date(baseDate.getTime() + billingPeriodDays * DAY_MS);
};

const getLatestBillingData = async (companyId) => {
  try {
    const billingRef = collection(db, "companies", companyId, "billingPayments");
    const billingSnap = await getDocs(query(billingRef, orderBy("createdAt", "desc"), limit(1)));

    if (!billingSnap.empty) {
      return billingSnap.docs[0].data();
    }

    return null;
  } catch (err) {
    return null;
  }
};

export const getCompanyLicenseStatus = async (companyId) => {
  if (!companyId) {
    return {
      plan: "License Basic",
      renewalDate: null,
      daysRemaining: null,
      isExpired: false,
      statusLabel: "Unknown",
    };
  }

  const companySnap = await getDoc(doc(db, "companies", companyId));
  const companyData = companySnap.exists() ? companySnap.data() : {};
  const billingData = await getLatestBillingData(companyId);

  const plan = normalizePlan(
    billingData?.plan || companyData?.licensePlan || "License Basic"
  );

  const renewalDate = deriveRenewalDate(companyData, billingData);

  if (!renewalDate) {
    return {
      plan,
      renewalDate: null,
      daysRemaining: null,
      isExpired: false,
      statusLabel: "Renewal date not set",
    };
  }

  const now = startOfDay(new Date());
  const renewal = startOfDay(renewalDate);
  const daysRemaining = Math.round((renewal.getTime() - now.getTime()) / DAY_MS);
  const isExpired = daysRemaining < 0;

  return {
    plan,
    renewalDate,
    daysRemaining,
    isExpired,
    statusLabel: isExpired ? "Expired" : "Active",
  };
};
