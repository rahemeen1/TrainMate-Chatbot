/**
 * Pinecone Diagnostics Routes
 * Add to your Express app:
 * app.use("/api/debug", pineconeDebugRoutes);
 */

import express from "express";
import {
  listNamespaceDocuments,
  testQuerySimilarity,
  inspectNamespaceMetadata,
} from "../services/pineconeDebug.service.js";

const router = express.Router();

/**
 * GET /api/debug/pinecone/list?companyId=XXX
 * Lists sample documents in a namespace
 */
router.get("/pinecone/list", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ error: "companyId required" });
    }

    const docs = await listNamespaceDocuments({ companyId, limit: 10 });
    res.json({ success: true, docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/debug/pinecone/test-query
 * Body: { companyId: string, testQuery: string }
 * Tests similarity scores for a sample query
 */
router.post("/pinecone/test-query", async (req, res) => {
  try {
    const { companyId, testQuery } = req.body;
    if (!companyId || !testQuery) {
      return res.status(400).json({ error: "companyId and testQuery required" });
    }

    const result = await testQuerySimilarity({
      companyId,
      testQuery,
      topK: 10,
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/debug/pinecone/metadata?companyId=XXX
 * Checks metadata consistency in namespace
 */
router.get("/pinecone/metadata", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ error: "companyId required" });
    }

    const metadata = await inspectNamespaceMetadata({ companyId });
    res.json({ success: true, metadata });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
