import express from "express";
import {initChat, chatController } from "../controllers/chatController.js";
import moduleExplainRouter from "./moduleExplain.js"; 

const router = express.Router();

router.post("/chat/init", initChat);
router.post("/chat", chatController);
router.use("/module", moduleExplainRouter);


export default router;


// Mount at /module/explain

