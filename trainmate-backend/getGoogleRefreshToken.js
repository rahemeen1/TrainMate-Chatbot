import dotenv from "dotenv";
dotenv.config();

import { google } from "googleapis";
import readline from "readline";

console.log("Google Calendar Refresh Token Generator\n");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
  process.exit(1);
}

const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

const scopes = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: scopes,
  prompt: "consent",
  include_granted_scopes: true,
  response_type: "code",
});

console.log("Open this URL in your browser:");
console.log(authUrl);
console.log(`\nUsing redirect URI: ${REDIRECT_URI}`);
console.log("\nAfter allowing, copy the code from the URL and paste here.");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Paste the authorization code here: ", async (code) => {
  rl.close();

  if (!code) {
    console.error("No code provided");
    process.exit(1);
  }

  try {
    console.log("Exchanging code for tokens...\n");

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error("Google did not return a refresh token. Remove app access from Google Account and retry with prompt=consent.");
      process.exit(1);
    }

    console.log("Add this to your .env:");
    console.log(`GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`);

    process.exit(0);
  } catch (error) {
    console.error("Failed to exchange code:", error.message);
    process.exit(1);
  }
});
