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

