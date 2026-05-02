/**
 * Pinecone Diagnostic Service
 * Helps debug low retrieval scores
 */

import { getPineconeIndex } from "../config/pinecone.js";
import { CohereClient } from "cohere-ai";
import dotenv from "dotenv";

dotenv.config();

const cohere = process.env.COHERE_API_KEY
  ? new CohereClient({ token: process.env.COHERE_API_KEY })
  : null;

// Read thresholds from environment (same as pineconeService.js)
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

/* ========================================
   ANALYZE: List documents in namespace
======================================== */
export const listNamespaceDocuments = async ({ companyId, limit = 10 }) => {
  try {
    const index = getPineconeIndex();
    const namespace = `company-${companyId}`;

    console.log("\n📋 PINECONE DIAGNOSTIC: Listing documents");
    console.log("Namespace:", namespace);

    // Fetch a sample of vectors to understand what's indexed
    const dummyVector = new Array(1024).fill(0); // Dummy vector for listing
    
    const res = await index.namespace(namespace).query({
      vector: dummyVector,
      topK: limit,
      includeMetadata: true,
    });

    const docs = res.matches || [];
    console.log(`Found ${docs.length} documents:\n`);

    docs.forEach((doc, idx) => {
      const meta = doc.metadata || {};
      const text = (meta.text || "").substring(0, 100);
      console.log(`${idx + 1}. ID: ${doc.id}`);
      console.log(`   Score: ${doc.score?.toFixed(4)}`);
      console.log(`   Dept: ${meta.deptName}`);
      console.log(`   File: ${meta.fileName}`);
      console.log(`   Text: "${text}..."`);
      console.log(`   Chunk: ${meta.chunkIndex} of ?`);
      console.log("");
    });

    return docs;
  } catch (err) {
    console.error("❌ Diagnostic failed:", err.message);
    return [];
  }
};

/* ========================================
   ANALYZE: Test similarity for sample query
======================================== */
export const testQuerySimilarity = async ({
  companyId,
  testQuery,
  topK = 5,
}) => {
  try {
    if (!cohere) {
      throw new Error("Cohere client not initialized");
    }

    const strictThreshold = resolveRetrievalThreshold();
    const fallbackThreshold = resolveFallbackRetrievalThreshold();

    console.log("\n🧪 PINECONE SIMILARITY TEST");
    console.log("Query:", testQuery);
    console.log("Strict Threshold:", strictThreshold);
    console.log("Fallback Threshold:", fallbackThreshold);
    console.log("");

    // Embed the test query
    const embed = await cohere.embed({
      texts: [testQuery],
      model: "embed-english-v3.0",
      inputType: "search_query",
    });

    const queryVector = embed.embeddings[0];

    // Query Pinecone
    const index = getPineconeIndex();
    const namespace = `company-${companyId}`;

    const res = await index.namespace(namespace).query({
      vector: queryVector,
      topK,
      includeMetadata: true,
    });

    const matches = res.matches || [];

    console.log(`Results: ${matches.length} matches\n`);

    matches.forEach((m, idx) => {
      const text = (m.metadata?.text || "").substring(0, 80);
      let status = "❌";
      if (m.score >= strictThreshold) status = "✅";
      else if (m.score >= fallbackThreshold) status = "⚠️";
      
      const score = typeof m?.score === "number" ? m.score.toFixed(6) : "N/A";
      console.log(`${idx + 1}. ${status} Exact Score: ${score}`);
      console.log(`   Text: "${text}..."`);
    });

    // Analysis
    const aboveStrict = matches.filter(m => m.score >= strictThreshold).length;
    const aboveFallback = matches.filter(m => m.score >= fallbackThreshold).length;

    console.log("\n📊 ANALYSIS:");
    console.log(`  Above strict (${strictThreshold}): ${aboveStrict}/${matches.length}`);
    console.log(`  Above fallback (${fallbackThreshold}): ${aboveFallback}/${matches.length}`);

    if (aboveStrict === 0) {
      console.log(
        "\n⚠️  WARNING: No documents above strict threshold!"
      );
      console.log("   Fallback mode will be activated in production.");
      if (aboveFallback > 0) {
        console.log("   ✅ But fallback threshold IS catching relevant docs.");
      }
    }

    return { matches, stats: { aboveStrict, aboveFallback, strictThreshold, fallbackThreshold } };
  } catch (err) {
    console.error("❌ Test failed:", err.message);
    return { matches: [], stats: {} };
  }
};

/* ========================================
   INSPECT: Check document metadata consistency
======================================== */
export const inspectNamespaceMetadata = async ({ companyId }) => {
  try {
    const index = getPineconeIndex();
    const namespace = `company-${companyId}`;

    console.log("\n🔍 METADATA CONSISTENCY CHECK");
    console.log("Namespace:", namespace);

    const dummyVector = new Array(1024).fill(0);
    const res = await index.namespace(namespace).query({
      vector: dummyVector,
      topK: 50,
      includeMetadata: true,
    });

    const docs = res.matches || [];
    const metadata = {
      deptNames: new Set(),
      fileNames: new Set(),
      hasText: 0,
      totalDocs: docs.length,
      avgTextLength: 0,
    };

    let totalTextLength = 0;

    docs.forEach(doc => {
      const meta = doc.metadata || {};
      if (meta.deptName) metadata.deptNames.add(meta.deptName);
      if (meta.fileName) metadata.fileNames.add(meta.fileName);
      if (meta.text) {
        metadata.hasText++;
        totalTextLength += (meta.text || "").length;
      }
    });

    metadata.avgTextLength = Math.round(totalTextLength / Math.max(metadata.hasText, 1));
    metadata.deptNames = Array.from(metadata.deptNames);
    metadata.fileNames = Array.from(metadata.fileNames);

    console.log("\n📊 Metadata Summary:");
    console.log(`  Total documents: ${metadata.totalDocs}`);
    console.log(`  Departments: ${metadata.deptNames.join(", ") || "NONE"}`);
    console.log(`  Files ingested: ${metadata.fileNames.join(", ") || "NONE"}`);
    console.log(`  Docs with text: ${metadata.hasText}/${metadata.totalDocs}`);
    console.log(`  Avg text length: ${metadata.avgTextLength} chars`);

    if (metadata.hasText === 0) {
      console.log("\n❌ CRITICAL: No documents have text metadata!");
      console.log("   Check ingestService.js - metadata.text might not be saved");
    }

    if (metadata.deptNames.length === 0) {
      console.log("\n❌ CRITICAL: No department metadata found!");
      console.log("   Check ingestService.js - metadata.deptName might not be saved");
    }

    return metadata;
  } catch (err) {
    console.error("❌ Inspection failed:", err.message);
    return {};
  }
};
