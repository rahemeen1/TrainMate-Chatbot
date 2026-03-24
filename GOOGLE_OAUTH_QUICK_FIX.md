# Google OAuth "Access Denied" - Quick Fix Guide

## ⚡ The Problem
Error 403: `access_denied` - TrainMate has not completed the Google verification process.

## 🎯 Why This Happens
Your OAuth app is in **TESTING MODE**. Google only allows pre-approved "test users" to authenticate.

---

## 🚀 Quick Solutions (Pick One)

### Option 1: Add Test Users Manually (5 minutes)
**Best for**: Testing with specific users

1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Select your project
3. Scroll to **"Test users"** section
4. Click **"+ ADD USERS"**
5. Enter email addresses (one per line)
6. Click **SAVE**

**Test immediately** - no restart needed!

---

### Option 2: Publish App (1-4 weeks)
**Best for**: Production launch - allows ANY user

**Follow the full guide**: `GOOGLE_OAUTH_PUBLISH_GUIDE.md`

**Quick steps**:
1. Complete OAuth consent screen (privacy policy, terms, logo)
2. Click **"PUBLISH APP"** button
3. Submit for Google verification
4. Wait 1-4 weeks for approval

---

## 📋 What We Did

### 1. ✅ Improved Error Handling
- Shows clear error page when access is denied
- Provides step-by-step instructions
- Allows users to email support directly

### 2. ✅ Updated UI
- Dashboard shows calendar prompt after onboarding
- Success message when calendar connects
- Better OAuth flow with state management

### 3. ✅ Created Documentation
- Full publishing guide: `GOOGLE_OAUTH_PUBLISH_GUIDE.md`
- This quick reference guide

---

## 🧪 For Development (Right Now)

### Add Your Test Email
```
1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Find "Test users" section
3. Add your email: auroradynamics83@gmail.com
4. Try OAuth again - should work immediately
```

### Check Configuration
Your `.env` file should have settings like:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
COMPANY_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/company-google-callback
```

---

## 📧 Support Email Template

When users contact you, use this response:

```
Subject: Google Calendar Access Approved

Hi [User],

I've added your email as a test user in our Google OAuth application.

You can now connect your Google Calendar:
1. Go to your TrainMate dashboard
2. Click "Connect Google Calendar"
3. Sign in with: [their email]
4. Accept the permissions

This will work immediately - no need to wait!

Best regards,
TrainMate Team
```

---

## 🎯 Production Checklist

Before submitting for verification:

- [ ] Privacy Policy page created
- [ ] Terms of Service page created
- [ ] App logo (120x120 px) uploaded
- [ ] Application home page configured
- [ ] Demo video recorded (5 min)
- [ ] OAuth consent screen fully filled
- [ ] Scopes properly documented
- [ ] Domain ownership verified

**Then**: Click "PUBLISH APP" and submit!

---

## ⏱️ Expected Timelines

| Action | Time |
|--------|------|
| Add test user | Instant |
| Test OAuth flow | 1 minute |
| Prepare for publishing | 1-2 days |
| Google verification review | 1-4 weeks |
| Production access | After approval |

---

## 🔗 Helpful Links

- **Google Cloud Console**: https://console.cloud.google.com
- **OAuth Consent Screen**: https://console.cloud.google.com/apis/credentials/consent
- **Google Calendar API**: https://developers.google.com/calendar
- **Verification Guide**: https://support.google.com/cloud/answer/9110914

---

## ❓ FAQ

**Q: Can I have unlimited test users?**
A: No, maximum 100 test users in testing mode.

**Q: Do test users cost money?**
A: No, adding test users is completely free.

**Q: How long until test users can access?**
A: Immediately after adding them.

**Q: Is there a workaround?**
A: No. You must either add test users OR publish the app.

**Q: What about service accounts?**
A: Service accounts can't access user calendars without domain-wide delegation (Google Workspace only).

---

## 🎉 Current Status

- ✅ Error handling improved
- ✅ User instructions added
- ✅ OAuth redirect configured correctly
- ⚠️ App in TESTING mode
- ⏳ Need to publish for production

**Next step**: Add test users OR submit for verification

---

**Questions?** Email: trainmate01@gmail.com
