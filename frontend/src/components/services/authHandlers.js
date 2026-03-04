//frontend/src/components/services/authHandlers.js
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../firebase";
import { collection, collectionGroup, getDoc, getDocs, doc, query, where, setDoc, deleteField } from "firebase/firestore";

export const handleLogin = async ({
  userType,
  formData,
  navigate,
  onClose,
}) => {
  try {
    // FRESHER LOGIN
    if (userType === "fresher") {

      const email = formData.emailOrUsername?.trim().toLowerCase();
      const password = formData.password;

      if (!email || !password) {
        return { error: "Email or password missing" };
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: "Invalid fresher email format" };
      }

      await signInWithEmailAndPassword(auth, email, password);

      const usersQuery = query(
        collectionGroup(db, "users"),
        where("email", "==", email)
      );
      const usersSnap = await getDocs(usersQuery);

      if (usersSnap.empty) {
        return { error: "Fresher record not found" };
      }

      const fresherDoc = usersSnap.docs[0];
      const fresherData = fresherDoc.data();
      const deptDoc = fresherDoc.ref.parent.parent;
      const companyDoc = deptDoc?.parent?.parent;

      const userId = fresherDoc.id;
      const deptId = deptDoc?.id;
      const companyId = companyDoc?.id;

      if (!companyId || !deptId) {
        return { error: "Fresher record not found" };
      }

      const companySnap = await getDoc(doc(db, "companies", companyId));
      const companyName = companySnap.exists()
        ? companySnap.data().name
        : fresherData.companyName || "";
      const companyStatus = companySnap.exists() ? companySnap.data().status : null;

      if (companyStatus && companyStatus !== "active") {
        return { error: "Your company is suspended. Contact admin." };
      }

      console.log("➡ Navigating to dashboard");

      onClose();
      navigate("/fresher-dashboard", {
        state: {
        email,
          userId,
          companyId,
          deptId,
          companyName,
        },
      });
      return { success: true };
    }

    // ADMIN LOGIN
    if (userType === "admin") {
      const inputEmail = (formData.emailOrUsername || "").trim().toLowerCase();

      const superSnap = await getDoc(doc(db, "super_admins", "1"));

      if (superSnap.exists()) {
        const { email, role } = superSnap.data();
        if (role === "SUPER_ADMIN" && email?.toLowerCase?.() === inputEmail) {
          await signInWithEmailAndPassword(
            auth,
            email,
            formData.password
          );
          onClose();
          navigate("/super-admin-dashboard");
          return;
        }
      }

      const companiesSnap = await getDocs(collection(db, "companies"));

      let company = null;
      let companyId = null;

      companiesSnap.forEach((c) => {
        const companyData = c.data() || {};
        const companyEmail = (companyData.email || "").toLowerCase();
        const pendingEmail = (companyData.pendingEmail || "").toLowerCase();

        if (companyEmail === inputEmail || pendingEmail === inputEmail) {
          company = companyData;
          companyId = c.id;
        }
      });

      if (!company) return { error: "Invalid company email" };
      if (company.status !== "active")
        return { error: "Company suspended" };

      const authEmailCandidates = Array.from(
        new Set(
          [inputEmail, (company.email || "").toLowerCase(), (company.pendingEmail || "").toLowerCase()].filter(Boolean)
        )
      );

      let loginError = null;
      let signedInEmail = "";

      for (const candidateEmail of authEmailCandidates) {
        try {
          await signInWithEmailAndPassword(auth, candidateEmail, formData.password);
          signedInEmail = candidateEmail;
          loginError = null;
          break;
        } catch (err) {
          loginError = err;
        }
      }

      if (loginError) {
        throw loginError;
      }

      try {
        const authEmail = (auth.currentUser?.email || signedInEmail || "").toLowerCase();
        const savedEmail = (company.email || "").toLowerCase();
        const pendingEmail = (company.pendingEmail || "").toLowerCase();

        if (authEmail && authEmail !== savedEmail) {
          const updates = { email: authEmail };
          if (pendingEmail && pendingEmail === authEmail) {
            updates.pendingEmail = deleteField();
            updates.emailChangeRequestedAt = deleteField();
          }
          await setDoc(doc(db, "companies", companyId), updates, { merge: true });
          company.email = authEmail;
        }
      } catch (syncErr) {
        console.warn("Failed to sync company email after login:", syncErr);
      }

      onClose();
      navigate("/company-dashboard", {
        state: { companyId, companyName: company.name },
      });
    }
  } catch (err) {
    console.error(err);
    return { error: "Invalid credentials" };
  }
};
