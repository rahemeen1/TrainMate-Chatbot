import { generateUserCredentialsPDF } from "../../services/pdfService.js";
import { sendUserCredentialsEmail } from "../../services/emailService.js";

export const sendUserCredentials = async (req, res) => {
  try {
    const { userName, userEmail, userId, password, companyName } = req.body;

    if (!userName || !userEmail || !userId || !password || !companyName) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const pdfBuffer = await generateUserCredentialsPDF({
      userName,
      userEmail,
      userId,
      password,
      companyName,
    });

    await sendUserCredentialsEmail({
      userName,
      userEmail,
      userId,
      companyName,
      pdfBuffer,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Failed to send credentials email:", err);
    return res.status(500).json({ message: err.message });
  }
};
