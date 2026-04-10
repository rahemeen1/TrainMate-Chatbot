// trainmate-backend/controllers/googleAuthController.js
import { google } from "googleapis";
import { db } from "../config/firebase.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `${process.env.FRONTEND_URL}/auth/google/callback`;
const COMPANY_GOOGLE_REDIRECT_URI =
  process.env.COMPANY_GOOGLE_REDIRECT_URI ||
  `${process.env.FRONTEND_URL}/auth/company-google-callback`;

console.log("Google OAuth config:", {
  clientId: GOOGLE_CLIENT_ID ? "SET" : "MISSING",
  clientSecret: GOOGLE_CLIENT_SECRET ? "SET" : "MISSING",
  redirectUri: GOOGLE_REDIRECT_URI || "MISSING",
  companyRedirectUri: COMPANY_GOOGLE_REDIRECT_URI || "MISSING",
});

/**
 * POST /api/auth/google-callback
 * Exchange Google OAuth authorization code for tokens
 */
export const googleOAuthCallback = async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({ error: "No authorization code provided" });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res
        .status(500)
        .json({ error: "Google OAuth credentials not configured" });
    }

    const exchangeRedirectUri =
      redirectUri ||
      GOOGLE_REDIRECT_URI ||
      `${process.env.FRONTEND_URL}/auth/google/callback`;

    console.log("Exchanging Google authorization code for tokens...");
    console.log("Redirect URI:", exchangeRedirectUri);

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      exchangeRedirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    console.log("Google OAuth token received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expiry_date,
    });

    const oauth2 = google.oauth2("v2");
    oauth2Client.setCredentials(tokens);

    const userinfo = await oauth2.userinfo.get({ auth: oauth2Client });
    const googleEmail = userinfo.data.email;

    console.log("Google user email:", googleEmail);

    const freshersQuery = db
      .collectionGroup("users")
      .where("email", "==", googleEmail);
    const fresherSnap = await freshersQuery.get();

    if (fresherSnap.empty) {
      return res
        .status(404)
        .json({ error: "Fresher record not found with this email" });
    }

    const fresherDoc = fresherSnap.docs[0];
    const userId = fresherDoc.id;
    const deptDoc = fresherDoc.ref.parent.parent;
    const companyDoc = deptDoc?.parent?.parent;
    const deptId = deptDoc?.id;
    const companyId = companyDoc?.id;

    if (!companyId || !deptId) {
      return res.status(400).json({ error: "Invalid fresher hierarchy" });
    }

    const fresherRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId);

    const existingFresherSnap = await fresherRef.get();
    const existingRefreshToken = existingFresherSnap.data()?.googleOAuth?.refreshToken || null;
    const finalRefreshToken = tokens.refresh_token || existingRefreshToken;

    await fresherRef.update({
      googleOAuth: {
        accessToken: tokens.access_token,
        refreshToken: finalRefreshToken,
        expiresAt: new Date(tokens.expiry_date),
        scope: tokens.scope,
        isConnected: true,
        lastAuthError: null,
        lastAuthErrorAt: null,
      },
      googleOAuthSetupAt: new Date(),
      googleCalendarEmail: googleEmail,
    });

    console.log("OAuth tokens stored for fresher:", userId);

    return res.json({
      success: true,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: finalRefreshToken,
        expires_in: Math.floor((tokens.expiry_date - Date.now()) / 1000),
        token_type: tokens.token_type,
        scope: tokens.scope,
      },
      userId,
      companyId,
      deptId,
      message: "Google OAuth setup complete",
    });
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return res
      .status(500)
      .json({ error: err.message || "OAuth token exchange failed" });
  }
};

/**
 * GET /api/auth/company-google-auth-url
 * Generate Google OAuth authorization URL for company admin
 */
export const generateCompanyGoogleAuthUrl = (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res
        .status(500)
        .json({ error: "Google OAuth credentials not configured" });
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      COMPANY_GOOGLE_REDIRECT_URI
    );

    const scopes = [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      state: companyId, // Pass companyId in state for verification
      prompt: "consent", // Force consent to get refresh token
      include_granted_scopes: true,
    });

    console.log("✅ Generated Google Auth URL for company:", companyId);

    res.json({
      authUrl,
      companyId,
      message: "Redirect user to this URL to authorize Google Calendar",
    });
  } catch (error) {
    console.error("❌ Failed to generate company Google auth URL:", error);
    res.status(500).json({
      error: error.message || "Failed to generate authorization URL",
    });
  }
};

/**
 * POST /api/auth/company-google-callback
 * Exchange authorization code for company admin and store tokens
 */
export const companyGoogleOAuthCallback = async (req, res) => {
  try {
    const { code, companyId } = req.body;

    if (!code || !companyId) {
      return res.status(400).json({
        error: "Authorization code and company ID are required",
      });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res
        .status(500)
        .json({ error: "Google OAuth credentials not configured" });
    }

    console.log("Exchanging Google authorization code for company:", companyId);

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      COMPANY_GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    console.log("✅ Google OAuth token received for company:", {
      companyId,
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expiry_date,
    });

    // Get company email for verification
    const oauth2 = google.oauth2("v2");
    oauth2Client.setCredentials(tokens);

    const userinfo = await oauth2.userinfo.get({ auth: oauth2Client });
    const googleEmail = userinfo.data.email;

    console.log("Google account email:", googleEmail);

    // Preserve existing refresh token if Google does not resend it
    const companyRef = db.collection("companies").doc(companyId);
    const existingCompanySnap = await companyRef.get();
    const existingRefreshToken = existingCompanySnap.data()?.googleOAuth?.refreshToken || null;
    const finalRefreshToken = tokens.refresh_token || existingRefreshToken;

    // Store OAuth tokens in company document
    await companyRef.update({
      googleOAuth: {
        accessToken: tokens.access_token,
        refreshToken: finalRefreshToken,
        expiresAt: new Date(tokens.expiry_date),
        scope: tokens.scope,
        isConnected: true,
        lastAuthError: null,
        lastAuthErrorAt: null,
      },
      googleOAuthSetupAt: new Date(),
      googleCalendarEmail: googleEmail,
    });

    console.log("✅ OAuth tokens stored for company:", companyId);

    return res.json({
      success: true,
      companyId,
      googleEmail,
      message: "Company Google Calendar connected successfully",
    });
  } catch (err) {
    console.error("❌ Company Google OAuth callback error:", err);
    return res
      .status(500)
      .json({ error: err.message || "OAuth token exchange failed" });
  }
};
