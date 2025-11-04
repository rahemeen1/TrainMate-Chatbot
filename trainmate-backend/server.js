import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { Pinecone } from "@pinecone-database/pinecone";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Load Firebase JSON manually
const serviceAccount = JSON.parse(
  fs.readFileSync("./serviceAccountKey.json", "utf8")
);

// ✅ Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // ✅ Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    console.log("✅ Pinecone initialized");

    const INDEX_NAME = "train-mate20";
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

    // ------------------------------------------
    // ✅ ✅ ✅ ROUTES BELOW HERE
    // ------------------------------------------

    // ✅ Login Super Admin
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

    // ✅ Add Super Admin (checks duplicate email)
    app.post("/add-superadmin", async (req, res) => {
      const { email, password } = req.body;

      if (!email || !password)
        return res.status(400).json({ message: "Email & Password required" });

      try {
        const exists = await db
          .collection("super_admins")
          .where("email", "==", email)
          .get();

        if (!exists.empty) {
          return res.status(409).json({ message: "Email already exists" });
        }

        await db.collection("super_admins").add({ email, password });

        res.json({ message: "Super Admin added successfully" });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // ✅ Get all Super Admins
    app.get("/superadmins", async (req, res) => {
      try {
        const snapshot = await db.collection("super_admins").get();
        const admins = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        res.json({ admins });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // ✅ Delete Super Admin
    app.delete("/superadmins/:id", async (req, res) => {
      const { id } = req.params;

      try {
        await db.collection("super_admins").doc(id).delete();
        res.json({ message: "Super Admin deleted successfully" });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // ✅ Update Super Admin
    app.put("/superadmins/:id", async (req, res) => {
      const { id } = req.params;
      const { email, password } = req.body;

      try {
        await db.collection("super_admins").doc(id).update({ email, password });
        res.json({ message: "Super Admin updated successfully" });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // ✅ Start Server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("❌ Pinecone Initialization Error:", error);
  }
}

startServer();
