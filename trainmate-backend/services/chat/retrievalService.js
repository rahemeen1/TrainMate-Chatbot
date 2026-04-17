import { CohereClient } from "cohere-ai";
import { getPineconeIndex } from "../../config/pinecone.js";
import { searchMDN } from "../../knowledge/mdn.js";
import { searchStackOverflow } from "../../knowledge/stackoverflow.js";
import { searchDevTo } from "../../knowledge/devto.js";
import { aggregateKnowledge } from "../../knowledge/knowledgeAggregator.js";

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
const requestCache = new Map();
const cacheTtlMs = 5 * 60 * 1000;

function setCache(key, value) {
  requestCache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
}

function getCache(key) {
  const entry = requestCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    requestCache.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheKeyFor(query, companyId, deptId) {
  return `${companyId}:${deptId}:${String(query || "").trim().toLowerCase()}`;
}

export async function embedText(text) {
  const res = await cohere.embed({
    model: "embed-english-v3.0",
    texts: [text],
    inputType: "search_query",
  });
  return res.embeddings[0];
}

export async function queryPinecone({ embedding, companyId, deptId, topK = 5 }) {
  try {
    const index = getPineconeIndex();
    const res = await index
      .namespace(`company-${companyId}`)
      .query({
        vector: embedding,
        topK,
        includeMetadata: true,
        filter: { deptName: { $eq: deptId.toUpperCase() } },
      });

    return (res.matches || []).map((match) => ({
      text: match.metadata?.text || "",
      score: match.score || 0,
      source: "pinecone",
      dept: match.metadata?.deptName || deptId,
    }));
  } catch (error) {
    console.error("❌ Pinecone query failed:", error.message);
    return [];
  }
}

export function rankContextCandidates(userMessage, contextCandidates = []) {
  const terms = new Set(String(userMessage || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const sourcePriority = {
    companyDoc: 1.0,
    mdn: 0.9,
    stackOverflow: 0.7,
    devto: 0.6,
    external: 0.5,
  };

  return contextCandidates
    .map((candidate) => {
      const text = String(candidate?.text || "");
      const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const overlap = words.filter((word) => terms.has(word)).length;
      const semanticScore = overlap / Math.max(1, terms.size);
      const priority = sourcePriority[String(candidate?.source || "external")] || 0.5;
      const recency = candidate?.updatedAt ? 0.1 : 0;
      const userRelevance = candidate?.score ? Math.min(1, Number(candidate.score)) : 0;
      const rankScore = (semanticScore * 0.5) + (priority * 0.3) + recency + (userRelevance * 0.1);
      return {
        ...candidate,
        text,
        rankScore,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 4);
}

export async function fetchAgenticKnowledge(query, companyDocs, cacheKey) {
  const cached = cacheKey ? getCache(`${cacheKey}:external`) : null;
  if (cached) {
    return cached;
  }

  try {
    const [mdnResults, soResults, devtoResults] = await Promise.all([
      searchMDN(query).catch((error) => {
        console.warn("⚠️ MDN fetch failed:", error.message);
        return [];
      }),
      searchStackOverflow(query).catch((error) => {
        console.warn("⚠️ StackOverflow fetch failed:", error.message);
        return [];
      }),
      searchDevTo(query).catch((error) => {
        console.warn("⚠️ Dev.to fetch failed:", error.message);
        return [];
      }),
    ]);

    const aggregated = aggregateKnowledge({
      companyDocs,
      mdn: mdnResults,
      stackOverflow: soResults,
      devto: devtoResults,
    });

    const payload = {
      allResults: aggregated.allResults,
      topResult: aggregated.topResult,
      summary: aggregated.allResults.slice(0, 3),
    };

    if (cacheKey) {
      setCache(`${cacheKey}:external`, payload);
    }

    return payload;
  } catch (error) {
    console.error("❌ Agentic knowledge fetch failed:", error.message);
    return {
      allResults: companyDocs,
      topResult: companyDocs[0] || null,
      summary: companyDocs.slice(0, 3),
    };
  }
}
