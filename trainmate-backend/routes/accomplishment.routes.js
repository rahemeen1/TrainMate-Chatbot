//routes/accomplishment.routes.js
import express from "express";
import { generateAccomplishment } from "../controllers/accomplishment.controller.js";

const router = express.Router();

router.post("/generate", generateAccomplishment);

export default router; 
