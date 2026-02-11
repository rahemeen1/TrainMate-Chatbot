import dotenv from "dotenv";
dotenv.config();
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
import moduleExplain from "./routes/moduleExplain.js";
import quizRoutes from "./routes/quizRoutes.js";



const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

async function startServer() {
    await initPinecone();
  const aot = await db.collection("companies").get();

    app.use("/api", superAdminRoutes);
    app.use("/api", companyRoutes);
    app.use("/api", ingestRoutes);
    app.use("/api/roadmap", roadmapRoutes);
    app.use("/api", chatRoute);
// app.use("/api/stats", statsRoutes);
app.use("/api/module", moduleExplain);
    app.use("/api", quizRoutes);
  

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
}


startServer();
