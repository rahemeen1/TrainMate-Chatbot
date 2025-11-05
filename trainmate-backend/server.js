import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { Pinecone } from "@pinecone-database/pinecone";
import admin from "firebase-admin";
import fs from "fs";
import bcrypt from "bcryptjs"; 
import crypto from "crypto";
import { db } from "./firebase.js";

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

    const INDEX_NAME = "train-mate111";
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
    // app.post("/login/superadmin", async (req, res) => {
    //   const { email, password } = req.body;
    //   try {
    //     const snapshot = await db
    //       .collection("super_admins")
    //       .where("email", "==", email)
    //       .where("password", "==", password)
    //       .get();

    //     if (snapshot.empty)
    //       return res.status(401).json({ message: "Invalid credentials" });

    //     const user = snapshot.docs[0].data();
    //     res.json({ message: "Super Admin login successful", user });
    //   } catch (error) {
    //     res.status(500).json({ message: "Error logging in", error });
    //   }
    // });
    app.post("/login/superadmin", async (req, res) => {
  const { email, password } = req.body;
  try {
    const snapshot = await db
      .collection("super_admins")
      .where("email", "==", email)
      .get();

    if (snapshot.empty)
      return res.status(401).json({ message: "Invalid credentials" });

    const user = snapshot.docs[0].data();
    const match = await bcrypt.compare(password, user.password);

    if (!match)
      return res.status(401).json({ message: "Invalid credentials" });

    res.json({ message: "Super Admin login successful", user });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error });
  }
});


<<<<<<< HEAD
    // ✅ Add Super Admin with incremental adminId
app.post("/add-superadmin", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email & Password required" });

  try {
    // Check if email already exists
    const exists = await db
      .collection("super_admins")
      .where("email", "==", email)
      .get();

    if (!exists.empty) {
      return res.status(409).json({ message: "Email already exists" });
    }

    // Find the max adminId
    const snapshot = await db
      .collection("super_admins")
      .orderBy("adminId", "desc")
      .limit(1)
      .get();

    const lastId = snapshot.empty ? 0 : snapshot.docs[0].data().adminId;
    const newAdminId = lastId + 1;

    // ✅ Add new super admin with numeric adminId
    await db.collection("super_admins").doc(String(newAdminId)).set({
      adminId: newAdminId,
      email,
      password, // hash in production
    });

    res.json({
      message: `Super Admin added successfully with ID ${newAdminId}`,
    });
=======
    // ✅ Add Super Admin (checks duplicate email)
    // app.post("/add-superadmin", async (req, res) => {
    //   const { email, password } = req.body;

    //   if (!email || !password)
    //     return res.status(400).json({ message: "Email & Password required" });

    //   try {
    //     const exists = await db
    //       .collection("super_admins")
    //       .where("email", "==", email)
    //       .get();

    //     if (!exists.empty) {
    //       return res.status(409).json({ message: "Email already exists" });
    //     }

    //     await db.collection("super_admins").add({ email, password });

    //     res.json({ message: "Super Admin added successfully" });
    //   } catch (err) {
    //     res.status(500).json({ message: "Server error" });
    //   }
    // });
  app.post("/add-superadmin", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email & Password required" });

  try {
    // Check if email already exists
    const exists = await db
      .collection("super_admins")
      .where("email", "==", email)
      .get();

    if (!exists.empty) {
      return res.status(409).json({ message: "Email already exists" });
    }

    // Generate next ID like C101, C102...
    const snapshot = await db.collection("super_admins").get();

    const existingIds = snapshot.docs
      .map((doc) => doc.id)
      .filter((id) => id.startsWith("C"))
      .map((id) => parseInt(id.replace("C", ""), 10))
      .filter((num) => !isNaN(num));

    const nextNumber = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 101;
    const customId = `C${nextNumber}`;

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection("super_admins").doc(customId).set({
      email,
      password: hashedPassword,
    });

    res.json({ message: "Super Admin added successfully", customId });
>>>>>>> eea7edfbc612f443ce0dfc64c659e0953ea0c646
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

<<<<<<< HEAD
=======

>>>>>>> eea7edfbc612f443ce0dfc64c659e0953ea0c646
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
  const { email, oldPassword, newPassword } = req.body;

  try {
    const docRef = db.collection("super_admins").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const admin = docSnap.data();

    // ✅ If user wants to update password, oldPassword must match
    if (newPassword) {
      if (!oldPassword || oldPassword !== admin.password) {
        return res.status(400).json({ message: "Old password is incorrect" });
      }
    }

    // Prepare update object
    const updateData = { email };
    if (newPassword) updateData.password = newPassword; // update password only if verified

    await docRef.update(updateData);
    res.json({ message: "Super Admin updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


    //forget password route
    app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const snapshot = await db
      .collection("super_admins")
      .where("email", "==", email)
      .get();

    if (snapshot.empty)
      return res.status(404).json({ message: "Email not found" });

    const doc = snapshot.docs[0];
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = Date.now() + 15 * 60 * 1000; // 15 mins

    await db.collection("super_admins").doc(doc.id).update({
      resetToken,
      resetExpires,
    });

    // TODO: Send email or show resetToken on console for dev
    console.log("Reset token:", resetToken);

    res.json({ message: "Reset link generated", resetToken });
  } catch (error) {
    res.status(500).json({ message: "Error generating reset token", error });
  }
});

//reset password route
app.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const snapshot = await db
      .collection("super_admins")
      .where("resetToken", "==", token)
      .get();

    if (snapshot.empty)
      return res.status(400).json({ message: "Invalid or expired token" });

    const doc = snapshot.docs[0];
    const user = doc.data();

    if (Date.now() > user.resetExpires)
      return res.status(400).json({ message: "Token expired" });

    const hashed = await bcrypt.hash(newPassword, 10);

    await db.collection("super_admins").doc(doc.id).update({
      password: hashed,
      resetToken: null,
      resetExpires: null,
    });

    res.json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: "Error resetting password", error });
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
