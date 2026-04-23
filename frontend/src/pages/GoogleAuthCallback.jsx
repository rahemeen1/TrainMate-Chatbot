// frontend/src/pages/GoogleAuthCallback.jsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiUrl } from "../services/api";
import { storeOAuthTokens, verifyOAuthState } from "../services/googleAuthService";

export default function GoogleAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Processing Google OAuth...");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get("code");
        const state = searchParams.get("state");
        const error = searchParams.get("error");

        if (error) {
          setStatus(`OAuth error: ${error}`);
          setTimeout(() => navigate("/"), 3000);
          return;
        }

        if (!code) {
          setStatus("No authorization code received");
          setTimeout(() => navigate("/"), 3000);
          return;
        }

        if (!verifyOAuthState(state)) {
          setStatus("Invalid state parameter (CSRF protection failed)");
          setTimeout(() => navigate("/"), 3000);
          return;
        }

        setStatus("Exchanging code for tokens...");

        const response = await fetch(apiUrl("/api/auth/google-callback"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            redirectUri: `${window.location.origin}/auth/google/callback`,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to exchange authorization code");
        }

        const { tokens, userId, companyId, deptId } = await response.json();

        setStatus("Saving authentication tokens...");

        const storedSuccessfully = await storeOAuthTokens(
          userId,
          companyId,
          deptId,
          tokens
        );

        if (!storedSuccessfully) {
          throw new Error("Failed to store OAuth tokens");
        }

        setStatus("Google Calendar setup complete!");

        const dashboardState = JSON.parse(
          sessionStorage.getItem("fresherdashboardState") || "{}"
        );
        sessionStorage.removeItem("fresherdashboardState");

        setTimeout(() => {
          navigate("/fresher-dashboard", { state: dashboardState });
        }, 1500);
      } catch (err) {
        console.error("OAuth callback error:", err);
        setStatus(`Error: ${err.message}`);
        setTimeout(() => navigate("/"), 3000);
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
