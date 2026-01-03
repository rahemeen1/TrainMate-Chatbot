import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";

// fileType: "pdf" | "docx"
export const extractFileText = async (arrayBuffer, fileType) => {
  if (fileType === "pdf") {
    const pdfData = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(" ");
      fullText += pageText + "\n";
    }
    return fullText;

  } else if (fileType === "docx") {
    const result = await mammoth.extractRawText({ buffer: arrayBuffer });
    return result.value; // plain text
  } else {
    throw new Error("Unsupported file type: " + fileType);
  }
};
