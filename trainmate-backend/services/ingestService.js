import { getCohereClient } from "../config/cohere.js";
import { getPineconeIndex } from "../config/pinecone.js";
import { chunkText } from "../utils/chunkText.js";
import { extractPdfText } from "../utils/pdfTextExtractor.js";

const normalizeValues = (vals) => {
  // Accept arrays, typed arrays, or objects with .toJSON() etc.
  if (Array.isArray(vals)) return vals.map(Number);
  if (ArrayBuffer.isView(vals)) return Array.from(vals).map(Number);
  if (typeof vals === "object" && vals !== null && Array.isArray(vals.data)) return vals.data.map(Number);
  // fallback: try to coerce
  try {
    return Array.from(vals).map(Number);
  } catch (e) {
    return null;
  }
};

export const ingestDocAsync = async ({
  fileUrl,
  companyId,
  deptName,
  docId,
  fileName,
}) => {
  const pineconeIndex = getPineconeIndex();
  const cohereClient = getCohereClient();

  try {
    const pdfBuffer = await fetch(fileUrl).then(r => r.arrayBuffer());
    const text = await extractPdfText(pdfBuffer);

    const chunks = chunkText(text, 500);
    const records = [];

    for (const [i, chunk] of chunks.entries()) {
      const embeddingResponse = await cohereClient.embed({
        model: "embed-english-v3.0",
        input_type: "search_document",
        texts: [chunk],
      });

      // --- DIAGNOSTIC: what does the embed response look like?
      // console.log(JSON.stringify(embeddingResponse).slice(0, 1000));

      const raw = embeddingResponse?.embeddings?.[0] ?? embeddingResponse?.embedding ?? null;
      const values = normalizeValues(raw);

      if (!values || !Array.isArray(values) || values.length === 0) {
        console.error("❌ Invalid embedding values for chunk", i, "raw:", typeof raw, raw && raw.length ? `len=${raw.length}` : raw);
        throw new Error("Invalid embedding values (not an array). See server logs.");
      }

      records.push({
        id: `${docId}-${i}`,
        values, // plain number[]
        metadata: {
          companyId,
          deptName,
          fileName,
          chunkIndex: i,
        },
      });
    }

    // DEBUG: inspect records shape before upsert
    console.log("🔎 [INGEST] records.length:", records.length);
    if (records.length > 0) {
      console.log("🔎 [INGEST] sample record keys:", Object.keys(records[0]));
      console.log("🔎 [INGEST] sample id:", records[0].id);
      console.log("🔎 [INGEST] sample values length:", Array.isArray(records[0].values) ? records[0].values.length : typeof records[0].values);
    }

    // Try the expected upsert signature for your SDK
    await pineconeIndex
  .namespace(`company-${companyId}`)
  .upsert(records);


    console.log(`✅ Document ${fileName} ingested successfully`);
  } catch (err) {
    // extra debug info
    console.error("❌ [INGEST] Background ingest failed:");
    console.error(err && err.stack ? err.stack : err);

    // If the error is Pinecone complaining about 'records', dump more info
    if (err && /records is not iterable|records is not iterable/i.test(String(err))) {
      console.error("👉 Diagnosing payload:");
      try {
        // show only structural summary (avoid giant logs)
        console.log("Type of records:", typeof records);
        console.log("Is Array:", Array.isArray(records));
        console.log("First item (typeof):", records?.[0] ? typeof records[0] : "no-record");
        console.log("First item keys:", records?.[0] ? Object.keys(records[0]) : "no-record");
      } catch (ex) {
        console.error("Failed to print records diagnostic:", ex);
      }
    }

    throw err; // rethrow so caller sees failure
  }
};
