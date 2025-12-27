import { db,admin } from "../../config/firebase.js";

    // ✅ Total companies count
export const getTotalCompanies = async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection("companies").get();
    res.json({ count: snapshot.size });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch companies count" });
  }
};
