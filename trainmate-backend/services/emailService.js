import nodemailer from "nodemailer";
import dotenv from "dotenv";
import PDFDocument from "pdfkit";

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

/**
 * Send quiz proctoring security alert to company admin email
 * @param {Object} params - Email parameters
 * @param {string} params.companyEmail - Company recipient email
 * @param {string} params.companyName - Company name
 * @param {string} params.userName - User name
 * @param {string} params.userEmail - User email
 * @param {string} params.moduleTitle - Module title
 * @param {number} params.violationCount - Number of violations
 * @param {number} params.timeAwaySeconds - Last away duration in seconds
 */
export async function sendQuizSecurityAlertEmail({
  companyEmail,
  companyName,
  userName,
  userEmail,
  moduleTitle,
  violationCount,
  timeAwaySeconds,
}) {
  try {
    console.log("Email service: preparing quiz security alert...");
    const transporter = createTransporter();

    const recipientEmail = companyEmail;
    console.log(`Sending quiz security alert email to ${recipientEmail}`);

    const mailOptions = {
      from: {
        name: "TrainMate",
        address: "trainmate01@gmail.com",
      },
      to: recipientEmail,
      subject: `Quiz Security Alert - ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background-color: #031C3A; padding: 24px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #00FFFF; margin: 0; font-size: 24px;">TrainMate</h1>
          </div>
          <div style="background-color: white; padding: 24px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #031C3A; margin-top: 0;">Quiz Proctoring Security Alert</h2>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              A trainee exceeded the tab-switch threshold during an active quiz and triggered auto-submission security action.
            </p>
            <div style="background-color: #FFF5F5; padding: 16px; border-left: 4px solid #FF6B6B; margin: 16px 0;">
              <p style="margin: 6px 0; color: #333;"><strong>Company:</strong> ${companyName}</p>
              <p style="margin: 6px 0; color: #333;"><strong>User:</strong> ${userName || "Unknown"}</p>
              <p style="margin: 6px 0; color: #333;"><strong>User Email:</strong> ${userEmail || "Unknown"}</p>
              <p style="margin: 6px 0; color: #333;"><strong>Module:</strong> ${moduleTitle || "Unknown"}</p>
              <p style="margin: 6px 0; color: #333;"><strong>Violation Count:</strong> ${violationCount || "N/A"}</p>
              <p style="margin: 6px 0; color: #333;"><strong>Last Away Duration:</strong> ${typeof timeAwaySeconds === "number" ? `${timeAwaySeconds}s` : "N/A"}</p>
            </div>
            <p style="color: #333; font-size: 14px; line-height: 1.6;">
              Please review this trainee's quiz attempt and take any required action.
            </p>
            <p style="color: #666; font-size: 13px; line-height: 1.6; margin-top: 20px;">
              Regards,<br>
              <strong style="color: #031C3A;">TrainMate Team</strong>
            </p>
          </div>
          <div style="text-align: center; padding: 16px; color: #666; font-size: 12px;">
            <p>This is an automated security alert. Please do not reply.</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Quiz security alert email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Quiz security alert email failed:", error);
    throw error;
  }
}


/**
 * Send user credentials email with PDF attachment
 * @param {Object} params - Email parameters
 * @param {string} params.userEmail - Recipient email
 * @param {string} params.userName - User name
 * @param {string} params.userId - User ID
 * @param {string} params.companyName - Company name
 * @param {Buffer} params.pdfBuffer - PDF buffer
 */
export async function sendUserCredentialsEmail({
  userEmail,
  userName,
  userId,
  companyName,
  pdfBuffer,
}) {
  try {
    const transporter = createTransporter();
    const recipientEmail = userEmail;

    const mailOptions = {
      from: {
        name: "TrainMate",
        address: "trainmate01@gmail.com",
      },
      to: recipientEmail,
      subject: `Your TrainMate Login Credentials - ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background-color: #031C3A; padding: 24px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #00FFFF; margin: 0; font-size: 24px;">TrainMate</h1>
          </div>
          <div style="background-color: white; padding: 24px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #031C3A; margin-top: 0;">Welcome, ${userName}</h2>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              Your TrainMate account has been created. Please find your login credentials attached as a PDF.
            </p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              Use your google account and password to login to TrainMate system to start your learning.
            </p>
            <p style="color: #666; font-size: 13px; line-height: 1.6; margin-top: 20px;">
              User ID: ${userId}
            </p>
            <p style="color: #666; font-size: 13px; line-height: 1.6; margin-top: 8px;">
              Company: ${companyName}
            </p>
          </div>
          <div style="text-align: center; padding: 16px; color: #666; font-size: 12px;">
            <p>This is an automated message. Please do not reply.</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `TrainMate_Credentials_${userName.replace(/\s+/g, "_")}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Credentials email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Credentials email failed:", error);
    throw error;
  }
}

/**
 * Send daily module reminder email at 3pm
 * @param {Object} params - Email parameters
 * @param {string} params.userEmail - Recipient email
 * @param {string} params.userName - User name
 * @param {string} params.moduleTitle - Active module title
 * @param {string} params.companyName - Company name
 * @param {number} params.dayNumber - Day number of the module
 */
export async function sendDailyModuleReminderEmail({
  userEmail,
  userName,
  moduleTitle,
  companyName,
  dayNumber,
}) {
  try {
    console.log("📧 Sending daily module reminder email to:", userEmail);
    const transporter = createTransporter();

    const mailOptions = {
      from: {
        name: "TrainMate",
        address: "trainmate01@gmail.com",
      },
      to: userEmail,
      subject: `🎓 Daily Reminder: Continue Learning - ${moduleTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background-color: #031C3A; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #00FFFF; margin: 0; font-size: 28px;">📚 TrainMate</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #031C3A; margin-top: 0;">Hi ${userName},</h2>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              👋 This is your daily reminder to continue your learning journey!
            </p>
            
            <div style="background-color: #E8F4F8; padding: 20px; border-left: 4px solid #00FFFF; margin: 20px 0;">
              <h3 style="color: #031C3A; margin-top: 0;">📖 Your Active Module</h3>
              <p style="margin: 5px 0; color: #333; font-size: 18px;">
                <strong>${moduleTitle}</strong>
              </p>
              <p style="margin: 5px 0; color: #666;">
                Day ${dayNumber} | ${companyName}
              </p>
            </div>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Keep up the great work! 💪 Consistent learning is the key to mastering new skills.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:3000" style="background-color: #00FFFF; color: #031C3A; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Continue Learning →
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
              Best regards,<br>
              <strong style="color: #031C3A;">TrainMate Team</strong><br>
              Your AI-Powered Corporate Training Platform
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">© 2024 TrainMate. All rights reserved.</p>
            <p style="margin: 5px 0;">You're receiving this because you're enrolled in training at ${companyName}.</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Daily module reminder email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Daily module reminder email failed:", error);
    throw error;
  }
}

/**
 * Send quiz unlock notification email
 * @param {Object} params - Email parameters
 * @param {string} params.userEmail - Recipient email
 * @param {string} params.userName - User name
 * @param {string} params.moduleTitle - Module title
 * @param {string} params.companyName - Company name
 * @param {string} params.quizDeadline - Quiz deadline (formatted string)
 */
export async function sendQuizUnlockEmail({
  userEmail,
  userName,
  moduleTitle,
  companyName,
  quizDeadline,
}) {
  try {
    console.log("📧 Sending quiz unlock email to:", userEmail);
    const transporter = createTransporter();

    const mailOptions = {
      from: {
        name: "TrainMate",
        address: "trainmate01@gmail.com",
      },
      to: userEmail,
      subject: `✅ Quiz Unlocked: ${moduleTitle} - Action Required!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background-color: #031C3A; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #00FFFF; margin: 0; font-size: 28px;">🎯 TrainMate</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #031C3A; margin-top: 0;">Hi ${userName},</h2>
            
            <div style="text-align: center; padding: 20px; background-color: #E8FCE8; border-radius: 10px; margin: 20px 0;">
              <h2 style="color: #00AA00; margin: 0; font-size: 24px;">🎉 Quiz Unlocked!</h2>
            </div>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Great news! Your quiz for <strong>${moduleTitle}</strong> has been unlocked and is ready for you to attempt.
            </p>
            
            <div style="background-color: #FFF3CD; padding: 20px; border-left: 4px solid #FFC107; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">⏰ Important: Time-Limited</h3>
              <p style="margin: 5px 0; color: #856404; font-size: 16px;">
                <strong>Attempt your quiz within the given timeframe</strong> to progress to the next module.
              </p>
              ${quizDeadline ? `<p style="margin: 10px 0 5px 0; color: #856404;">Deadline: <strong>${quizDeadline}</strong></p>` : ''}
            </div>
            
            <div style="background-color: #E8F4F8; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="color: #031C3A; margin-top: 0;">📝 Quiz Details</h3>
              <p style="margin: 5px 0; color: #333;">
                <strong>Module:</strong> ${moduleTitle}
              </p>
              <p style="margin: 5px 0; color: #333;">
                <strong>Company:</strong> ${companyName}
              </p>
            </div>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              📊 Test your knowledge and demonstrate what you've learned. Good luck! 🍀
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:3000" style="background-color: #00FFFF; color: #031C3A; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
                Take Quiz Now →
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
              Best regards,<br>
              <strong style="color: #031C3A;">TrainMate Team</strong><br>
              Your AI-Powered Corporate Training Platform
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">© 2024 TrainMate. All rights reserved.</p>
            <p style="margin: 5px 0;">You're receiving this because you're enrolled in training at ${companyName}.</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Quiz unlock email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Quiz unlock email failed:", error);
    throw error;
  }
}

/**
 * Send admin regenerated roadmap email
 */
export async function sendAdminRegeneratedRoadmapEmail({
  userEmail,
  userName,
  moduleTitle,
  companyName,
  companyEmail,
}) {
  try {
    console.log("📧 Sending admin regenerated roadmap email to:", userEmail);
    const transporter = createTransporter();

    const mailOptions = {
      from: {
        name: companyName || "Learning Admin",
        address: "trainmate01@gmail.com",
      },
      replyTo: companyEmail || "trainmate01@gmail.com",
      to: userEmail,
      subject: `🔄 Your Roadmap Has Been Regenerated - ${moduleTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background-color: #031C3A; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #00FFFF; margin: 0; font-size: 28px;">🔄 ${companyName || "Learning Program"}</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #031C3A; margin-top: 0;">Hi ${userName},</h2>
            
            <div style="text-align: center; padding: 20px; background-color: #E8F4F8; border-radius: 10px; margin: 20px 0;">
              <h2 style="color: #0066CC; margin: 0; font-size: 24px;">🎯 Roadmap Regenerated!</h2>
            </div>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Your admin has regenerated your learning roadmap based on your recent progress and identified weaknesses.
            </p>
            
            <div style="background-color: #E8FCE8; padding: 20px; border-left: 4px solid #00AA00; margin: 20px 0;">
              <h3 style="color: #00AA00; margin-top: 0;">✨ What's New?</h3>
              <p style="margin: 5px 0; color: #333;">
                Your new roadmap for <strong>${moduleTitle}</strong> has been personalized to focus on areas that need improvement.
              </p>
              <p style="margin: 10px 0 5px 0; color: #333;">
                This is an opportunity to strengthen your skills with a customized learning path!
              </p>
            </div>
            
            <div style="background-color: #FFF3CD; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">⏭️ Next Steps</h3>
              <ul style="color: #856404; margin: 10px 0; padding-left: 20px;">
                <li>Review your updated roadmap</li>
                <li>Start with the new module content</li>
                <li>Complete practice exercises</li>
                <li>Prepare for your upcoming quiz</li>
              </ul>
            </div>
            
            <div style="background-color: #E8F4F8; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="color: #031C3A; margin-top: 0;">📋 Details</h3>
              <p style="margin: 5px 0; color: #333;">
                <strong>Module:</strong> ${moduleTitle}
              </p>
              <p style="margin: 5px 0; color: #333;">
                <strong>Company:</strong> ${companyName}
              </p>
            </div>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              This regeneration shows that your admin is invested in your learning success. Use this opportunity to master the skills! 💪
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:3000" style="background-color: #00FFFF; color: #031C3A; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
                View Updated Roadmap →
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
              Best regards,<br>
              <strong style="color: #031C3A;">${companyName} - Learning & Development Team</strong>
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">© 2024 ${companyName}. All rights reserved.</p>
            <p style="margin: 5px 0;">You're receiving this because you're enrolled in the learning program at ${companyName}.</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Admin regenerated roadmap email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Admin regenerated roadmap email failed:", error);
    throw error;
  }
}

/**
 * Send admin granted quiz attempts email
 */
export async function sendAdminGrantedAttemptsEmail({
  userEmail,
  userName,
  moduleTitle,
  attemptsGranted,
  companyName,
  companyEmail,
}) {
  try {
    console.log("📧 Sending admin granted attempts email to:", userEmail);
    const transporter = createTransporter();

    const mailOptions = {
      from: {
        name: companyName || "Learning Admin",
        address: "trainmate01@gmail.com",
      },
      replyTo: companyEmail || "trainmate01@gmail.com",
      to: userEmail,
      subject: `✅ Your Quiz Attempts Have Been Granted - ${moduleTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background-color: #031C3A; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #00FFFF; margin: 0; font-size: 28px;">✅ ${companyName || "Learning Program"}</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #031C3A; margin-top: 0;">Hi ${userName},</h2>
            
            <div style="text-align: center; padding: 20px; background-color: #E8FCE8; border-radius: 10px; margin: 20px 0;">
              <h2 style="color: #00AA00; margin: 0; font-size: 24px;">🎉 Additional Attempts Granted!</h2>
            </div>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Good news! Your admin has granted you additional attempts for the quiz on <strong>${moduleTitle}</strong>.
            </p>
            
            <div style="background-color: #E8FCE8; padding: 20px; border-left: 4px solid #00AA00; margin: 20px 0;">
              <h3 style="color: #00AA00; margin-top: 0;">📊 Your Quiz Status</h3>
              <p style="margin: 5px 0; color: #333; font-size: 18px;">
                <strong>Attempts Granted:</strong> <span style="color: #00AA00; font-size: 24px;">${attemptsGranted}</span>
              </p>
              <p style="margin: 10px 0 5px 0; color: #333;">
                This is your opportunity to improve your score. Make the most of it!
              </p>
            </div>
            
            <div style="background-color: #FFF3CD; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">⏭️ What to Do Next</h3>
              <ul style="color: #856404; margin: 10px 0; padding-left: 20px;">
                <li>Review the module content once more</li>
                <li>Practice with the exercise materials</li>
                <li>Take the quiz when you're ready</li>
                <li>Aim to improve your previous score</li>
              </ul>
            </div>
            
            <div style="background-color: #E8F4F8; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="color: #031C3A; margin-top: 0;">📋 Details</h3>
              <p style="margin: 5px 0; color: #333;">
                <strong>Module:</strong> ${moduleTitle}
              </p>
              <p style="margin: 5px 0; color: #333;">
                <strong>Company:</strong> ${companyName}
              </p>
            </div>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Your admin believes in your potential! Use these attempts to demonstrate your knowledge and move forward. 💪
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:3000" style="background-color: #00FFFF; color: #031C3A; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
                Take Quiz Now →
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
              Best regards,<br>
              <strong style="color: #031C3A;">${companyName} - Learning & Development Team</strong>
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">© 2024 ${companyName}. All rights reserved.</p>
            <p style="margin: 5px 0;">You're receiving this because you're enrolled in the learning program at ${companyName}.</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Admin granted attempts email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Admin granted attempts email failed:", error);
    throw error;
  }
}

/**
 * Generate company credentials PDF
 */
function generateCredentialsPDF(companyName, companyEmail, tempPassword) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on("error", reject);

      // Background
      doc.save();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill("#031C3A");
      doc.restore();

      // Header
      doc
        .fontSize(28)
        .fillColor("#00FFFF")
        .text("TrainMate", { align: "center", y: 50 });

      doc
        .fontSize(14)
        .fillColor("#ffffff")
        .text("Company Login Credentials", { align: "center", y: 90 });

      // Welcome section
      doc
        .fontSize(11)
        .fillColor("#E8F7FF")
        .text(
          `Welcome to TrainMate, ${companyName}!`,
          50,
          150,
          { width: 500 }
        );

      doc.moveTo(50, 190).lineTo(550, 190).stroke("#00FFFF");

      // Credentials section with dark blue background
      doc.save();
      doc.rect(40, 200, 520, 140).fill("#031C3A");
      doc.restore();

      doc
        .fontSize(12)
        .fillColor("#00FFFF")
        .text("Login Credentials", 50, 210);

      doc
        .fontSize(11)
        .fillColor("#ffffff");

      doc.text("Email Address:", 50, 240);
      doc
        .fontSize(10)
        .fillColor("#7FFFD4")
        .text(companyEmail, 70, 260, { underline: false });

      doc
        .fontSize(11)
        .fillColor("#ffffff")
        .text("Temporary Password:", 50, 290);
      doc
        .fontSize(10)
        .fillColor("#7FFFD4")
        .text(tempPassword, 70, 310, { underline: false });

      // Instructions
      doc.moveTo(50, 350).lineTo(550, 350).stroke("#00FFFF");

      doc
        .fontSize(12)
        .fillColor("#00FFFF")
        .text("Important Instructions", 50, 370);

      doc
        .fontSize(10)
        .fillColor("#E8F7FF");

      const instructions = [
        "1. Log in using the email and password above",
        "2. Change your password on first login (highly recommended)",
        "3. Complete the onboarding process to set up your company profile",
        "4. According to your active plan, you will have access to all systems",
        "5. Contact support if you need any assistance",
      ];

      let yPosition = 395;
      instructions.forEach((instruction) => {
        doc.text(instruction, 60, yPosition);
        yPosition += 20;
      });

      // Footer
      doc.moveTo(50, 560).lineTo(550, 560).stroke("#00FFFF");

      doc
        .fontSize(9)
        .fillColor("#9FC2DA")
        .text(
          "This document contains sensitive information. Keep it secure and do not share.",
          50,
          580,
          { align: "center", width: 500 }
        );

      doc
        .fontSize(8)
        .fillColor("#7FA3BF")
        .text(`Generated on ${new Date().toLocaleDateString()}`, 50, 700, {
          align: "center",
          width: 500,
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Send company credentials email
 */
export async function sendCompanyCredentialsEmail({
  companyEmail,
  companyName,
  tempPassword,
}) {
  try {
    console.log("📧 Sending company credentials email to:", companyEmail);
    const transporter = createTransporter();

    // Generate credentials PDF
    const credentialsPDF = await generateCredentialsPDF(
      companyName,
      companyEmail,
      tempPassword
    );

    const mailOptions = {
      from: {
        name: "TrainMate Admin",
        address: "trainmate01@gmail.com",
      },
      to: companyEmail,
      subject: `🎯 Welcome to TrainMate, ${companyName}! - Your Account Credentials`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background-color: #031C3A; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #00FFFF; margin: 0; font-size: 32px;">🎓 Welcome to TrainMate</h1>
            <p style="color: #7FFFD4; margin: 10px 0 0 0; font-size: 16px;">AI-Powered Corporate Training Platform</p>
          </div>
          
          <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #031C3A; margin: 0 0 10px 0; font-size: 26px;">Welcome to the TrainMate Family, ${companyName}!</h2>
            
            <p style="color: #555; font-size: 16px; line-height: 1.8; margin: 15px 0;">
              We're thrilled to have you on board! We're excited to help your team grow through personalized, AI-powered training experiences. Our platform is designed to make corporate learning engaging, efficient, and results-driven.
            </p>
            
            <div style="text-align: center; padding: 20px; background-color: #E8FCE8; border-radius: 10px; margin: 25px 0;">
              <h2 style="color: #00AA00; margin: 0; font-size: 24px;">✅ Your Account is Ready!</h2>
              <p style="color: #333; margin: 10px 0 0 0; font-size: 14px;">Complete details are securely attached as a PDF</p>
            </div>
            
            <div style="background-color: #FFF3CD; padding: 20px; border-left: 4px solid #FF9800; margin: 25px 0;">
              <h3 style="color: #856404; margin: 0 0 10px 0;"><strong>🔐 Security First - Your Credentials</strong></h3>
              <p style="margin: 0; color: #333; font-size: 14px; line-height: 1.6;">
                For your security, we've attached a PDF file containing your complete login credentials. This PDF is encrypted and should be stored securely. Please download and save it in a safe location.
              </p>
            </div>
            
            <div style="background-color: #E3F2FD; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #2196F3;">
              <h3 style="color: #1565C0; margin: 0 0 15px 0;"><strong>📋 Getting Started - The Onboarding Process</strong></h3>
              <p style="color: #333; margin: 0 0 15px 0; font-size: 14px;">
                Before you can start using the TrainMate system, you'll need to:
              </p>
              <ol style="color: #333; margin: 10px 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                <li><strong>Log in</strong> using your email and password from the attached PDF</li>
                <li><strong>Change your password</strong> on first login (we highly recommend this for security)</li>
                <li><strong>Complete the onboarding process</strong> - This will help us understand your company's needs and set up your profile</li>
                <li><strong>Review your active plan</strong> - Different plans unlock different features and capabilities</li>
              </ol>
            </div>
            
            <div style="background-color: #F3E5F5; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #9C27B0;">
              <h3 style="color: #6A1B9A; margin: 0 0 15px 0;"><strong>🎯 Plan-Based Access</strong></h3>
              <p style="color: #333; margin: 0; font-size: 14px; line-height: 1.8;">
                According to your active plan, you will have access to specific features and modules. During onboarding, you'll see exactly which systems and tools are available to your organization. Our support team can help you upgrade your plan at any time if you need additional features.
              </p>
            </div>
            
            <div style="background-color: #FFF3E0; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #FF6F00;">
              <h3 style="color: #E65100; margin: 0 0 15px 0;"><strong>💡 Tips for Success</strong></h3>
              <ul style="color: #333; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                <li>After login, customize your company profile to reflect your organization's values</li>
                <li>Invite your team members and assign them to learning programs</li>
                <li>Set up departments if needed for better organization</li>
                <li>Explore the analytics dashboard to track progress in real-time</li>
              </ul>
            </div>
            
            <div style="background-color: #E0F2F1; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #009688;">
              <h3 style="color: #00695C; margin: 0 0 15px 0;"><strong>🌟 We'd Love Your Feedback</strong></h3>
              <p style="color: #333; margin: 0 0 10px 0; font-size: 14px; line-height: 1.8;">
                Your success is our success! As you explore TrainMate, please don't hesitate to share your feedback, suggestions, or any challenges you encounter. Your insights help us continuously improve the platform to better serve you.
              </p>
              <p style="color: #333; margin: 10px 0 0 0; font-size: 14px;">
                <strong>Email us at:</strong> feedback@trainmate.com or support@trainmate.com
              </p>
            </div>
            
           
            <hr style="border: none; border-top: 2px solid #00FFFF; margin: 30px 0;">
            
            <p style="color: #666; font-size: 14px; line-height: 1.8; margin: 20px 0;">
              Best of luck! We're excited to be part of your organization's learning journey. 🎓<br><br>
              <strong style="color: #031C3A;">Warm regards,<br>The TrainMate Team</strong><br>
              <span style="color: #9C9C9C;">AI-Powered Corporate Training Platform</span>
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
            <p style="margin: 5px 0;">© 2024 TrainMate. All rights reserved.</p>
            <p style="margin: 5px 0;">This is an automated message. For inquiries, please contact support@trainmate.com</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `${companyName}_TrainMate_Credentials.pdf`,
          content: credentialsPDF,
          contentType: "application/pdf",
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Company credentials email sent with PDF attachment:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Company credentials email failed:", error);
    throw error;
  }
}
