// frontend/src/pages/CompanyGoogleAuthCallback.jsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiUrl } from "../services/api";

export default function CompanyGoogleAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Setting up Google Calendar...");
  const [errorType, setErrorType] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get("code");
        const state = searchParams.get("state"); // This is the companyId
        const error = searchParams.get("error");

        if (error) {
          if (error === "access_denied") {
            setErrorType("access_denied");
            setStatus("Access Denied - App Not Verified");
            return;
          }
          setStatus(`OAuth error: ${error}`);
          setTimeout(() => navigate(-1), 5000);
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

        const response = await fetch(apiUrl("/api/auth/company-google-callback"), {
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

        // Go back to company dashboard
        setTimeout(() => {
          navigate("/CompanySpecific/CompanyDashboard", {
            state: { 
              companyId: state,
              calendarConnected: true 
            }
          });
        }, 1500);
      } catch (err) {
        console.error("Company Google OAuth callback error:", err);
        setStatus(`Error: ${err.message}`);
        setTimeout(() => navigate(-1), 3000);
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  if (errorType === "access_denied") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#02142B] via-[#031C3A] to-[#04354E] text-white p-6">
        <div className="max-w-2xl bg-[#021B36]/90 border border-[#00FFFF]/30 rounded-2xl p-8 shadow-[0_0_40px_rgba(0,255,255,0.2)]">
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-4xl">🚫</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Access Denied</h1>
            <p className="text-lg text-[#AFCBE3]">TrainMate hasn't completed Google verification</p>
          </div>

          <div className="bg-[#00FFFF]/10 border border-[#00FFFF]/30 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-[#00FFFF] mb-3">Why did this happen?</h2>
            <p className="text-[#AFCBE3] mb-4">
              Our app is currently in <strong>testing mode</strong> with Google. Only pre-approved test users can connect their Google Calendar.
            </p>
            <p className="text-[#AFCBE3]">
              Your email address needs to be added as a test user by our development team.
            </p>
          </div>

          <div className="bg-[#031C3A]/70 border border-[#00FFFF]/20 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">📧 Request Access</h2>
            <ol className="space-y-3 text-[#AFCBE3]">
              <li className="flex items-start gap-2">
                <span className="text-[#00FFFF] font-bold">1.</span>
                <span>Contact our support team at: <strong className="text-[#00FFFF]">trainmate01@gmail.com</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#00FFFF] font-bold">2.</span>
                <span>Provide your Google email address (the one you used to sign in)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#00FFFF] font-bold">3.</span>
                <span>We'll add you as a test user within 1 business day</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#00FFFF] font-bold">4.</span>
                <span>Try connecting your calendar again after approval</span>
              </li>
            </ol>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <h3 className="text-yellow-400 font-semibold mb-1">Production Launch Coming Soon</h3>
                <p className="text-sm text-[#AFCBE3]">
                  We're working on completing Google's verification process. Once approved, any email will work automatically.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => window.open('mailto:trainmate01@gmail.com?subject=Google Calendar Access Request&body=Hi, I need access to connect my Google Calendar. My email is: ', '_blank')}
              className="flex-1 px-6 py-3 bg-[#00FFFF] text-[#031C3A] font-semibold rounded-lg hover:opacity-90 transition"
            >
              📧 Email Support
            </button>
            <button
              onClick={() => navigate(-1)}
              className="flex-1 px-6 py-3 bg-[#021B36] border border-[#00FFFF]/30 text-white font-semibold rounded-lg hover:bg-[#032A4A] transition"
            >
              ← Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#031C3A] text-white">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#00FFFF] border-t-transparent" />
        <p className="text-lg font-semibold">{status}</p>
      </div>
    </div>
  );
}
