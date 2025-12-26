import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { Pinecone } from "@pinecone-database/pinecone";
import admin from "firebase-admin";
import bcrypt from "bcrypt";
import fs from "fs";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";


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

const auth = getAuth();
const db = admin.firestore();
const PORT = process.env.PORT || 5000;


async function startServer() {
  try {
    // ✅ Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    console.log("✅ Pinecone initialized");

    const INDEX_NAME = "train-mate11";
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

 const aot = await db.collection("companies").get();

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

    // ✅ Update Super Admin
    app.put("/superadmins/:id", async (req, res) => {
      const { id } = req.params;
      const { email, oldPassword, newPassword } = req.body;

      try {
        const docRef = db.collection("super_admins").doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
          return res.status(404).json({ message: "Admin not found" });
        }

        const adminData = docSnap.data();

        if (newPassword) {
          if (!oldPassword || oldPassword !== adminData.password) {
            return res.status(400).json({ message: "Old password is incorrect" });
          }
        }

        const updateData = { email };
        if (newPassword) updateData.password = newPassword;

        await docRef.update(updateData);
        res.json({ message: "Super Admin updated successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });


// ✅ Add Company (Auth + Firestore)
app.post("/add-company", async (req, res) => {
  console.log("✅ Request body:", req.body);

  const { name, email, phone, address, status, createdAt } = req.body;

  if (!name || !email || !phone || !address) {
    console.log("❌ Missing fields");
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // 🔹 Firebase Auth
    const tempPassword = Math.random().toString(36).slice(-8);
    console.log("Creating Firebase Auth user:", email);

    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: name,
    });

    console.log("✅ Auth user created:", userRecord.uid);

    // 🔹 Firestore
    await db.collection("companies").doc(userRecord.uid).set({
      name,
      email,
      phone,
      address,
      status,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    });

    console.log("✅ Firestore doc created");

    res.status(201).json({
      uid: userRecord.uid,
      username: name,
      email,
      password: tempPassword,
    });
  } catch (err) {
    console.error("❌ /add-company error:", err);
    res.status(500).json({ message: err.message });
  }
});


app.put("/companies/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address } = req.body;

    if (!name || !email || !phone || !address) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Update Firestore
    await db.collection("companies").doc(id).update({
      name,
      email,
      phone,
      address,
    });

    // Update Firebase Auth email & displayName
    await admin.auth().updateUser(id, {
      email,
      displayName: name,
    });

    res.json({ message: "Company updated!" });
  } catch (err) {
    console.error("❌ /companies/:id error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ================= Toggle Status =================
app.put("/companies/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await db.collection("companies").doc(id).update({ status });
    res.json({ message: "Status updated", status });
  } catch (err) {
    console.error("❌ /companies/:id/status error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ================= Delete Company =================
app.delete("/companies/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Delete Firestore doc
    await db.collection("companies").doc(id).delete();

    // Delete Firebase Auth user
    await admin.auth().deleteUser(id);

    res.json({ message: "Company deleted!" });
  } catch (err) {
    console.error("❌ /companies/:id delete error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ================= Get Companies =================
app.get("/companies", async (req, res) => {
  try {
    const snapshot = await db.collection("companies").get();
    const companies = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(companies);
  } catch (err) {
    console.error("❌ /companies GET error:", err);
    res.status(500).json({ message: err.message });
  }
});



  
    // ✅ Total companies count
app.get("/stats/companies", async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection("companies").get();
    res.json({ count: snapshot.size });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch companies count" });
  }
});

// ✅ Total users count (if you have users collection, else return 0 for now)
app.get("/stats/users", async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection("users").get();
    res.json({ count: snapshot.size });
  } catch (error) {
    res.json({ count: 0 });
  }
});

// ✅ Total super admins
app.get("/stats/superadmins", async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection("super_admins").get();
    res.json({ count: snapshot.size });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch super admins count" });
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
app.put("/superadmins/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email, oldPassword, newPassword } = req.body;

    const adminRef = db.collection("super_admins").doc(id);
    const adminSnap = await adminRef.get();

    if (!adminSnap.exists) {
      return res.status(404).json({ message: "Super admin not found" });
    }

    const adminData = adminSnap.data();

    // 🔹 EMAIL UPDATE
    if (email) {
      await adminRef.update({ email });
      return res.json({ message: "Email updated successfully" });
    }

    // 🔹 PASSWORD UPDATE
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "Missing password fields" });
    }

    const isMatch = await bcrypt.compare(oldPassword, adminData.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Old password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await adminRef.update({ password: hashedPassword });

    return res.json({ message: "Password updated successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

startServer();
