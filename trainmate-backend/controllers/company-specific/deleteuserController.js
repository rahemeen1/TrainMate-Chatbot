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

    // Find user document first to get companyId
    const usersSnap = await db.collectionGroup("users").where("email", "==", email).get();
    
    if (usersSnap.empty) {
      return res.status(404).json({ error: "User not found in Firestore" });
    }

    // Get company ID from user document path
    const userDoc = usersSnap.docs[0];
    const pathSegments = userDoc.ref.path.split('/');
    const companyId = pathSegments[1]; // Path: freshers/{companyId}/departments/{dept}/users/{userId}

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
    const deletePromises = usersSnap.docs.map((docSnap) => docSnap.ref.delete());
    await Promise.all(deletePromises);

    // Track deleted users count in company document
    if (companyId) {
      try {
        const companyRef = db.collection("companies").doc(companyId);
        const companyDoc = await companyRef.get();
        
        if (companyDoc.exists) {
          await companyRef.update({
            deletedUsersCount: admin.firestore.FieldValue.increment(1),
            lastUserDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`✅ Updated deletedUsersCount for company ${companyId}`);
        }
      } catch (trackingErr) {
        console.error("⚠️ Failed to track deleted users count:", trackingErr);
        // Don't fail the delete operation if tracking fails
      }
    }

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
