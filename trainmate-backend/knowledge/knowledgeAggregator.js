// knowledge/knowledgeAggregator.js
import { assignConfidence } from "../services/confidenceService.js";

/**
 * Aggregates results from multiple knowledge sources
 * and assigns dynamic confidence scores.
 *
 * @param {Object} sources
 * @param {Array} sources.companyDocs - Company-specific docs
 * @param {Array} sources.mdn - MDN search results
 * @param {Array} sources.stackOverflow - StackOverflow results
 * @param {Array} sources.devto - Dev.to results
 *
 * @returns {Object} { allResults: [...], topResult: {...} }
 */
export const aggregateKnowledge = ({ companyDocs = [], mdn = [], stackOverflow = [], devto = [] }) => {
  // 1️⃣ Tag each result with its source
  let allResults = [
    ...companyDocs.map((doc) => ({ ...doc, source: "companyDocs" })),
    ...mdn.map((doc) => ({ ...doc, source: "mdn" })),
    ...stackOverflow.map((doc) => ({ ...doc, source: "stackOverflow" })),
    ...devto.map((doc) => ({ ...doc, source: "devto" })),
  ];

  // 2️⃣ Assign dynamic confidence using centralized service
  allResults = assignConfidence(allResults);

  // 3️⃣ Sort by confidence descending
  allResults.sort((a, b) => b.confidence - a.confidence);

  // 4️⃣ Optional: pick top result
  const topResult = allResults[0] || null;

  return { allResults, topResult };
};
