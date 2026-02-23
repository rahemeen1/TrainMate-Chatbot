// trainmate-backend/services/emailService.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * Create email transporter using Gmail
 */
function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "trainmate01@gmail.com",
      pass: process.env.GMAIL_APP_PASSWORD, // App password, not regular password
    },
    // For testing behind proxies with SSL inspection
    tls: {
      rejectUnauthorized: false,
    },
  });
}

/**
 * Send roadmap generation email with PDF attachment
 * @param {Object} params - Email parameters
 * @param {string} params.userEmail - Recipient email
 * @param {string} params.userName - User name
 * @param {string} params.companyName - Company name
 * @param {string} params.trainingTopic - Training topic
 * @param {number} params.moduleCount - Number of modules
 * @param {Buffer} params.pdfBuffer - PDF file buffer
 */
export async function sendRoadmapEmail({
  userEmail,
  userName,
  companyName,
  trainingTopic,
  moduleCount,
  pdfBuffer,
}) {
  try {
    console.log("📧 Email service: preparing transporter and message...");
    const transporter = createTransporter();

    // Use actual recipient email
    const recipientEmail = userEmail;
    console.log(`📧 Sending email to ${recipientEmail}`);

    const mailOptions = {
      from: {
        name: "TrainMate",
        address: "trainmate01@gmail.com",
      },
      to: recipientEmail,
      subject: `Your Training Roadmap Has Been Generated - ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background-color: #031C3A; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #00FFFF; margin: 0; font-size: 28px;">🎓 TrainMate</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #031C3A; margin-top: 0;">Hi ${userName},</h2>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Great news! Your personalized training roadmap for <strong>${companyName}</strong> has been successfully generated.
            </p>
            
            <div style="background-color: #E8F4F8; padding: 20px; border-left: 4px solid #00FFFF; margin: 20px 0;">
              <h3 style="color: #031C3A; margin-top: 0;">📋 Roadmap Details</h3>
              <p style="margin: 5px 0; color: #333;">
                <strong>Training Focus:</strong> ${trainingTopic}
              </p>
              <p style="margin: 5px 0; color: #333;">
                <strong>Total Modules:</strong> ${moduleCount}
              </p>
              <p style="margin: 5px 0; color: #333;">
                <strong>Company:</strong> ${companyName}
              </p>
            </div>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Your roadmap has been tailored to your skills and experience. Please find the detailed roadmap attached as a PDF.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="#" style="background-color: #00FFFF; color: #031C3A; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Start Your Training
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
              Best regards,<br>
              <strong style="color: #031C3A;">TrainMate Team</strong><br>
              Your AI-Powered Corporate Training Platform
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p>© 2026 TrainMate. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `TrainMate_Roadmap_${userName.replace(/\s+/g, "_")}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email sending failed:", error);
    throw error;
  }
}

/**
 * Send training locked notification to company email
 * @param {Object} params - Email parameters
 * @param {string} params.companyEmail - Company recipient email
 * @param {string} params.companyName - Company name
 * @param {string} params.userName - User name
 * @param {string} params.userEmail - User email
 * @param {string} params.moduleTitle - Module title
 * @param {number} params.attemptNumber - Attempt number
 * @param {number} params.score - Latest score
 */
export async function sendTrainingLockedEmail({
  companyEmail,
  companyName,
  userName,
  userEmail,
  moduleTitle,
  attemptNumber,
  score,
}) {
  try {
    console.log("Email service: preparing training lock notification...");
    const transporter = createTransporter();

    const recipientEmail = companyEmail;
    console.log(`Sending training lock email to ${recipientEmail}`);

    const mailOptions = {
      from: {
        name: "TrainMate",
        address: "trainmate01@gmail.com",
      },
      to: recipientEmail,
      subject: `Training Locked Alert - ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background-color: #031C3A; padding: 24px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #00FFFF; margin: 0; font-size: 24px;">TrainMate</h1>
          </div>
          <div style="background-color: white; padding: 24px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #031C3A; margin-top: 0;">Training Locked Notification</h2>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              A trainee has been locked after multiple quiz attempts. Please review and decide next steps.
            </p>
            <div style="background-color: #E8F4F8; padding: 16px; border-left: 4px solid #00FFFF; margin: 16px 0;">
              <p style="margin: 6px 0; color: #333;"><strong>Company:</strong> ${companyName}</p>
              <p style="margin: 6px 0; color: #333;"><strong>User:</strong> ${userName || "Unknown"}</p>
              <p style="margin: 6px 0; color: #333;"><strong>User Email:</strong> ${userEmail || "Unknown"}</p>
              <p style="margin: 6px 0; color: #333;"><strong>Module:</strong> ${moduleTitle || "Unknown"}</p>
              <p style="margin: 6px 0; color: #333;"><strong>Attempt:</strong> ${attemptNumber || "N/A"}</p>
              <p style="margin: 6px 0; color: #333;"><strong>Latest Score:</strong> ${typeof score === "number" ? `${score}%` : "N/A"}</p>
            </div>
            <p style="color: #333; font-size: 14px; line-height: 1.6;">
              Please contact the trainee and unlock training once ready.
            </p>
            <p style="color: #666; font-size: 13px; line-height: 1.6; margin-top: 20px;">
              Regards,<br>
              <strong style="color: #031C3A;">TrainMate Team</strong>
            </p>
          </div>
          <div style="text-align: center; padding: 16px; color: #666; font-size: 12px;">
            <p>This is an automated message. Please do not reply.</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Training lock email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Training lock email failed:", error);
    throw error;
  }
}
