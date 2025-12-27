import { db, admin } from "../../config/firebase.js";

// ✅ Update Company (Firestore + Firebase Auth)
export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address } = req.body;

    if (!name || !email || !phone || !address) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // 🔹 Update Firestore
    await db.collection("companies").doc(id).update({
      name,
      email,
      phone,
      address,
    });

    // 🔹 Update Firebase Auth
    await admin.auth().updateUser(id, {
      email,
      displayName: name,
    });

    res.json({ message: "Company updated!" });
  } catch (err) {
    console.error("❌ /companies/:id error:", err);
    res.status(500).json({ message: err.message });
  }
};