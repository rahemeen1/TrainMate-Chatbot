import { db } from "../../config/firebase.js";

// ✅ Get all Super Admins
export const getAllSuperAdmins = async (req, res) => {
  try {
    const snapshot = await db.collection("super_admins").get();

    const admins = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ admins });
  } catch (error) {
    console.error("Get Super Admins Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

