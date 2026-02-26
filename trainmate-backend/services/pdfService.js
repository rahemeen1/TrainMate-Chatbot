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

      doc
        .fontSize(26)
        .fillColor("#031C3A")
        .text("TrainMate", { align: "center" });

      doc
        .fontSize(14)
        .fillColor("#00FFFF")
        .text("Your Login Credentials", { align: "center" });

      doc.moveDown(2);

      doc.fontSize(12).fillColor("#333");
      doc.text(`Name: ${userName}`);
      doc.text(`Email: ${userEmail}`);
      doc.text(`User ID: ${userId}`);
      doc.text(`Company: ${companyName}`);
      doc.moveDown(1);
      doc.text(`Password: ${password}`);

      doc.moveDown(2);
      doc
        .fontSize(11)
        .fillColor("#555")
        .text(
          "Use your google account and password to login to TrainMate system to start your learning.",
          {
            align: "left",
          }
        );

      doc.moveDown(3);
      doc
        .fontSize(10)
        .fillColor("#999")
        .text("© 2026 TrainMate. All rights reserved.", { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
