import { useEffect, useState } from "react";

export default function ViewCompanies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCompanies = async () => {
    try {
      console.log("✅ Fetching companies...");
      const res = await fetch("http://localhost:5000/api/companies");
      const data = await res.json();
      console.log("✅ Backend response:", data);

      // ✅ FIX: backend sends array directly
      setCompanies(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Error fetching companies:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // ✅ Firestore timestamp safe formatter
  const formatDate = (ts) => {
    if (!ts) return "—";
    const seconds = ts.seconds || ts._seconds;
    return seconds ? new Date(seconds * 1000).toLocaleDateString("en-GB") : "—";
  };

  const normalizeLicensePlan = (company) => {
    const rawPlan =
      company?.latestBillingPaymentPlan ||
      company?.billingPayment?.plan ||
      company?.plan ||
      company?.licensePlan ||
      "License Basic";

    const normalized = String(rawPlan).trim().toLowerCase();
    return normalized.includes("pro") ? "License Pro" : "License Basic";
  };

  const activeCompanies = companies.filter((company) => company.status === "active").length;
  const inactiveCompanies = Math.max(0, companies.length - activeCompanies);
  const basicPlanCount = companies.filter((company) => normalizeLicensePlan(company) === "License Basic").length;
  const proPlanCount = companies.filter((company) => normalizeLicensePlan(company) === "License Pro").length;

  const toDateSafe = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.toDate) return value.toDate();
    if (value?.seconds || value?._seconds) {
      const sec = value.seconds || value._seconds;
      return new Date(sec * 1000);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const getLicenseMeta = (company) => {
    const licensePlan = normalizeLicensePlan(company);
    const planLabel = licensePlan === "License Pro" ? "Pro" : "Basic";
    const billingPeriodDays = Number(company.billingPeriodDays) || 30;

    // Renewal date is based on latest billing payment createdAt + billing cycle.
    const billingPaymentCreatedAt =
      toDateSafe(company.latestBillingPaymentCreatedAt) ||
      toDateSafe(company.billingPaymentCreatedAt) ||
      toDateSafe(company.billingPayment?.createdAt);

    const normalizedRenewalDate = billingPaymentCreatedAt
      ? new Date(billingPaymentCreatedAt.getTime() + billingPeriodDays * 24 * 60 * 60 * 1000)
      : null;

    let daysRemaining = null;
    if (normalizedRenewalDate) {
      daysRemaining = Math.round(
        (startOfDay(normalizedRenewalDate).getTime() - startOfDay(new Date()).getTime()) /
          (24 * 60 * 60 * 1000)
      );
    }

    return {
      licensePlan,
      planLabel,
      renewalDate: normalizedRenewalDate,
      daysRemaining,
      isExpired: daysRemaining !== null && daysRemaining < 0,
    };
  };

  const getLicenseStatusText = (meta) => {
    if (meta.daysRemaining === null) return "Expired";
    return meta.isExpired ? "Expired" : "Valid";
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 overflow-x-hidden">
      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.18em] uppercase text-[#8EB6D3]">Company Registry</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#E8F7FF] mt-1">Registered Companies</h2>
            <p className="text-sm text-[#9FC2DA] mt-2">View all companies with core profile details and account status.</p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-[#021B36] border border-[#00FFFF30] text-[#AFCBE3]">
              Total: {companies.length}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-[#021B36] border border-[#00FFFF30] text-[#B7DCFF]">
              Basic: {basicPlanCount}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-[#021B36] border border-[#00FFFF30] text-[#8FFFF1]">
              Pro: {proPlanCount}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-[#021B36] border border-[#00FFFF30] text-green-300">
              Active: {activeCompanies}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-[#021B36] border border-[#00FFFF30] text-red-300">
              Inactive: {inactiveCompanies}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-4 sm:p-6">
        {loading ? (
          <p className="text-[#AFCBE3]">Loading companies...</p>
        ) : companies.length === 0 ? (
          <p className="text-[#AFCBE3]">No companies found.</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto rounded-lg border border-[#00FFFF30]">
              <table className="w-full text-white text-sm">
                <thead>
                  <tr className="bg-[#021B36] text-[#00FFFF]">
                    <th className="p-2 border border-[#00FFFF30]">#</th>
                    <th className="p-2 border border-[#00FFFF30] text-left">Name</th>
                    <th className="p-2 border border-[#00FFFF30] text-left">Email</th>
                    <th className="p-2 border border-[#00FFFF30] text-left">Phone</th>
                    <th className="p-2 border border-[#00FFFF30] text-left">Address</th>
                    <th className="p-2 border border-[#00FFFF30] text-left">License Plan</th>
                    <th className="p-2 border border-[#00FFFF30] text-left">Renewal Date</th>
                    <th className="p-2 border border-[#00FFFF30] text-left">License Status</th>
                    <th className="p-2 border border-[#00FFFF30] text-left">Created At</th>
                    <th className="p-2 border border-[#00FFFF30] text-left">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {companies.map((c, index) => {
                    const licenseMeta = getLicenseMeta(c);
                    return (
                    <tr key={c.id} className="hover:bg-[#00FFFF10] transition-all">
                      <td className="p-2 border border-[#00FFFF30] text-center">{index + 1}</td>
                      <td className="p-2 border border-[#00FFFF30]">{c.name}</td>
                      <td className="p-2 border border-[#00FFFF30]">{c.email}</td>
                      <td className="p-2 border border-[#00FFFF30]">{c.phone}</td>
                      <td className="p-2 border border-[#00FFFF30]">{c.address}</td>
                      <td className="p-2 border border-[#00FFFF30]">
                        <span className={`px-2 py-1 rounded text-xs border ${
                          licenseMeta.licensePlan === "License Pro"
                            ? "bg-[#00FFFF1A] border-[#00FFFF66] text-[#8FFFF1]"
                            : "bg-[#AFCBE31A] border-[#AFCBE355] text-[#CFE6FF]"
                        }`}>
                          {licenseMeta.planLabel}
                        </span>
                      </td>
                      <td className="p-2 border border-[#00FFFF30]">
                        {licenseMeta.renewalDate
                          ? licenseMeta.renewalDate.toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td className="p-2 border border-[#00FFFF30]">
                        <span className={` ${
                          licenseMeta.isExpired ? "text-[#FF9E9E]" : "text-[#8FFFF1]"
                        }`}>
                          {getLicenseStatusText(licenseMeta)}
                        </span>
                      </td>
                      <td className="p-2 border border-[#00FFFF30]">{formatDate(c.createdAt)}</td>
                      <td className="p-2 border border-[#00FFFF30]">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            c.status === "active" ? "bg-green-600" : "bg-red-600"
                          }`}
                        >
                          {c.status || "unknown"}
                        </span>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {companies.map((company, index) => {
                const licenseMeta = getLicenseMeta(company);
                return (
                <div key={company.id} className="rounded-xl border border-[#00FFFF30] bg-[#021B36] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#E8F7FF]">{index + 1}. {company.name || "—"}</p>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        company.status === "active" ? "bg-green-600" : "bg-red-600"
                      }`}
                    >
                      {company.status || "unknown"}
                    </span>
                  </div>
                  <p className="text-xs text-[#AFCBE3]"><span className="text-[#8EB6D3]">Email:</span> {company.email || "—"}</p>
                  <p className="text-xs text-[#AFCBE3]"><span className="text-[#8EB6D3]">Phone:</span> {company.phone || "—"}</p>
                  <p className="text-xs text-[#AFCBE3]"><span className="text-[#8EB6D3]">Address:</span> {company.address || "—"}</p>
                  <p className="text-xs text-[#AFCBE3]"><span className="text-[#8EB6D3]">Created:</span> {formatDate(company.createdAt)}</p>

                  <div className="rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70 p-3 space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-[#8EB6D3]">License Details</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#AFCBE3]">Plan</span>
                      <span className={`px-2 py-1 rounded text-[11px] border ${
                        licenseMeta.licensePlan === "License Pro"
                          ? "bg-[#00FFFF1A] border-[#00FFFF66] text-[#8FFFF1]"
                          : "bg-[#AFCBE31A] border-[#AFCBE355] text-[#CFE6FF]"
                      }`}>
                        {licenseMeta.planLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#AFCBE3]">Renewal</span>
                      <span className="text-xs text-[#E8F7FF]">
                        {licenseMeta.renewalDate
                          ? licenseMeta.renewalDate.toLocaleDateString("en-GB")
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#AFCBE3]">Status</span>
                      <span className={`px-2 py-1 rounded text-[11px] border border-[#00FFFF30] bg-[#031C3A]/70 ${licenseMeta.isExpired ? "text-[#FF9E9E]" : "text-[#8FFFF1]"}`}>
                        {getLicenseStatusText(licenseMeta)}
                      </span>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          </>
        )}
      </div>
        </div>

  );
}
