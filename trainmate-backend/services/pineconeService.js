//pineconeService.js
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
 * Query Pinecone using metadata filters
 */
export const queryPinecone = async ({
  companyId,
  deptName,
  trainingOn
}) => {
  console.log("📡 Pinecone query started");

  console.log("🔎 Pinecone filters:", {
    companyId,
    deptName,
    trainingOn
  });

  try {
    // 3️⃣ Dummy embedding (for now)
    // IMPORTANT: abhi semantic search nahi kar rahe,
    // sirf metadata-based retrieval
    const dummyVector = Array(1536).fill(0);

    const response = await index.query({
      vector: dummyVector,
      topK: 10,
      includeMetadata: true,
      filter: {
        companyId: { $eq: companyId },
        deptName: { $eq: deptName }
        // trainingOn future mein add hoga via tags
      }
    });

    console.log(
      "📦 Pinecone raw matches count:",
      response.matches?.length || 0
    );

    // 4️⃣ Extract text chunks
    const chunks = response.matches.map(match => ({
      text: match.metadata?.text || "",
      fileName: match.metadata?.fileName,
      chunkIndex: match.metadata?.chunkIndex
    }));

    console.log("📚 Extracted Pinecone chunks:", chunks.length);

    if (chunks.length === 0) {
      console.warn(
        "⚠️ No Pinecone data found for this company/dept"
      );
    }

    return chunks;

  } catch (error) {
    console.error("🔥 Pinecone query failed:", error);
    throw error;
  }
};
