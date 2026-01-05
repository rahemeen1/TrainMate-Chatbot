import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";

/**
 * Detect file type using magic bytes
 */
const detectFileTypeFromBuffer = (buffer) => {
  const bytes = new Uint8Array(buffer);

  // %PDF
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "pdf";
  }

  // DOCX = ZIP (PK)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return "docx";
  }

  return "unknown";
};

/**
 * Extract text from PDF or DOCX safely
 */
export const extractFileText = async (arrayBuffer, hintedType = "unknown") => {
  console.log("[FILE-PARSE] Started");

  if (!arrayBuffer || arrayBuffer.byteLength < 500) {
    throw new Error("CV file is empty or too small to be valid");
  }

  const detectedType = detectFileTypeFromBuffer(arrayBuffer);

  console.log("[FILE-PARSE] Hinted type:", hintedType);
  console.log("[FILE-PARSE] Detected type:", detectedType);

  const fileType =
    detectedType !== "unknown" ? detectedType : hintedType;

  console.log("[FILE-PARSE] Final file type:", fileType);

  try {
    /* ========================= PDF ========================= */
    if (fileType === "pdf") {
      console.log("[FILE-PARSE] Parsing PDF");

      const pdfData = new Uint8Array(arrayBuffer);
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;

      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(" ");
        fullText += pageText + "\n";
      }

      if (!fullText.trim()) {
        throw new Error("PDF contains no readable text (possibly scanned)");
      }

      console.log("[FILE-PARSE] PDF parsing completed");
      return fullText;
    }

    /* ========================= DOCX ========================= */
    if (fileType === "docx") {
      console.log("[FILE-PARSE] Parsing DOCX");

      const result = await mammoth.extractRawText({
        buffer: arrayBuffer,
      });

      if (!result.value || !result.value.trim()) {
        throw new Error("DOCX contains no readable text");
      }

      console.log("[FILE-PARSE] DOCX parsing completed");
      return result.value;
    }

    /* ========================= BLOCK ========================= */
    throw new Error(
      "Unsupported or invalid CV file. Must be PDF or DOCX."
    );

  } catch (error) {
    console.error("[FILE-PARSE][ERROR]", error.message);
    throw error;
  }
};
