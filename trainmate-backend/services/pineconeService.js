//pinconeService.js
import { Pinecone } from "@pinecone-database/pinecone";
import { CohereClient } from "cohere-ai";
import dotenv from "dotenv";

dotenv.config(); // must be first

/* ---------------- ENV VARIABLES ---------------- */
const INDEX_NAME = process.env.PINECONE_INDEX || "";
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const COHERE_API_KEY = process.env.COHERE_API_KEY || "";

if (!INDEX_NAME || !PINECONE_API_KEY || !COHERE_API_KEY) {
  console.warn("⚠️ Pinecone/Cohere env vars missing. Retrieval will return empty results.");
}

/* ---------------- INIT CLIENTS ---------------- */
const pinecone = PINECONE_API_KEY
  ? new Pinecone({ apiKey: PINECONE_API_KEY })
  : null;

const cohere = COHERE_API_KEY
  ? new CohereClient({ token: COHERE_API_KEY })
  : null;

const DEFAULT_RETRIEVAL_SCORE_THRESHOLD = 0.65;
const DEFAULT_FALLBACK_RETRIEVAL_SCORE = 0.45;

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

function resolveFallbackRetrievalThreshold() {
  const envValue = Number(process.env.PINECONE_FALLBACK_RETRIEVAL_SCORE_THRESHOLD);
  if (Number.isFinite(envValue) && envValue >= 0 && envValue <= 1) {
    return envValue;
  }

  return DEFAULT_FALLBACK_RETRIEVAL_SCORE;
}

function extractDocTextFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "";

  return String(
    metadata.text ||
      metadata.content ||
      metadata.chunk ||
      metadata.body ||
      ""
  ).trim();
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

  console.log("Input values received:");
  console.log("  companyId ->", companyId);
  console.log("  deptName  ->", deptName);
  console.log("  queryText length ->", queryText?.length);

  if (!queryText || typeof queryText !== "string") {
    throw new Error("queryText missing or invalid");
  }

  const normalizedDept = String(deptName || "").toUpperCase();
  const retrievalThreshold = resolveRetrievalThreshold(minScore);

  if (!INDEX_NAME || !pinecone || !cohere) {
    console.warn("⚠️ Retrieval skipped: missing Pinecone/Cohere configuration");
    return [];
  }

  /* ---------------- 1) Embedding ---------------- */
  console.log("Generating Cohere embedding...");
  const embed = await cohere.embed({
    texts: [queryText],
    model: "embed-english-v3.0",
    inputType: "search_query",
  });

  const vector = embed.embeddings[0];
  console.log("Embedding vector length ->", vector.length);

  /* ---------------- 2) Index + Namespace ---------------- */
  const namespace = `company-${companyId}`;

  console.log("Pinecone index connected");
  console.log("Namespace used ->", namespace);
  console.log("Index name used ->", INDEX_NAME);

  const index = pinecone
    .Index(INDEX_NAME)
    .namespace(namespace);

  /* ---------------- 3) Query ---------------- */
  console.log("Querying Pinecone...");
  const response = await index.query({
    vector,
    topK: 5,
    filter: { deptName: { $eq: normalizedDept } },
    includeMetadata: true,
  });

  const rawMatches = Array.isArray(response.matches) ? response.matches : [];

  const scoredMatches = rawMatches.filter((match) => {
    return typeof match?.score === "number" && Number.isFinite(match.score);
  });

  const filteredMatches = scoredMatches.filter((match) => {
    return typeof match?.score === "number" && match.score >= retrievalThreshold;
  });

  const rankedMatches = scoredMatches
    .sort((a, b) => b.score - a.score);

  const fallbackThreshold = resolveFallbackRetrievalThreshold();
  const fallbackMatches = rankedMatches
    .filter((match) => match.score >= fallbackThreshold)
    .slice(0, 2);

  let selectedMatches = filteredMatches;
  let fallbackMode = "none";

  // If strict filtering drops all matches, return top relevant docs for downstream grounding.
  if (selectedMatches.length === 0 && rankedMatches.length > 0) {
    if (fallbackMatches.length > 0) {
      selectedMatches = fallbackMatches;
      fallbackMode = "relaxed-threshold";
    } else {
      selectedMatches = rankedMatches.slice(0, 1);
      fallbackMode = "top-1";
    }
  }

  // Some Pinecone payloads can contain matches without numeric score.
  // Keep grounding usable by returning top raw matches in that case.
  if (selectedMatches.length === 0 && rawMatches.length > 0) {
    selectedMatches = rawMatches.slice(0, 1);
    fallbackMode = "raw-top-1";
  }

  console.log("Pinecone matches ->", rawMatches.length);
  console.log("Scored matches ->", scoredMatches.length);
  console.log("Retrieval threshold ->", retrievalThreshold);
  console.log("Matches after strict threshold ->", filteredMatches.length);
  if (fallbackMode !== "none") {
    console.log("Fallback retrieval mode ->", fallbackMode);
    console.log("Fallback threshold ->", fallbackThreshold);
    console.log("Matches returned after fallback ->", selectedMatches.length);
  } else {
    console.log("Matches returned ->", selectedMatches.length);
  }
  console.log("================ PINECONE DEBUG END ================\n");

  return selectedMatches.map((m) => ({
    text: extractDocTextFromMetadata(m?.metadata),
    score: typeof m?.score === "number" && Number.isFinite(m.score) ? m.score : null,
  }));
};
