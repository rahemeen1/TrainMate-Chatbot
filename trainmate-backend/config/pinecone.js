// pinecone.js
import { Pinecone } from "@pinecone-database/pinecone";

let pineconeIndex;
let isPineconeAvailable = false;

export const initPinecone = async () => {
  if (!process.env.PINECONE_API_KEY) {
    console.warn("⚠️ PINECONE_API_KEY is missing - Pinecone features disabled");
    return null;
  }

  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    const INDEX_NAME = "train-mate15";
    const DIMENSION = 1024;

    // ✅ FIX: destructure indexes correctly
    const { indexes } = await pinecone.listIndexes();
    const indexExists = indexes.some(
      (index) => index.name === INDEX_NAME
    );

    if (!indexExists) {
      await pinecone.createIndex({
        name: INDEX_NAME,
        dimension: DIMENSION,
        metric: "cosine",
        spec: {
          serverless: {
            cloud: "aws",
            region: "us-east-1",
          },
        },
      });

      console.log("✅ Pinecone index created");
    } else {
      console.log("✅ Pinecone index already exists");
    }

    pineconeIndex = pinecone.Index(INDEX_NAME);
    isPineconeAvailable = true;
    return pineconeIndex;
  } catch (error) {
    console.error("❌ Pinecone initialization failed:", error.message);
    console.warn("⚠️ Server will continue without Pinecone features");
    console.warn("⚠️ Check https://status.pinecone.io/ for service status");
    isPineconeAvailable = false;
    return null;
  }
};

export const getPineconeIndex = () => pineconeIndex;
export const checkPineconeAvailability = () => isPineconeAvailable;
