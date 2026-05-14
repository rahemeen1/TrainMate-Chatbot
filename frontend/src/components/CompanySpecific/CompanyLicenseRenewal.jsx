import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import CompanyPageLoader from "./CompanyPageLoader";

export default function CompanyLicenseRenewal() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [companyData, setCompanyData] = useState(null);

  const params = new URLSearchParams(location.search);
  const companyId = params.get("companyId");

  useEffect(() => {
    const handleRenewal = async () => {
      try {
        if (!companyId) {
          throw new Error("Company ID not found in URL");
        }

        // Get company data to verify
        const companySnap = await getDoc(doc(db, "companies", companyId));
        if (!companySnap.exists()) {
          throw new Error("Company not found");
        }

        const company = companySnap.data();
        setCompanyData(company);

        // Call backend renewal endpoint
        const response = await fetch(`/api/company/${companyId}/renew-license`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to renew license");
        }

        setSuccess(true);
        setError(null);

        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          navigate("/company/dashboard", { state: { companyId } });
        }, 3000);
      } catch (err) {
        console.error("License renewal error:", err);
        setError(err.message || "Failed to renew license");
        setSuccess(false);
      } finally {
        setLoading(false);
      }
    };

    handleRenewal();
  }, [companyId, navigate]);

  if (loading) {
    return <CompanyPageLoader />;
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #EEF8FF 0%, #F7FBFF 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
    }}>
      <div style={{
        maxWidth: "500px",
        width: "100%",
        background: "#ffffff",
        borderRadius: "20px",
        border: "1px solid #D7EAF5",
        padding: "40px 30px",
        textAlign: "center",
        boxShadow: "0 10px 30px rgba(3, 28, 58, 0.08)",
      }}>
        {success ? (
          <>
            <div style={{
              width: "60px",
              height: "60px",
              margin: "0 auto 20px",
              background: "linear-gradient(135deg, #00A8B5 0%, #0087A8 100%)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M8 16L13 21L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#031C3A",
              margin: "0 0 12px",
            }}>
              License Renewed Successfully!
            </h1>
            <p style={{
              color: "#34495E",
              fontSize: "14px",
              lineHeight: "1.6",
              margin: "0 0 24px",
            }}>
              Your {companyData?.licensePlan || "license"} plan has been renewed and is now active.
            </p>
            <p style={{
              color: "#6A7D8F",
              fontSize: "13px",
              margin: "0",
            }}>
              Redirecting you to dashboard...
            </p>
          </>
        ) : (
          <>
            <div style={{
              width: "60px",
              height: "60px",
              margin: "0 auto 20px",
              background: "#FFE8E8",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 8V16M16 24H16.01" stroke="#8A1F1F" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h1 style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#8A1F1F",
              margin: "0 0 12px",
            }}>
              Renewal Failed
            </h1>
            <p style={{
              color: "#34495E",
              fontSize: "14px",
              lineHeight: "1.6",
              margin: "0 0 24px",
            }}>
              {error || "Unable to process your license renewal"}
            </p>
            <button
              onClick={() => navigate("/company/dashboard", { state: { companyId } })}
              style={{
                background: "linear-gradient(135deg, #00A8B5 0%, #0087A8 100%)",
                color: "#FFFFFF",
                border: "none",
                padding: "12px 24px",
                borderRadius: "999px",
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
                boxShadow: "0 8px 18px rgba(0, 168, 181, 0.22)",
              }}>
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
