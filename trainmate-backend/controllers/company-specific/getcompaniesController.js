import { db, admin } from "../../config/firebase.js";
// ================= Get Companies =================
export const getAllCompanies = async (req, res) => {
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
};