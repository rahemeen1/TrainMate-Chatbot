import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

// Get all users for a company
export const getCompanyUsers = async (req, res) => {
  try {
    const { companyId } = req.params;
    if (!companyId) return res.status(400).json({ error: "companyId missing" });

    const usersSnap = await db.collectionGroup("users").get();
    const users = [];

    usersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.companyId === companyId) {
        users.push({ id: docSnap.id, ...data });
      }
    });

    res.status(200).json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Delete user (Auth + Firestore)
export const deleteUser = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: "Email missing" });

    // Delete from Auth (if exists)
    try {
      const user = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(user.uid);
    } catch (authErr) {
      if (authErr.code !== "auth/user-not-found") {
        throw authErr; // Re-throw if not "user not found" error
      }
      console.log(`User not found in Firebase Auth: ${email}. Continuing with Firestore deletion.`);
    }

    // Delete from Firestore
    const usersSnap = await db.collectionGroup("users").where("email", "==", email).get();
    const deletePromises = usersSnap.docs.map((docSnap) => docSnap.ref.delete());
    await Promise.all(deletePromises);

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
