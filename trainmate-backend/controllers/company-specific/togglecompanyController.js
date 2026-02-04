
//backend/controllers/company-specific/togglecompanyController.js
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
 
// import { db, admin } from "../../config/firebase.js";

// export const toggleCompanyStatus = async (req, res) => {
//   try {
//     const { id } = req.params; // companyId
//     const { status } = req.body;

//     console.log("Company toggle:", id, status);
//     console.log("🔥 TOGGLE COMPANY API HIT");
// console.log("Company ID:", req.params.id);
// console.log("New Status:", req.body.status);


//     // 1️⃣ Update company status
//     await db.collection("companies").doc(id).update({ status });

//     // 2️⃣ Get all departments
//     const deptSnap = await db
//       .collection("freshers")
//       .doc(id)
//       .collection("departments")
//       .get();

//     // 3️⃣ Loop departments → users
//     for (const deptDoc of deptSnap.docs) {
//       const usersSnap = await deptDoc.ref
//         .collection("users")
//         .get();

//       for (const userDoc of usersSnap.docs) {
//         const fresherData = userDoc.data();
//         const authUid = fresherData.userId; // ✅ CORRECT UID

//         console.log("Updating fresher:", authUid);

//         // ✅ Update Firestore status
//         await userDoc.ref.update({
//           status,
//         });

//         // ✅ Block / unblock Firebase login
//         if (authUid) {
//           await admin.auth().updateUser(authUid, {
//             disabled: status === "suspended",
//           });
//         }
//       }
//     }

//     res.json({
//       message: "Company & all freshers updated successfully",
//       status,
//     });
//   } catch (err) {
//     console.error("❌ toggleCompanyStatus error:", err);
//     res.status(500).json({ message: err.message });
//   }
// };
