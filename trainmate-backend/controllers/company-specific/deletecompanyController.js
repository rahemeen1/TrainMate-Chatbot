import {db, admin} from "../../config/firebase.js";

// ================= Delete Company =================
export const deleteCompany = async (req, res) => {
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
};