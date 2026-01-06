// pineconeService.js
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";

dotenv.config();

console.log("🔥 pineconeService.js loaded");

if (!process.env.PINECONE_API_KEY) {
  throw new Error("❌ PINECONE_API_KEY missing");
}

if (!process.env.PINECONE_INDEX_NAME) {
  throw new Error("❌ PINECONE_INDEX_NAME missing");
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

export const queryPinecone = async ({
  companyId,
  deptName,
}) => {
  console.log("📡 queryPinecone started");

  console.log("🔎 Filters received:", {
    companyId,
    deptName,
  });

  try {
 
    const index = await pinecone.index(
      process.env.PINECONE_INDEX_NAME
    );
    console.log("✅ Pinecone index connected");

    /* ---------------------------------
       VECTOR (MATCHES INDEX DIMENSION)
    ---------------------------------- */
    const VECTOR_DIMENSION = 1024;
    const dummyVector = Array(VECTOR_DIMENSION).fill(0);

    /* ---------------------------------
       QUERY PINECONE
    ---------------------------------- */
    const response = await index.query({
      vector: dummyVector,
      topK: 10,
      namespace: "train-mate15",
      includeMetadata: true,
      filter: {
        companyId: { $eq: companyId },
        deptName: { $eq: deptName },
        trainingOn: { $eq: trainingOn },
      },
    });

    console.log(
      "📦 Pinecone matches count:",
      response.matches?.length || 0
    );

    /* ---------------------------------
       EXTRACT TEXT CHUNKS
    ---------------------------------- */
    const chunks = (response.matches || []).map(
      (match, idx) => ({
        text: match.metadata?.text || "",
        fileName: match.metadata?.fileName || null,
        chunkIndex: match.metadata?.chunkIndex ?? idx,
      })
    );

    console.log("📚 Extracted chunks:", chunks.length);

    if (chunks.length === 0) {
      console.warn(
        "⚠️ No Pinecone data found for given filters"
      );
    }

    return chunks;

  } catch (error) {
    console.error("🔥 Pinecone query failed:", error);
    throw error;
  }
};
