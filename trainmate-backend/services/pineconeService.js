// pineconeService.js
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";

dotenv.config();

// 1️⃣ Init Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

// 2️⃣ Select index
const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

/**
 * Query Pinecone using metadata filters for department
 */
export const queryPinecone = async ({ companyId, deptName }) => {
  console.log("📡 Pinecone query started");
  console.log("🔎 Filters:", { companyId, deptName });

  try {
    const response = await index.query({
      topK: 10,
      includeMetadata: true,
      filter: {
        companyId: { $eq: companyId },
        deptName: { $eq: deptName }
      }
    });

    console.log("📦 Pinecone raw matches count:", response.matches?.length || 0);

    const chunks = response.matches.map((match, i) => ({
      text: `[Refer to file: ${match.metadata?.fileName || "unknown"}]`,
      fileName: match.metadata?.fileName,
      chunkIndex: match.metadata?.chunkIndex ?? i
    }));

    console.log("📚 Extracted Pinecone chunks:", chunks.length);
    return chunks;
  } catch (err) {
    console.error("🔥 Pinecone query failed:", err);
    return [];
  }
};

