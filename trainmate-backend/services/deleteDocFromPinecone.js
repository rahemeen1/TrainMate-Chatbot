import { getPineconeIndex } from "../config/pinecone.js";

export const deleteDocFromPinecone = async ({
  companyId,
  docId,
}) => {
  const index = getPineconeIndex();
  const namespace = `company-${companyId}`;

  const cleanDocId = (docId || "").trim();
  console.log("🧼 cleanDocId:", cleanDocId);
  console.log("📂 Namespace:", namespace);

  try {
    // Delete vectors by ID pattern - try a conservative upper limit
    // Most documents will have fewer chunks than this
    const maxChunks = 1000;
    const vectorIds = Array.from({ length: maxChunks }, (_, i) => `${cleanDocId}-${i}`);
    
    console.log(`🔁 Attempting to delete up to ${maxChunks} vectors for docId: ${cleanDocId}`);

    // Pinecone will silently ignore non-existent IDs, so this is safe
    await index.namespace(namespace).deleteMany(vectorIds);
    
    console.log(`🧹 Delete request sent for all chunks of docId: ${cleanDocId}`);
  } catch (err) {
    console.error("❌ Pinecone delete failed:", err);
    throw err;
  }
};
