import {
  collection,
  getDocs,
  setDoc,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  deleteDoc,          
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  listAll,            
  deleteObject,        
} from "firebase/storage";

import { db, auth } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
const storage = getStorage(); 


// 🔹 Password generator
export const generatePassword = () => {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#!";
  return Array.from({ length: 8 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
};


// 🔹 Fetch department users
export const fetchDepartmentUsers = async (companyId, deptId) => {
  const usersRef = collection(
    db,
    "freshers",
    companyId,
    "departments",
    deptId,
    "users"
  );

  const snap = await getDocs(usersRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

//FETCH DEPARTMENT DOCUMENTS
export const fetchDepartmentDocs = async (companyId, deptName) => {
  const snap = await getDocs(
    collection(db, "companies", companyId, "departments", deptName, "documents")
  );

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};


/* =============================
   ADD DOCUMENT
============================= */
export const addDepartmentDoc = async ({ companyId, deptName, file }) => {
  if (!file) throw new Error("Select a file");

  try {
    // 1️⃣ Create Firestore document FIRST
    const docRef = await addDoc(
      collection(db, "companies", companyId, "departments", deptName, "documents"),
      {
        name: file.name,
        createdAt: Timestamp.now(),
      }
    );

    // 2️⃣ Define ONE storage path (using docId)
    const storagePath = `companydocs/${companyId}/departments/${deptName}/${docRef.id}/${file.name}`;
    const storageRef = ref(storage, storagePath);

    // 3️⃣ Upload file to Firebase Storage
    await uploadBytes(storageRef, file);

    // 4️⃣ Get download URL
    const downloadURL = await getDownloadURL(storageRef);

    // 5️⃣ Update Firestore document with URL + storagePath
    await updateDoc(docRef, {
      url: downloadURL,
      storagePath,
    });

    // 6️⃣ Optional: send to backend for ingestion
    await fetch("http://localhost:5000/api/ingest/document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileUrl: downloadURL,
        companyId,
        deptName,
        docId: docRef.id,
        fileName: file.name,
      }),
    });

    return {
      id: docRef.id,
      name: file.name,
      url: downloadURL,
      storagePath,
    };

  } catch (err) {
    console.error("❌ addDepartmentDoc failed:", err);
    throw err;
  }
};



/* =============================
   DELETE DOCUMENT (FIRESTORE + STORAGE)
============================= */

export const deleteDepartmentDoc = async ({
  companyId,
  deptName,
  docId,
  storagePath,
}) => {
  try {
    if (!storagePath || storagePath.trim() === "") {
      console.warn("⚠️ storagePath is missing or empty, skipping storage deletion");
    } else {
      const cleanedPath = storagePath.trim().replace(/^\/+/, ""); // remove leading slashes
      console.log("Deleting storage file at:", cleanedPath);

      const fileRef = ref(storage, cleanedPath);
      await deleteObject(fileRef);
      console.log("✅ Storage file deleted:", cleanedPath);
    }

    // Firestore delete
    await deleteDoc(
      doc(db, "companies", companyId, "departments", deptName, "documents", docId)
    );
    console.log("✅ Firestore document deleted:", docId);

  } catch (err) {
    console.error("❌ Delete failed:", err);
    throw err;
  }
};


// 🔹 Add fresher user (BIG ONE)
export const addFresherUser = async ({
  companyId,
  companyName,
  deptId,
  deptName,
  newUser,
}) => {
  const { name, phone, trainingOn = true } = newUser;

  if (!name || !phone) throw new Error("Name & phone required");
  if (!/^[0-9]{11}$/.test(phone))
    throw new Error("Phone must be 11 digits");

  // 🔹 Generate userId
  const firstName = name.split(" ")[0];
  const deptShort = deptName.replace(/\s+/g, "").toUpperCase();
  const companyShort = companyName
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase();

  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const userId = `${firstName}-${deptShort}-${companyShort}-${randomNum}`;

  // 🔹 Email
  const companyDomain =
    companyName.toLowerCase().replace(/\s+/g, "") + ".com";
  const email = `${userId}@${companyDomain}`;

  const password = generatePassword();

  // 1️⃣ Firebase Auth
  await createUserWithEmailAndPassword(auth, email, password);

  // 2️⃣ Firestore (SOURCE OF TRUTH)
  await setDoc(
    doc(db, "freshers", companyId, "departments", deptId, "users", userId),
    {
      userId,
      name,
      email,
      phone,

      companyId,
      companyName,
      deptId,
      deptName,

      status: "active",          // ✅ default
      progress: 0,               // ✅ backend controls
      trainingStatus: "ongoing", // ✅ synced with progress
      trainingOn,

      onboarding: {
        onboardingCompleted: false,
      },

      createdAt: serverTimestamp(),
    }
  );

  return {
    name,
    userId,
    userEmail: email,
    password,
    companyName,
    deptName,
  };
};

