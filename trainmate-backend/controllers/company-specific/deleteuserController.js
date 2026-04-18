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

// Delete user (Auth + Firestore + all subcollections like roadmaps, chats, accomplishments, etc.)
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
      console.log(`✅ Deleted user from Firebase Auth: ${email}`);
    } catch (authErr) {
      if (authErr.code !== "auth/user-not-found") {
        throw authErr; // Re-throw if not "user not found" error
      }
      console.log(`⚠️ User not found in Firebase Auth: ${email}. Continuing with Firestore deletion.`);
    }

    // Delete from Firestore (including all subcollections: roadmap, chats, accomplishments, learningProfile, etc.)
    for (const docSnap of usersSnap.docs) {
      console.log(`🗑️ Deleting user and all data for: ${email}`);
      
      // Use recursiveDelete to delete document and all subcollections
      // This includes:
      // - roadmap (learning paths and modules)
      // - chats (conversation history)
      // - accomplishments
      // - learningProfile (learning preferences and progress)
      // - notificationPreferences
      // - quizAttempts (quiz history and scores)
      // - Any other subcollections
      await db.recursiveDelete(docSnap.ref);
      
      console.log(`✅ User deleted with all subcollections: ${email}`);
    }

    // Note: Pinecone data (vector embeddings) is company-scoped, not user-scoped
    // It will be cleaned up when the company is deleted. Individual user deletion
    // doesn't need to clean Pinecone since documents are indexed by docId (company docs), not userId.

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

    res.status(200).json({ 
      message: "User and all associated data (roadmaps, chats, accomplishments, etc.) deleted successfully",
      email: email,
      deletedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ error: err.message });
  }
};
