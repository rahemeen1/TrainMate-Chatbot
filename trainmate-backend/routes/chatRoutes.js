import express from "express";
import {initChat, chatController, getMissedDatesController, submitChatFeedback } from "../controllers/chatController.js";
import moduleExplainRouter from "./moduleExplain.js"; 

const router = express.Router();

router.post("/chat/init", initChat);
router.post("/chat", chatController);
router.post("/chat/feedback", submitChatFeedback);
router.post("/chat/missed-dates", getMissedDatesController);
router.use("/module", moduleExplainRouter);


export default router;


// Mount at /module/explain

