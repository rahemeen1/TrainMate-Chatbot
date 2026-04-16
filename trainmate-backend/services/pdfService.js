// trainmate-backend/services/pdfService.js
import PDFDocument from "pdfkit";

/**
 * Generate a PDF for the training roadmap
 * @param {Object} params - PDF generation parameters
 * @param {string} params.userName - User name
 * @param {string} params.companyName - Company name
 * @param {string} params.trainingTopic - Training topic
 * @param {Array} params.modules - Array of roadmap modules
 * @returns {Promise<Buffer>} - PDF buffer
 */
export async function generateRoadmapPDF({
  userName,
  companyName,
  trainingTopic,
  modules,
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const buffers = [];

      // Collect PDF data into buffers
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on("error", reject);

      // Helper function to add blue background to page
      const addBlueBackground = () => {
        doc.save(); // Save current state
        doc.rect(0, 0, doc.page.width, doc.page.height).fill("#031C3A");
        doc.restore(); // Restore state
      };

      // Add blue background to first page
      addBlueBackground();
      
      // Start content at proper position
      doc.y = 50;
      doc.x = 50;

      // ===== HEADER =====
      doc
        .fontSize(28)
        .fillColor("#FFFFFF")
        .text("TrainMate", { align: "center" });

      doc
        .fontSize(16)
        .fillColor("#00FFFF")
        .text("Your Personalized Training Roadmap", { align: "center" });

      doc.moveDown(2);

      // ===== USER INFO =====
      doc
        .fontSize(12)
        .fillColor("#FFFFFF")
        .text(`Trainee: ${userName}`, { align: "left" });
      doc.text(`Company: ${companyName}`, { align: "left" });
      doc.text(`Training Focus: ${trainingTopic}`, { align: "left" });
      doc.text(`Total Modules: ${modules.length}`, { align: "left" });
      doc.text(`Generated: ${new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`, { align: "left" });

      doc.moveDown(2);

      // ===== MODULES =====
      doc
        .fontSize(18)
        .fillColor("#00FFFF")
        .text("Training Modules", { underline: true });

      doc.moveDown(1);

      modules.forEach((module, index) => {
        // Check if we need a new page
        if (doc.y > 700) {
          doc.addPage();
          addBlueBackground();
          doc.y = 50; // Reset Y position after background
          doc.x = 50; // Reset X position
        }

        // Module number and title
        doc
          .fontSize(14)
          .fillColor("#00FFFF")
          .text(`${index + 1}. ${module.moduleTitle}`, { continued: false });

        doc.moveDown(0.5);

        // Module description
        doc
          .fontSize(11)
          .fillColor("#FFFFFF")
          .text(module.description || "No description provided", {
            align: "left",
            width: 500,
          });

        doc.moveDown(0.5);

        // Duration
        doc
          .fontSize(10)
          .fillColor("#CCCCCC")
          .text(`Duration: ${module.estimatedDays || "N/A"} days`, {
            continued: false,
          });

        // Skills covered
        if (module.skillsCovered && module.skillsCovered.length > 0) {
          doc.moveDown(0.3);
          doc
            .fontSize(10)
            .fillColor("#CCCCCC")
            .text(`Skills: ${module.skillsCovered.join(", ")}`, {
              width: 500,
            });
        }

        doc.moveDown(1.5);

        // Add a separator line
        if (index < modules.length - 1) {
          doc
            .strokeColor("#00FFFF")
            .lineWidth(0.5)
            .moveTo(50, doc.y)
            .lineTo(550, doc.y)
            .stroke();
          doc.moveDown(1);
        }
      });

      // ===== FOOTER =====
      doc.moveDown(3);
      doc
        .fontSize(10)
        .fillColor("#CCCCCC")
        .text("© 2026 TrainMate. All rights reserved.", { align: "center" });
      doc.fillColor("#00FFFF").text("Your AI-Powered Corporate Training Platform", {
        align: "center",
      });

      // Finalize PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate a PDF with user credentials
 * @param {Object} params - PDF generation parameters
 * @param {string} params.userName - User name
 * @param {string} params.userEmail - User email
 * @param {string} params.userId - User ID
 * @param {string} params.password - Temporary password
 * @param {string} params.companyName - Company name
 * @returns {Promise<Buffer>} - PDF buffer
 */
export async function generateUserCredentialsPDF({
  userName,
  userEmail,
  userId,
  password,
  companyName,
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      // Background
      doc.save();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill("#031C3A");
      doc.restore();

      // Header
      doc
        .fontSize(28)
        .fillColor("#00FFFF")
        .text("TrainMate", { align: "center", y: 60 });

      doc
        .fontSize(14)
        .fillColor("#E8F7FF")
        .text("Your Login Credentials", { align: "center", y: 100 });

      // Credentials section background
      const boxX = 60;
      const boxY = 160;
      const boxWidth = 475;
      const boxHeight = 200;

      doc.save();
      doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 8).fill("#0B2A4A");
      doc.restore();

      // Credentials content with proper positioning
      let yPosition = boxY + 25;
      const leftMargin = boxX + 25;

      doc.fontSize(12).fillColor("#FFFFFF");
      doc.text(`Name: ${userName}`, leftMargin, yPosition);
      yPosition += 25;
      
      doc.text(`Email: ${userEmail}`, leftMargin, yPosition);
      yPosition += 25;
      
      doc.text(`User ID: ${userId}`, leftMargin, yPosition);
      yPosition += 25;
      
      doc.text(`Company: ${companyName}`, leftMargin, yPosition);
      yPosition += 30;

      doc.fillColor("#7FFFD4").text(`Password: ${password}`, leftMargin, yPosition);

      // Instructions below the box
      doc
        .fontSize(11)
        .fillColor("#E8F7FF")
        .text(
          "Use your google account and password to login to TrainMate system to start your learning.",
          60,
          boxY + boxHeight + 40,
          {
            align: "left",
            width: 475
          }
        );

      // Footer
      doc
        .fontSize(10)
        .fillColor("#9FC2DA")
        .text("© 2026 TrainMate. All rights reserved.", 60, 700, { align: "center", width: 475 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate a PDF with completed training summary report for company admin
 * @param {Object} report - Report payload
 * @returns {Promise<Buffer>}
 */
export async function generateTrainingSummaryPDF(report = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 44, size: "A4" });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const palette = {
        bg: "#031C3A",
        accent: "#00FFFF",
        text: "#F0FAFF",
        muted: "#B9D9EA",
        line: "#1A4A74",
      };

      const addBackground = () => {
        doc.save();
        doc.rect(0, 0, doc.page.width, doc.page.height).fill(palette.bg);
        doc.restore();
      };

      const dateText = report.generatedAt
        ? new Date(report.generatedAt).toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : new Date().toLocaleString("en-US");

      const ensureSpace = (heightNeeded = 80) => {
        if (doc.y + heightNeeded > 770) {
          doc.addPage();
          addBackground();
          doc.y = 46;
          doc.x = 44;
        }
      };

      const writeKV = (label, value, valueColor = palette.text) => {
        doc.fontSize(10).fillColor(palette.muted).text(label, { continued: true });
        doc.fontSize(10).fillColor(valueColor).text(` ${value ?? "N/A"}`);
      };

      addBackground();
      doc.y = 46;
      doc.x = 44;

      doc.fontSize(24).fillColor("#FFFFFF").text("TrainMate");
      doc.fontSize(15).fillColor(palette.accent).text("Completed Training Summary Report");
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor(palette.muted).text(`Generated: ${dateText}`);

      doc.moveDown(1);
      doc.strokeColor(palette.line).lineWidth(1).moveTo(44, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      doc.fontSize(13).fillColor(palette.accent).text("Learner Profile");
      writeKV("Name:", report.userName || "N/A");
      writeKV("Email:", report.userEmail || "N/A");
      writeKV("Phone:", report.userPhone || "N/A");
      writeKV("Company:", report.companyName || "N/A");
      writeKV("Department:", report.departmentId || "N/A");
      writeKV("Training Topic:", report.trainingOn || "N/A");
      writeKV("Training Level:", report.trainingLevel || "N/A");
      writeKV("Profile Status:", report.profileStatus || "N/A");

      doc.moveDown(0.8);
      doc.fontSize(13).fillColor(palette.accent).text("Performance Summary");
      writeKV("Progress:", `${Number(report.progressPercent) || 0}%`, palette.accent);
      writeKV("Modules Completed:", `${report.completedModules || 0}/${report.totalModules || 0}`, palette.accent);
      writeKV("Total Quiz Attempts:", Number(report.totalQuizAttempts) || 0, palette.accent);
      writeKV("Average Attempts/Module:", Number(report.avgAttemptsPerModule) || 0, palette.accent);
      writeKV("Estimated Training Days:", Number(report.totalEstimatedDays) || 0);
      writeKV("Final Quiz Status:", report.finalQuizStatus || "N/A");
      writeKV("Final Quiz Score:", typeof report.finalScore === "number" ? `${report.finalScore}%` : "N/A", palette.accent);
      writeKV("Certificate:", report.certificateUnlocked ? "Unlocked" : "Locked");
      writeKV("Certificate Title:", report.certificateTitle || "N/A");

      doc.moveDown(0.8);
      doc.fontSize(13).fillColor(palette.accent).text("Training Activity Stats");
      writeKV("Active Days:", Number(report.activeDays) || 0);
      writeKV("Current Streak:", Number(report.currentStreak) || 0);
      writeKV("Missed Days:", Number(report.missedDays) || 0);
      writeKV("Expected Days:", Number(report.totalExpectedDays) || 0);

      doc.moveDown(1);
      doc.fontSize(13).fillColor(palette.accent).text("Module-wise Breakdown");
      doc.moveDown(0.4);

      const modules = Array.isArray(report.modules) ? report.modules : [];
      if (modules.length === 0) {
        doc.fontSize(10).fillColor(palette.muted).text("No modules found in report.");
      } else {
        modules.forEach((mod) => {
          ensureSpace(66);
          doc.fontSize(11).fillColor("#FFFFFF").text(`Module ${mod.order || mod.index || "-"}: ${mod.title || "Untitled"}`);
          doc.fontSize(9).fillColor(palette.muted).text(
            `Status: ${String(mod.status || "unknown")} | Completed: ${mod.completed ? "Yes" : "No"} | Quiz Passed: ${mod.quizPassed ? "Yes" : "No"}`
          );
          doc.fontSize(9).fillColor(palette.muted).text(
            `Estimated Days: ${Number(mod.estimatedDays) || 0} | Attempts: ${Number(mod.quizAttempts) || 0}`
          );
          doc.moveDown(0.4);
          doc.strokeColor(palette.line).lineWidth(0.5).moveTo(44, doc.y).lineTo(550, doc.y).stroke();
          doc.moveDown(0.6);
        });
      }

      ensureSpace(42);
      doc.moveDown(0.8);
      doc.fontSize(9).fillColor(palette.muted).text("This report is automatically generated by TrainMate after module completion milestones.", {
        align: "center",
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
