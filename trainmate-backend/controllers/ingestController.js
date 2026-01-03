//ingestController.js
import { ingestDocAsync } from "../services/ingestService.js";

export const ingestDocumentController = async (req, res) => {
  console.log("📥 [INGEST] API HIT /api/ingest/document");

  try {
    console.log("📦 [INGEST] Raw req.body:", req.body);

    const { fileUrl, companyId, deptName, docId, fileName } = req.body;

    console.log("🔍 [INGEST] Parsed Fields:");
    console.log("➡ fileUrl:", fileUrl);
    console.log("➡ companyId:", companyId);
    console.log("➡ deptName:", deptName);
    console.log("➡ docId:", docId);
    console.log("➡ fileName:", fileName);

    // 🔴 Validation
    if (!fileUrl || !companyId || !docId) {
      console.error("❌ [INGEST] Missing required fields");

      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        received: { fileUrl, companyId, docId },
      });
    }

    console.log("🚀 [INGEST] Starting background ingestion...");

    ingestDocAsync({
      fileUrl,
      companyId,
      deptName,
      docId,
      fileName,
    })
      .then(() => {
        console.log(`✅ [INGEST] SUCCESS for docId=${docId}`);
      })
      .catch((err) => {
        console.error("❌ [INGEST] Background ingest failed:");
        console.error(err);
      });

    // ✅ Immediate response to frontend
    return res.json({
      success: true,
      message: "Document ingestion started",
      docId,
    });
  } catch (error) {
    console.error("🔥 [INGEST] Controller crashed:");
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error during ingestion",
      error: error.message,
    });
  }
};
