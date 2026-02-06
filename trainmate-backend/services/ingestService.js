import { getCohereClient } from "../config/cohere.js";
import { getPineconeIndex } from "../config/pinecone.js";
import { chunkText } from "../utils/chunkText.js";
import { extractFileText } from "../utils/TextExtractor.js";

/* ---------------------------------
   NORMALIZE EMBEDDING VALUES
---------------------------------- */
const normalizeValues = (vals) => {
  if (Array.isArray(vals)) return vals.map(Number);
  if (ArrayBuffer.isView(vals)) return Array.from(vals).map(Number);
  if (typeof vals === "object" && vals !== null && Array.isArray(vals.data))
    return vals.data.map(Number);

  try {
    return Array.from(vals).map(Number);
  } catch {
    return null;
  }
};

/* =================================
   INGEST DOCUMENT INTO PINECONE
================================= */
export const ingestDocAsync = async ({
  fileUrl,
  companyId,
  deptName,
  docId,
  fileName,
}) => {
  const pineconeIndex = getPineconeIndex();
  const cohereClient = getCohereClient();

  console.log("\n================ INGEST START =================");
  console.log("📄 File:", fileName);
  console.log("🏢 Company:", companyId);
  console.log("🏷️ Dept:", deptName);

  try {
    /* ---------------------------------
       1️⃣ LOAD FILE
    ---------------------------------- */
    const fileBuffer = await fetch(fileUrl).then(r => r.arrayBuffer());
    const fileType = fileName.split(".").pop().toLowerCase();

    console.log("📦 File type detected:", fileType);

    const text = await extractFileText(fileBuffer, fileType);

    console.log("📝 Extracted text length:", text?.length);

    if (!text || text.trim().length < 50) {
      console.warn("⚠️ Extracted text is very small");
    }

    /* ---------------------------------
       2️⃣ CHUNK TEXT
    ---------------------------------- */
    const chunks = chunkText(text, 500);
    console.log("🧩 Total chunks created:", chunks.length);

    const records = [];

    /* ---------------------------------
       3️⃣ CREATE EMBEDDINGS + RECORDS
    ---------------------------------- */
    for (const [i, chunk] of chunks.entries()) {
      console.log(`🔹 Embedding chunk ${i} (chars: ${chunk.length})`);

      const embeddingResponse = await cohereClient.embed({
        model: "embed-english-v3.0",
        input_type: "search_document",
        texts: [chunk],
      });

      const raw =
        embeddingResponse?.embeddings?.[0] ??
        embeddingResponse?.embedding ??
        null;

      const values = normalizeValues(raw);

      if (!values || !Array.isArray(values) || values.length !== 1024) {
        console.error("❌ Invalid embedding for chunk", i);
        console.error("Raw embedding:", raw);
        throw new Error("Invalid embedding values");
      }

      records.push({
        id: `${docId}-${i}`,
        values,
        metadata: {
          companyId,
          deptName,
          fileName,
          docId, 
          chunkIndex: i,
          text: chunk, // ✅ CRITICAL FIX
        },
      });
    }

    console.log("📦 Total records prepared:", records.length);

    /* ---------------------------------
       4️⃣ UPSERT INTO PINECONE
    ---------------------------------- */
    const namespace = `company-${companyId}`;
    console.log("🧪 Pinecone namespace:", namespace);

    await pineconeIndex
      .namespace(namespace)
      .upsert(records);

    console.log("✅ Ingestion completed successfully");
    console.log("================ INGEST END ==================\n");

  } catch (err) {
    console.error("🔥 [INGEST] Failed");
    console.error(err?.stack || err);
    throw err;
  }
  
};
