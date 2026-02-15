# Email Service Setup

## Gmail App Password Configuration

To enable email functionality for roadmap generation, you need to set up a Gmail App Password.

### Steps:

1. **Go to Google Account Settings**
   - Visit: https://myaccount.google.com/
   - Navigate to **Security**

2. **Enable 2-Step Verification**
   - If not already enabled, turn on 2-Step Verification first
   - This is required for App Passwords

3. **Generate App Password**
   - Go to: https://myaccount.google.com/apppasswords
   - Select app: **Mail**
   - Select device: **Other (Custom name)**
   - Name it: **TrainMate Backend**
   - Click **Generate**
   - Copy the 16-character password (no spaces)

4. **Add to Environment Variables**
   - Create a `.env` file in the `trainmate-backend` folder if it doesn't exist
   - Add the following line:
   ```
   GMAIL_APP_PASSWORD=your_16_character_app_password_here
   ```
   - **Important**: Replace `your_16_character_app_password_here` with the actual password from step 3

### Example .env file:
```env
# Existing environment variables
GEMINI_API_KEY=your_gemini_key
COHERE_API_KEY=your_cohere_key
PINECONE_API_KEY=your_pinecone_key

# Email Configuration (NEW)
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
```

### Testing the Email Service:

After setup, when a roadmap is generated:
- User receives an email at their registered email address
- Email includes:
  - Welcome message
  - Roadmap details (training topic, module count)
  - PDF attachment with full roadmap
  - TrainMate branding

### Troubleshooting:

**Email not sending?**
- Check that `GMAIL_APP_PASSWORD` is set correctly in `.env`
- Verify 2-Step Verification is enabled on Gmail account
- Ensure the app password has no spaces
- Check user has an email field in Firestore
- Check backend logs for error messages

**Common Errors:**
- `Invalid login` → App password is incorrect or 2FA not enabled
- `User email not found` → User document in Firestore missing email field
- `ECONNREFUSED` → Network/firewall blocking Gmail SMTP (port 587)

### Security Notes:
- Never commit `.env` file to Git
- App passwords are safer than using your actual Gmail password
- You can revoke app passwords anytime from Google Account settings
- Each app password is unique to one application

### Email Service Details:
- **From**: rahemeenkamran1@gmail.com (TrainMate)
- **Service**: Gmail SMTP
- **Port**: 587 (TLS)
- **Attachments**: PDF roadmap (auto-generated)
