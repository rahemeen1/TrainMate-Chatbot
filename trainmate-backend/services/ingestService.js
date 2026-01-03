import { getCohereClient } from "../config/cohere.js";
import { getPineconeIndex } from "../config/pinecone.js";
import { chunkText } from "../utils/chunkText.js";
import { extractFileText } from "../utils/TextExtractor.js";

const normalizeValues = (vals) => {
  if (Array.isArray(vals)) return vals.map(Number);
  if (ArrayBuffer.isView(vals)) return Array.from(vals).map(Number);
  if (typeof vals === "object" && vals !== null && Array.isArray(vals.data)) return vals.data.map(Number);

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
    const fileBuffer = await fetch(fileUrl).then(r => r.arrayBuffer());
    const fileType = fileName.split(".").pop().toLowerCase();
    const text = await extractFileText(fileBuffer, fileType);

    const chunks = chunkText(text, 500);
    const records = [];

    for (const [i, chunk] of chunks.entries()) {
      const embeddingResponse = await cohereClient.embed({
        model: "embed-english-v3.0",
        input_type: "search_document",
        texts: [chunk],
      });
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

    // Try the expected upsert signature for your SDK
    await pineconeIndex
  .namespace(`company-${companyId}`)
  .upsert(records);


  } catch (err) {
    // extra debug info
    console.error(" [INGEST] Background ingest failed:");
    console.error(err && err.stack ? err.stack : err);

    // If the error is Pinecone complaining about 'records', dump more info
    if (err && /records is not iterable|records is not iterable/i.test(String(err))) {
      console.error("👉 Record is not iterable");
      console.error("Records type:", typeof records);  
    }

    throw err; 
  }
};
