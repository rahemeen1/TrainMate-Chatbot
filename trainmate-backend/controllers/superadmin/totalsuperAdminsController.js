import { db ,admin} from "../../config/firebase.js";
// ✅ Total super admins
export const getTotalSuperAdmins = async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection("super_admins").get();
    res.json({ count: snapshot.size });
    console.log("Snapshot size:", snapshot.size);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch super admins count" });
    
  }
};
    