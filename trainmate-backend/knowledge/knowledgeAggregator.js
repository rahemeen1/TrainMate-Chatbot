// knowledge/knowledgeAggregator.js
import { assignConfidence } from "../services/confidenceService.js";

/**
 *
 * @param {Object} sources
 * @param {Array} sources.companyDocs - Company-specific docs
 * @param {Array} sources.mdn - MDN search results
 * @param {Array} sources.stackOverflow - StackOverflow results
 * @param {Array} sources.devto - Dev.to results
 *
 * @returns {Object} 
 */
export const aggregateKnowledge = ({ companyDocs = [], mdn = [], stackOverflow = [], devto = [] }) => {
  let allResults = [
    ...companyDocs.map((doc) => ({ ...doc, source: "companyDocs" })),
    ...mdn.map((doc) => ({ ...doc, source: "mdn" })),
    ...stackOverflow.map((doc) => ({ ...doc, source: "stackOverflow" })),
    ...devto.map((doc) => ({ ...doc, source: "devto" })),
  ];

  allResults = assignConfidence(allResults);
  allResults.sort((a, b) => b.confidence - a.confidence);
  const topResult = allResults[0] || null;
  return { allResults, topResult };
};
