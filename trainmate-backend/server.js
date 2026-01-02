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
  

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
}


startServer();




  
// // ✅ Total users count (if you have users collection, else return 0 for now)
// app.get("/stats/users", async (req, res) => {
//   try {
//     const snapshot = await admin.firestore().collection("users").get();
//     res.json({ count: snapshot.size });
//   } catch (error) {
//     res.json({ count: 0 });
//   }
// });