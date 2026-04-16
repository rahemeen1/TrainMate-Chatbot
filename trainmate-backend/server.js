import dotenv from "dotenv";
dotenv.config();
console.log("🔑 GEMINI_API_KEY loaded:", process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...` : "❌ NOT FOUND");
import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import "./config/firebase.js"; 
import { db } from "./config/firebase.js";
import companyRoutes from "./routes/companyRoutes.js";
import superAdminRoutes from "./routes/superAdminRoutes.js";
import { initPinecone } from "./config/pinecone.js";
import ingestRoutes from "./routes/ingestroutes.js";
import roadmapRoutes from "./routes/roadmapRoutes.js";
import chatRoute from "./routes/chatRoutes.js";
import companyFresherChatRoutes from "./routes/companyFresherChatRoutes.js";
import moduleExplain from "./routes/moduleExplain.js";
import quizRoutes from "./routes/quizRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import aiInsightsRoutes from "./routes/aiInsightsRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import { initializeScheduledJobs } from "./services/scheduledJobs.js";
import { initializeAutonomousAgentRuntime } from "./services/autonomy/runtime/runtime.service.js";



const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await initPinecone();
  } catch (error) {
    console.error("⚠️ Failed to initialize Pinecone, continuing without it:", error.message);
  }
  
  // Initialize scheduled jobs (daily reminders, etc.)
  try {
    initializeScheduledJobs();
  } catch (error) {
    console.error("⚠️ Failed to initialize scheduled jobs:", error.message);
  }

  // Initialize persistent autonomous runtime loop
  try {
    initializeAutonomousAgentRuntime();
  } catch (error) {
    console.error("⚠️ Failed to initialize autonomous runtime:", error.message);
  }
  
  const aot = await db.collection("companies").get();

    app.use("/api", superAdminRoutes);
    app.use("/api", companyRoutes);
    app.use("/api", ingestRoutes);
    app.use("/api/roadmap", roadmapRoutes);
    app.use("/api", chatRoute);
    app.use("/api/company-chat", companyFresherChatRoutes);
// app.use("/api/stats", statsRoutes);
app.use("/api/module", moduleExplain);
    app.use("/api", quizRoutes);
    app.use("/api/auth", authRoutes);
    app.use("/api", notificationRoutes);
    app.use("/api", aiInsightsRoutes);
    app.use("/api", emailRoutes);
  

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
}


startServer();
