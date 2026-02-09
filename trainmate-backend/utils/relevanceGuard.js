//utils/relevanceguard.js
export const isSemanticallyRelevant = ({ similarityScore }) => {
  // Pinecone similarity usually 0–1
  return similarityScore >= 0.35;
};
