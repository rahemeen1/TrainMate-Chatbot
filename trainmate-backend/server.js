import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { Pinecone } from "@pinecone-database/pinecone";
import { db } from "./firebase.js";

// app.use(cors());
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // ===========================
    // 🔹 Initialize Pinecone
    // ===========================
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    console.log("✅ Pinecone initialized");

    const INDEX_NAME = "train-mate19";
    const DIMENSION = 1536;

    const { indexes } = await pinecone.listIndexes();

    if (!indexes.includes(INDEX_NAME)) {
      console.log(`🆕 Creating index '${INDEX_NAME}' ...`);

      await pinecone.createIndex({
        name: INDEX_NAME,
        dimension: DIMENSION,
        metric: "cosine",
        spec: {
          serverless: {
            cloud: "aws",
            region: "us-east-1",
          },
        },
      });

      console.log(`✅ Index '${INDEX_NAME}' created`);
    } else {
      console.log(`✅ Index '${INDEX_NAME}' already exists`);
    }

    const index = pinecone.index(INDEX_NAME);

    // ===========================
    // 🔹 Pinecone Test Routes
    // ===========================
    app.get("/check-pinecone", async (req, res) => {
      try {
        const { indexes } = await pinecone.listIndexes();
        res.json({ success: true, indexes });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    app.get("/test-vector", async (req, res) => {
      try {
        const testVector = Array(DIMENSION).fill(0.5);

        await index.upsert([{ id: "test1", values: testVector }]);
        const result = await index.query({
          topK: 1,
          vector: testVector,
        });

        res.json({ message: "✅ Vector upserted and queried!", result });
      } catch (error) {
        res.json({ error: error.message });
      }
    });

    // ===========================
    // 🔹 FIREBASE LOGIN ROUTES
    // ===========================

    // Super Admin Login
    app.post("/login/superadmin", async (req, res) => {
      const { email, password } = req.body;
      try {
        const snapshot = await db
          .collection("super_admins")
          .where("email", "==", email)
          .where("password", "==", password)
          .get();

        if (snapshot.empty)
          return res.status(401).json({ message: "Invalid credentials" });

        const user = snapshot.docs[0].data();
        res.json({ message: "Super Admin login successful", user });
      } catch (error) {
        res.status(500).json({ message: "Error logging in", error });
      }
    });

    // Company Admin Login
    app.post("/login/company", async (req, res) => {
      const { email, password } = req.body;
      try {
        const snapshot = await db
          .collection("companies")
          .where("email", "==", email)
          .where("password", "==", password)
          .get();

        if (snapshot.empty)
          return res.status(401).json({ message: "Invalid credentials" });

        const company = snapshot.docs[0].data();
        res.json({ message: "Company Admin login successful", company });
      } catch (error) {
        res.status(500).json({ message: "Error logging in", error });
      }
    });

    // Candidate Login
    app.post("/login/candidate", async (req, res) => {
      const { email, password } = req.body;
      try {
        const snapshot = await db
          .collection("candidates")
          .where("email", "==", email)
          .where("password", "==", password)
          .get();

        if (snapshot.empty)
          return res.status(401).json({ message: "Invalid credentials" });

        const candidate = snapshot.docs[0].data();
        res.json({ message: "Candidate login successful", candidate });
      } catch (error) {
        res.status(500).json({ message: "Error logging in", error });
      }
    });

    // ===========================
    // 🔹 START SERVER
    // ===========================
    app.listen(PORT, () => {
      console.log(`🚀 Server running successfully on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error initializing Pinecone:", err);
  }
}

// Call the async function
startServer();
