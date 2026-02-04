// import {db, admin} from "../../config/firebase.js";

// // ================= Delete Company =================
// export const deleteCompany = async (req, res) => {
//   try {
//     const { id } = req.params;

//     // Delete Firestore doc
//     await db.collection("companies").doc(id).delete();

//     // Delete Firebase Auth user
//     await admin.auth().deleteUser(id);

//     res.json({ message: "Company deleted!" });
//   } catch (err) {
//     console.error("❌ /companies/:id delete error:", err);
//     res.status(500).json({ message: err.message });
//   }
// };

import { db, admin } from "../../config/firebase.js";

export const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params; // companyId

    // 1️⃣ Get all freshers of this company
    const freshersSnap = await db
      .collection("freshers")
      .where("companyId", "==", id)
      .get();

    // 2️⃣ Delete freshers (Firestore + Auth)
    for (const doc of freshersSnap.docs) {
      await admin.auth().deleteUser(doc.id); // auth
      await doc.ref.delete(); // firestore
    }

    // 3️⃣ Delete company auth & firestore
    await admin.auth().deleteUser(id);
    await db.collection("companies").doc(id).delete();

    res.json({ message: "Company & all freshers deleted!" });
  } catch (err) {
    console.error("❌ deleteCompany error:", err);
    res.status(500).json({ message: err.message });
  }
};
