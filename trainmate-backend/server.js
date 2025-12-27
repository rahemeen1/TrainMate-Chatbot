import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import admin from "firebase-admin";
import "./config/firebase.js"; 
import { db } from "./config/firebase.js";
import companyRoutes from "./routes/companyRoutes.js";
import superAdminRoutes from "./routes/superAdminRoutes.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    const aot = await db.collection("companies").get();

    app.use("/api", superAdminRoutes);
    app.use("/api", companyRoutes);
  
// ✅ Total users count (if you have users collection, else return 0 for now)
app.get("/stats/users", async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection("users").get();
    res.json({ count: snapshot.size });
  } catch (error) {
    res.json({ count: 0 });
  }
});


    // ✅ Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("❌ Pinecone Initialization Error:", error);
  }
}


startServer();
