import { Pinecone } from "@pinecone-database/pinecone";

let pineconeIndex;

export const initPinecone = async () => {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY is missing in environment variables!");
  }

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
};

export const getPineconeIndex = () => {
  if (!pineconeIndex) {
    throw new Error("Pinecone not initialized. Call initPinecone first.");
  }
  return pineconeIndex;
};
