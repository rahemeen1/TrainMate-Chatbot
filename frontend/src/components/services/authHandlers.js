//frontend/src/components/services/authHandlers.js
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../firebase";
import { collection, getDoc, getDocs, doc } from "firebase/firestore";

export const handleLogin = async ({
  userType,
  formData,
  navigate,
  onClose,
}) => {
  try {
    // FRESHER LOGIN
    if (userType === "fresher") {

      const email = formData.emailOrUsername?.trim();
      const password = formData.password;

      if (!email || !password) {
        return { error: "Email or password missing" };
      }

      await signInWithEmailAndPassword(auth, email, password);

      const userId = email.split("@")[0];
      const parts = userId.split("-");

      if (parts.length < 4) {
        return { error: "Invalid fresher email format" };
      }

      const deptShort = parts[1];
      const companyShort = parts[2];

      const companiesSnap = await getDocs(collection(db, "companies"));

      // let companyId = null;
      // let companyName = null;
      let companyId = null;
      let companyName = null;
      let companyStatus = null;


      // companiesSnap.forEach((c) => {
      //   const data = c.data();
      //   const short = data.name
      //     .split(" ")
      //     .map((w) => w[0])
      //     .join("")
      //     .toUpperCase();

      //   if (short === companyShort) {
      //     companyId = c.id;
      //     companyName = data.name;
      //   }
      // });
      companiesSnap.forEach((c) => {
  const data = c.data();
  const short = data.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (short === companyShort) {
    companyId = c.id;
    companyName = data.name;
    companyStatus = data.status; // ✅ capture status
  }
});
      if (!companyId) {
        return { error: "Company not found" };
      }
if (companyStatus !== "active") {
  return { error: "Your company is suspended. Contact admin." };
}


      const fresherRef = doc(
        db,
        "freshers",
        companyId,
        "departments",
        deptShort,
        "users",
        userId
      );
console.log("Fresher Ref:", fresherRef.path);
      const fresherSnap = await getDoc(fresherRef);
console.log("Fresher Snap:", fresherSnap.exists());
      if (!fresherSnap.exists()) {
        return { error: "Fresher record not found" };
      }

      console.log("➡ Navigating to dashboard");

      onClose();
      navigate("/fresher-dashboard", {
        state: {
        email,
          userId,
          companyId,
          deptId: deptShort,
          companyName,
        },
      });
      return { success: true };
    }

    // ADMIN LOGIN
    if (userType === "admin") {
      const superSnap = await getDoc(doc(db, "super_admins", "1"));

      if (superSnap.exists()) {
        const { email, role } = superSnap.data();
        if (role === "SUPER_ADMIN" && email === formData.emailOrUsername) {
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
        if (c.data().email === formData.emailOrUsername) {
          company = c.data();
          companyId = c.id;
        }
      });

      if (!company) return { error: "Invalid company email" };
      if (company.status !== "active")
        return { error: "Company suspended" };

      await signInWithEmailAndPassword(
        auth,
        company.email,
        formData.password
      );

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
