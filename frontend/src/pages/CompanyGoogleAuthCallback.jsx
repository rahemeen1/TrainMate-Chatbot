// frontend/src/pages/CompanyGoogleAuthCallback.jsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function CompanyGoogleAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Setting up Google Calendar...");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get("code");
        const state = searchParams.get("state"); // This is the companyId
        const error = searchParams.get("error");

        if (error) {
          setStatus(`OAuth error: ${error}`);
          setTimeout(() => navigate(-1), 3000);
          return;
        }

        if (!code) {
          setStatus("No authorization code received");
          setTimeout(() => navigate(-1), 3000);
          return;
        }

        if (!state) {
          setStatus("Invalid state parameter (company ID not found)");
          setTimeout(() => navigate(-1), 3000);
          return;
        }

        setStatus("Exchanging code for Google Calendar tokens...");

        const response = await fetch("/api/auth/company-google-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            code,
            companyId: state
          }),
        });

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(responseData.error || "Failed to exchange authorization code");
        }

        setStatus("Google Calendar connected successfully! ✅");

        // Go back to company dashboard to continue onboarding
        setTimeout(() => {
          navigate(-1);
        }, 1500);
      } catch (err) {
        console.error("Company Google OAuth callback error:", err);
        setStatus(`Error: ${err.message}`);
        setTimeout(() => navigate(-1), 3000);
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#031C3A] text-white">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#00FFFF] border-t-transparent" />
        <p className="text-lg font-semibold">{status}</p>
      </div>
    </div>
  );
}
