import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import CompanyPageLoader from "./CompanyPageLoader";

function formatDate(value) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CompanyLicenseReview() {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);

  const companyId = params.get("companyId") || "";
  const fallbackCompanyName = params.get("companyName") || "Company";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [licenseInfo, setLicenseInfo] = useState(null);

  useEffect(() => {
    const fetchLicenseInfo = async () => {
      if (!companyId) {
        setError("Company ID is missing in the review link.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/company/${companyId}/license-info`);
        const result = await response.json();

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || "Failed to load license information");
        }

        setLicenseInfo(result);
        setError("");
      } catch (err) {
        console.error("Failed to load license review:", err);
        setError(err.message || "Unable to load license information right now.");
      } finally {
        setLoading(false);
      }
    };

    fetchLicenseInfo();
  }, [companyId]);

  if (loading) {
    return <CompanyPageLoader layout="content" message="Loading license details..." />;
  }

  const planLabel = (licenseInfo?.licensePlan || "License Basic").replace("License ", "");
  const pendingPlanLabel = (licenseInfo?.pendingLicensePlan || "").replace("License ", "");
  const companyName = licenseInfo?.companyName || fallbackCompanyName;
  const statusLabel = licenseInfo?.licenseStatus || "active";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_18%,rgba(0,255,255,0.18),transparent_34%),radial-gradient(circle_at_86%_16%,rgba(0,123,255,0.20),transparent_36%),linear-gradient(180deg,#011327_0%,#031C3A_58%,#021327_100%)] px-4 py-10 text-white">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl border border-[#00FFFF30] bg-[#021B36]/85 p-6 md:p-8 shadow-[0_14px_40px_rgba(0,255,255,0.08)]">
          <p className="text-xs uppercase tracking-[0.15em] text-[#8EB6D3]">TrainMate Billing</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-bold text-[#E8F7FF]">Review License Plan</h1>
          <p className="mt-2 text-[#AFCBE3]">Licensing snapshot for {companyName}</p>

          {error ? (
            <div className="mt-6 rounded-xl border border-[#FF9E9E66] bg-[#3A1111]/60 p-4">
              <p className="text-[#FFD5D5] font-semibold">Unable to load license details</p>
              <p className="text-[#FFD5D5] text-sm mt-1">{error}</p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#00FFFF30] bg-[#031C3A]/70 p-5">
                <p className="text-xs uppercase tracking-wide text-[#8EB6D3]">Current Plan</p>
                <p className="mt-2 text-2xl font-bold text-[#00FFFF]">{planLabel}</p>
              </div>

              <div className="rounded-xl border border-[#00FFFF30] bg-[#031C3A]/70 p-5">
                <p className="text-xs uppercase tracking-wide text-[#8EB6D3]">Renewal Date</p>
                <p className="mt-2 text-2xl font-bold text-[#E8F7FF]">{formatDate(licenseInfo?.licenseRenewalDate)}</p>
              </div>

              <div className="rounded-xl border border-[#00FFFF30] bg-[#031C3A]/70 p-5">
                <p className="text-xs uppercase tracking-wide text-[#8EB6D3]">Days Remaining</p>
                <p className="mt-2 text-2xl font-bold text-[#E8F7FF]">{typeof licenseInfo?.daysRemaining === "number" ? licenseInfo.daysRemaining : "N/A"}</p>
              </div>

              <div className="rounded-xl border border-[#00FFFF30] bg-[#031C3A]/70 p-5">
                <p className="text-xs uppercase tracking-wide text-[#8EB6D3]">Status</p>
                <p className="mt-2 text-2xl font-bold text-[#9BE9C7] capitalize">{statusLabel}</p>
              </div>

              <div className="md:col-span-2 rounded-xl border border-[#00FFFF30] bg-[#031C3A]/70 p-5">
                <p className="text-xs uppercase tracking-wide text-[#8EB6D3]">Next Renewal Plan</p>
                <p className="mt-2 text-xl font-semibold text-[#E8F7FF]">
                  {pendingPlanLabel ? pendingPlanLabel : "No change scheduled"}
                </p>
              </div>
            </div>
          )}

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <a
              href={`/company/renew-license?companyId=${encodeURIComponent(companyId)}`}
              className="inline-flex justify-center items-center px-5 py-3 rounded-xl bg-[#00FFFF] text-[#031C3A] font-semibold hover:opacity-90 transition"
            >
              Renew License Now
            </a>
            <a
              href="/license"
              className="inline-flex justify-center items-center px-5 py-3 rounded-xl border border-[#00FFFF30] bg-[#031C3A]/70 text-[#E8F7FF] font-semibold hover:border-[#00FFFF66] transition"
            >
              Compare Plans
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
