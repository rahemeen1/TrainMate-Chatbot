import express from "express";
import {
  ingestDocumentController,
} from "../controllers/ingestController.js";

const router = express.Router();

router.post("/ingest/document", ingestDocumentController);

export default router;
