import { extractFileText } from "../utils/extractFileText.js";
import axios from "axios";

export const parseCvFromUrl = async (cvUrl) => {
  console.log("[CV] Parsing CV started");
  console.log("[CV] CV URL:", cvUrl);

  try {
    // 1️⃣ Download file
    console.log("[CV] Downloading CV file");

    const response = await axios.get(cvUrl, {
      responseType: "arraybuffer"
    });

    const arrayBuffer = response.data;

    // 2️⃣ Detect file type
    let fileType = "pdf";
    if (cvUrl.endsWith(".docx")) fileType = "docx";

    console.log("[CV] Detected file type:", fileType);

    // 3️⃣ Extract text
    const text = await extractFileText(arrayBuffer, fileType);

    if (!text || text.trim().length === 0) {
      console.warn("[CV][WARN] Extracted text is empty");
    }

    console.log("[CV] CV text extraction successful");
    console.log("[CV] Text length:", text.length);

    return text;

  } catch (error) {
    console.error("[CV][ERROR] Failed to parse CV");
    throw error;
  }
};
