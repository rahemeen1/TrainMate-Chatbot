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

    const INDEX_NAME = "train-mate9";
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

    // ✅ Add Super Admin
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

        const snapshot = await db
          .collection("super_admins")
          .orderBy("adminId", "desc")
          .limit(1)
          .get();

        const lastId = snapshot.empty ? 0 : snapshot.docs[0].data().adminId;
        const newAdminId = lastId + 1;

        await db.collection("super_admins").doc(String(newAdminId)).set({
          adminId: newAdminId,
          email,
          password,
        });

        res.json({
          message: `Super Admin added successfully with ID ${newAdminId}`,
        });
      } catch (err) {
        console.error(err);
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

    // ✅ Add Company
    app.post("/add-company", async (req, res) => {
      const { name, email, phone, address } = req.body;

      if (!name || !email) {
        return res.status(400).json({ message: "Company name and email are required" });
      }

      try {
        const companiesRef = db.collection("companies");

        const nameExists = await companiesRef.where("name", "==", name).get();
        if (!nameExists.empty) {
          return res.status(409).json({ message: "Company name already exists" });
        }

        const emailExists = await companiesRef.where("email", "==", email).get();
        if (!emailExists.empty) {
          return res.status(409).json({ message: "Company email already exists" });
        }

        const lastDoc = await companiesRef
          .orderBy("companyIdNum", "desc")
          .limit(1)
          .get();

        const lastId = lastDoc.empty ? 0 : lastDoc.docs[0].data().companyIdNum;
        const newId = lastId + 1;

        const baseId = name.trim().toLowerCase().replace(/\s+/g, "");
        const loginId = `${baseId}_trainmate${newId}`;

        await companiesRef.doc(String(newId)).set({
          companyIdNum: newId,
          companyId: loginId,
          name,
          email,
          phone: phone || "",
          address: address || "",
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          username: loginId,
          password: `${baseId}@${newId}`,
        });

        res.json({
          message: "✅ Company added successfully",
          id: newId,
          username: loginId,
          password: `${baseId}@${newId}`,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });

    // ✅ GET Companies (FIXED ✅)
    app.get("/companies", async (req, res) => {
      try {
        const snapshot = await db.collection("companies").get();

        const companies = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        res.json(companies);
      } catch (error) {
        console.error("❌ Error fetching companies:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // ✅ Toggle status
    app.put("/companies/:id/status", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      try {
        await db.collection("companies").doc(id).update({ status });
        res.json({ message: "Status updated", status });
      } catch (error) {
        console.error("❌ Status update error:", error);
        res.status(500).json({ error: "Failed to update status" });
      }
    });

    // ✅ Edit company
    app.put("/companies/:id", async (req, res) => {
      const { id } = req.params;
      const { email, phone, address } = req.body;

      try {
        await db.collection("companies").doc(id).update({
          email,
          phone,
          address,
        });

        res.json({ message: "Company updated!" });
      } catch (error) {
        console.error("❌ Edit error:", error);
        res.status(500).json({ error: "Edit failed" });
      }
    });

    // ✅ Delete company
    app.delete("/companies/:id", async (req, res) => {
      const { id } = req.params;
      try {
        await db.collection("companies").doc(id).delete();
        res.json({ message: "Company deleted!" });
      } catch (error) {
        console.error("❌ Delete error:", error);
        res.status(500).json({ error: "Delete failed" });
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
// POST /company-login

   app.post("/company-login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check for missing credentials
    if (!username || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    const companyRef = db.collection("companies");
    const querySnapshot = await companyRef
      .where("companyId", "==", username)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return res.status(404).json({ message: "Company not found" });
    }

    const company = querySnapshot.docs[0].data();

    // Check password (plain text for now; later hash it!)
    if (company.password !== password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Login successful
    return res.json({
      message: "Login successful",
      companyId: company.companyId,
      name: company.name,
      email: company.email,
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    return res.status(500).json({ message: "Server error" });
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
