import { db, admin } from "../../config/firebase.js";

export const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params; // companyId

    const companyRef = db.collection("companies").doc(id);
    const freshersCompanyRef = db.collection("freshers").doc(id);
    const companySnap = await companyRef.get();
    const companyData = companySnap.exists ? companySnap.data() : null;

    // 1️⃣ Find users only under freshers/{companyId}/departments/*/users/*
    const departmentsSnap = await freshersCompanyRef.collection("departments").get();
    const usersToDelete = [];

    for (const deptDoc of departmentsSnap.docs) {
      const usersSnap = await deptDoc.ref.collection("users").get();
      usersToDelete.push(...usersSnap.docs);
    }

    // 2️⃣ Delete each user from Firebase Auth so they cannot login
    let deletedAuthUsers = 0;
    for (const userDoc of usersToDelete) {
      const userData = userDoc.data();
      const userEmail = userData?.email;

      if (!userEmail) {
        continue;
      }

      try {
        const authUser = await admin.auth().getUserByEmail(userEmail);
        await admin.auth().deleteUser(authUser.uid);
        deletedAuthUsers += 1;
      } catch (authErr) {
        if (authErr.code !== "auth/user-not-found") {
          throw authErr;
        }
      }
    }

    // 3️⃣ Hard delete company Firestore documents (full document + subcollections)
    await db.recursiveDelete(freshersCompanyRef);
    await db.recursiveDelete(companyRef);

    // 4️⃣ Delete company account in Firebase Auth
    try {
      await admin.auth().deleteUser(id);
    } catch (authErr) {
      if (authErr.code === "auth/user-not-found" && companyData?.email) {
        try {
          const companyAuthUser = await admin.auth().getUserByEmail(companyData.email);
          await admin.auth().deleteUser(companyAuthUser.uid);
        } catch (emailLookupErr) {
          if (emailLookupErr.code !== "auth/user-not-found") {
            throw emailLookupErr;
          }
        }
      } else if (authErr.code !== "auth/user-not-found") {
        throw authErr;
      }
    }

    res.json({
      message: "Company and all company users deleted successfully",
      companyId: id,
      deletedUsersCount: usersToDelete.length,
      deletedAuthUsers,
    });
  } catch (err) {
    console.error("❌ deleteCompany error:", err);
    res.status(500).json({ message: err.message });
  }
};
