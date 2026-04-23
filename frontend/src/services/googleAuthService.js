// frontend/src/services/googleAuthService.js
import { db } from "../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
export const getGoogleRedirectUri = () =>
  process.env.REACT_APP_GOOGLE_REDIRECT_URI ||
  `${window.location.origin}/auth/google/callback`;

const OAUTH_STATE_KEY = "google_oauth_state";

const generateState = () => {
  const state = Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  return state;
};

export const verifyOAuthState = (state) => {
  const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  return Boolean(state && storedState && state === storedState);
};

export const initiateGoogleOAuth = () => {
  if (!GOOGLE_CLIENT_ID) {
    console.error("Google OAuth not configured. Check frontend/.env");
    alert("Google OAuth not configured. Check frontend/.env");
    return;
  }

  const scope = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: generateState(),
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  window.location.href = authUrl;
};

export const storeOAuthTokens = async (userId, companyId, deptId, tokens) => {
  try {
    const fresherRef = doc(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId
    );

    const fresherSnap = await getDoc(fresherRef);
    const existingRefreshToken = fresherSnap.exists()
      ? fresherSnap.data()?.googleOAuth?.refreshToken || null
      : null;
    const finalRefreshToken = tokens.refresh_token || existingRefreshToken;

    await updateDoc(fresherRef, {
      googleOAuth: {
        accessToken: tokens.access_token,
        refreshToken: finalRefreshToken,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        tokenType: tokens.token_type,
        scope: tokens.scope,
        isConnected: true,
        lastAuthError: null,
        lastAuthErrorAt: null,
      },
      googleOAuthSetupAt: new Date(),
    });

    console.log("Google OAuth tokens stored for fresher:", userId);
    return true;
  } catch (err) {
    console.error("Failed to store OAuth tokens:", err);
    return false;
  }
};

export const hasValidOAuth = async (userId, companyId, deptId) => {
  try {
    const fresherRef = doc(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId
    );

    const fresherSnap = await getDoc(fresherRef);
    if (!fresherSnap.exists()) return false;

    const data = fresherSnap.data();
    const oauth = data.googleOAuth;
    if (!oauth?.refreshToken) return false;

    const expiresAt = oauth.expiresAt?.toDate ? oauth.expiresAt.toDate() : null;
    if (!expiresAt) return false;

    return expiresAt.getTime() > Date.now();
  } catch (err) {
    console.error("OAuth validation failed:", err);
    return false;
  }
};
