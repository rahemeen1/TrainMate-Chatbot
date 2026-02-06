//ingestroutes.js
import express from "express";
import {
  ingestDocumentController,
  deleteDocumentController,
} from "../controllers/ingestController.js";



const router = express.Router();

router.post("/ingest/document", ingestDocumentController);
router.delete("/ingest/document", deleteDocumentController);

export default router;
