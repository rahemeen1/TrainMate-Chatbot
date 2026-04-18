//pinconeService.js
import { Pinecone } from "@pinecone-database/pinecone";
import { CohereClient } from "cohere-ai";
import dotenv from "dotenv";

dotenv.config(); // ✅ must be first

/* ---------------- ENV VARIABLES ---------------- */
const INDEX_NAME = process.env.PINECONE_INDEX;
if (!INDEX_NAME) {
  throw new Error("❌ PINECONE_INDEX missing in environment variables");
}
console.log("🧪 PINECONE_INDEX →", INDEX_NAME);

/* ---------------- INIT CLIENTS ---------------- */
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

const DEFAULT_RETRIEVAL_SCORE_THRESHOLD = 0.65;

function resolveRetrievalThreshold(value) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 1) {
    return numericValue;
  }

  const envValue = Number(process.env.PINECONE_RETRIEVAL_SCORE_THRESHOLD);
  if (Number.isFinite(envValue) && envValue >= 0 && envValue <= 1) {
    return envValue;
  }

  return DEFAULT_RETRIEVAL_SCORE_THRESHOLD;
}

/* --------------------------------------------------
   Retrieve department documents
-------------------------------------------------- */
export const retrieveDeptDocsFromPinecone = async ({
  queryText,
  companyId,
  deptName,
  minScore,
}) => {
  console.log("\n================ PINECONE DEBUG START ================");

  console.log("🧪 Input values received:");
  console.log("   companyId →", companyId);
  console.log("   deptName  →", deptName);
  console.log("   queryText length →", queryText?.length);

  if (!queryText || typeof queryText !== "string") {
    throw new Error("❌ queryText missing or invalid");
  }

  const normalizedDept = deptName.toUpperCase();
  const retrievalThreshold = resolveRetrievalThreshold(minScore);

  /* ---------------- 1️⃣ Embedding ---------------- */
  console.log("🔎 Generating Cohere embedding...");
  const embed = await cohere.embed({
    texts: [queryText],
    model: "embed-english-v3.0",
    inputType: "search_query",
  });

  const vector = embed.embeddings[0];
  console.log("📐 Embedding vector length →", vector.length);

  /* ---------------- 2️⃣ Index + Namespace ---------------- */
  const namespace = `company-${companyId}`;

  console.log("✅ Pinecone index connected");
  console.log("🧪 Namespace used →", namespace);
  console.log("🧪 Index name used →", INDEX_NAME);

  const index = pinecone
    .Index(INDEX_NAME)     // ✅ always use top-level constant
    .namespace(namespace);

  /* ---------------- 3️⃣ Query ---------------- */
  console.log("🔍 Querying Pinecone...");
  const response = await index.query({
    vector,
    topK: 5,
    filter: { deptName: { $eq: normalizedDept } },
    includeMetadata: true,
  });

  const filteredMatches = (response.matches || []).filter((match) => {
    return typeof match?.score === "number" && match.score >= retrievalThreshold;
  });

  console.log("✅ Pinecone matches →", response.matches?.length || 0);
  console.log("🎯 Retrieval threshold →", retrievalThreshold);
  console.log("✅ Matches after threshold →", filteredMatches.length);
  console.log("================ PINECONE DEBUG END ================\n");

  return filteredMatches.map((m) => ({
    text: m.metadata?.text || "",
    score: m.score,
  }));
};
