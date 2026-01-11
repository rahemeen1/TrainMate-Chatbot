// services/confidenceService.js

/**
 * Assign confidence scores to aggregated results.
 * Confidence is dynamic based on source priority + similarity score
 */

export const assignConfidence = (aggregatedResults) => {
  return aggregatedResults.map((item) => {
    let baseScore = 0;

    switch (item.source) {
      case "companyDocs":
        baseScore = 0.5;
        break;
      case "mdn":
        baseScore = 0.2;
        break;
      case "stackOverflow":
        baseScore = 0.15;
        break;
      case "devto":
        baseScore = 0.1;
        break;
      default:
        baseScore = 0.1;
    }

    // If Pinecone returned a score, factor it in
    if (item.score) {
      // Normalize Pinecone similarity (0-1) and add to base
      item.confidence = Math.min(1, baseScore + item.score / 2);
    } else {
      item.confidence = baseScore;
    }

    return item;
  });
};
