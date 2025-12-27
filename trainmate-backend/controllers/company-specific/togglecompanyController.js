import {db, admin} from "../../config/firebase.js";

// ================= Toggle Status =================
export const toggleCompanyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await db.collection("companies").doc(id).update({ status });
    res.json({ message: "Status updated", status });
  } catch (err) {
    console.error("❌ /companies/:id/status error:", err);
    res.status(500).json({ message: err.message });
  }
};
 
