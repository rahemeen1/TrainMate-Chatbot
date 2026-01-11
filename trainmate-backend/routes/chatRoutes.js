import express from "express";
import {initChat, chatController } from "../controllers/chatController.js";

const router = express.Router();

router.post("/chat/init", initChat);
router.post("/chat", chatController);


export default router;
