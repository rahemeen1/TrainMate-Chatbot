//delete company controller 
import { db, admin } from "../../config/firebase.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const buildAuthEmailIndex = async () => {
  const emailToUid = new Map();
  let pageToken;

  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const user of page.users) {
      const normalized = normalizeEmail(user.email);
      if (normalized) {
        emailToUid.set(normalized, user.uid);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return emailToUid;
};

const deleteAuthUserByIdentifier = async ({ uids = [], email, authEmailIndex }) => {
  const uidCandidates = [...new Set(uids.filter(Boolean).map((value) => String(value).trim()))];

  for (const uid of uidCandidates) {
    try {
      await admin.auth().deleteUser(uid);
      return true;
    } catch (authErr) {
      if (authErr.code !== "auth/user-not-found") {
        // Invalid UID and other UID-shape errors can happen with legacy data.
        // Keep trying email-based fallbacks before failing the company deletion.
        if (authErr.code !== "auth/invalid-uid") {
          throw authErr;
        }
      }
    }
  }

  const normalizedEmail = normalizeEmail(email);

  if (normalizedEmail) {
    const indexedUid = authEmailIndex?.get(normalizedEmail);
    if (indexedUid) {
      try {
        await admin.auth().deleteUser(indexedUid);
        authEmailIndex.delete(normalizedEmail);
        return true;
      } catch (authErr) {
        if (authErr.code !== "auth/user-not-found") {
          throw authErr;
        }
      }
    }

    try {
      const authUser = await admin.auth().getUserByEmail(normalizedEmail);
      await admin.auth().deleteUser(authUser.uid);
      if (authEmailIndex) {
        authEmailIndex.delete(normalizedEmail);
      }
      return true;
    } catch (authErr) {
      if (authErr.code !== "auth/user-not-found") {
        throw authErr;
      }
    }
  }

  return false;
};

export const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params; // companyId

    const companyRef = db.collection("companies").doc(id);
    const freshersCompanyRef = db.collection("freshers").doc(id);
    const companySnap = await companyRef.get();
    const companyData = companySnap.exists ? companySnap.data() : null;

    // 1️⃣ Collect every fresher/user doc that belongs to this company.
    // We merge both strategies because some legacy docs may miss companyId.
    const usersByPath = new Map();

    const usersSnap = await db.collectionGroup("users").where("companyId", "==", id).get();
    for (const userDoc of usersSnap.docs) {
      usersByPath.set(userDoc.ref.path, userDoc);
    }

    const departmentsSnap = await freshersCompanyRef.collection("departments").get();
    for (const deptDoc of departmentsSnap.docs) {
      const deptUsersSnap = await deptDoc.ref.collection("users").get();
      for (const userDoc of deptUsersSnap.docs) {
        usersByPath.set(userDoc.ref.path, userDoc);
      }
    }

    const usersToDelete = Array.from(usersByPath.values());

    // 2️⃣ Delete each user from Firebase Auth so they cannot login again with the same email
    const authEmailIndex = await buildAuthEmailIndex();
    let deletedAuthUsers = 0;
    for (const userDoc of usersToDelete) {
      const userData = userDoc.data();
      const deleted = await deleteAuthUserByIdentifier({
        uids: [
          userData?.authUid,
          userData?.uid,
          userData?.firebaseUid,
          userData?.firebaseUID,
          userData?.userId,
          userDoc.id,
        ],
        email: userData?.email || userData?.userEmail || userData?.mail,
        authEmailIndex,
      });

      if (deleted) {
        deletedAuthUsers += 1;
      }
    }

    // 3️⃣ Delete company account in Firebase Auth
    await deleteAuthUserByIdentifier({
      uids: [id],
      email: companyData?.email,
      authEmailIndex,
    });

    // 4️⃣ Hard delete company Firestore documents (full document + subcollections)
    await db.recursiveDelete(freshersCompanyRef);
    await db.recursiveDelete(companyRef);

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