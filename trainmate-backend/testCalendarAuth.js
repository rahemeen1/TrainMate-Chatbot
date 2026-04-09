import dotenv from "dotenv";
dotenv.config();

import { google } from "googleapis";

console.log("Google Calendar OAuth Credentials Test\n");

function testOAuthCredentials() {
  console.log("Validating OAuth credentials\n");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  console.log("Checking credentials presence:");
  console.log(`GOOGLE_CLIENT_ID: ${clientId ? "SET" : "MISSING"}`);
  console.log(`GOOGLE_CLIENT_SECRET: ${clientSecret ? "SET" : "MISSING"}`);
  console.log(`GOOGLE_REFRESH_TOKEN: ${refreshToken ? "SET" : "MISSING"}`);
  console.log(`GOOGLE_CALENDAR_ID: ${calendarId}\n`);

  if (!clientId || !clientSecret || !refreshToken) {
    console.error("Missing required OAuth credentials");
    return false;
  }

  try {
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    google.calendar({ version: "v3", auth: oAuth2Client });
    console.log("OAuth2 client created successfully\n");
    return true;
  } catch (error) {
    console.error("Failed to authenticate:", error.message);
    return false;
  }
}

async function testCalendarAccess() {
  console.log("Checking Google Calendar access\n");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.log("Skipping - credentials not set\n");
    return false;
  }

  try {
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    console.log("Fetching calendars...\n");
    const calendarList = await calendar.calendarList.list();

    if (calendarList.data.items && calendarList.data.items.length > 0) {
      console.log("Connected to Google Calendar API\n");
      calendarList.data.items.forEach((cal, index) => {
        console.log(`${index + 1}. ${cal.summary} (ID: ${cal.id})`);
      });
      console.log("\n");
      return true;
    }

    console.log("No calendars found\n");
    return false;
  } catch (error) {
    const status = error?.code || error?.status || error?.response?.status;
    const details = error?.response?.data || error?.errors || null;
    console.error("Failed to access Google Calendar:", error.message);
    if (status) {
      console.error("Status:", status);
    }
    if (details) {
      console.error("Details:", JSON.stringify(details));
    }
    return false;
  }
}

async function runTests() {
  console.log("Starting Google Calendar credential tests...\n");

  const credentialsValid = testOAuthCredentials();

  if (credentialsValid) {
    const accessValid = await testCalendarAccess();

    console.log("Test Results Summary");
    console.log(`OAuth Credentials: ${credentialsValid ? "VALID" : "INVALID"}`);
    console.log(`Calendar Access: ${accessValid ? "ACCESSIBLE" : "NOT ACCESSIBLE"}`);

    process.exit(credentialsValid && accessValid ? 0 : 1);
  } else {
    console.log("OAuth Credentials: INVALID");
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
