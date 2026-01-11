// services/companyDocs.js
import { retrieveDeptDocsFromPinecone } from "./pineconeService.js";

/**
 * Fetch company-specific documents from Pinecone
 * @param {string} queryText - User query or topic
 * @param {Object} userContext - { userId, companyId, deptName }
 * @returns {Array} - Array of { text, score }
 */
export const fetchCompanyDocs = async (queryText, userContext) => {
  const { companyId, deptName } = userContext;

  if (!companyId || !deptName) {
    console.warn("⚠️ Missing companyId or deptName in user context");
    return [];
  }

  try {
    const results = await retrieveDeptDocsFromPinecone({
      queryText,
      companyId,
      deptName,
    });

    return results.map(doc => ({
      text: doc.text,
      score: doc.score,
    }));
  } catch (err) {
    console.error("Error fetching company docs:", err.message);
    return [];
  }
};
