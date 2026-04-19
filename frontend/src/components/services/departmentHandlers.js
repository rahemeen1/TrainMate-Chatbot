//departmentHandlers.js
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
import { apiUrl } from "../../services/api";
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
    await fetch(apiUrl("/api/ingest/document"), {
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
await fetch(apiUrl("/api/ingest/document"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        deptName,
        docId,
         numChunks: 10,
      }),
    });
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
  const { name, email, phone, trainingOn = true, trainingLevel = "basic" } = newUser;
  const normalizedEmail = (email || "").trim().toLowerCase();

  if (!name || !normalizedEmail || !phone) throw new Error("Name, email & phone required");
  if (!/^[0-9]{11}$/.test(phone))
    throw new Error("Phone must be 11 digits");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Valid email is required");
  }

  // 🔹 Generate userId with training abbreviation
  const firstName = name.split(" ")[0];
  
  // Abbreviate department name
  const getDeptAbbr = (dept) => {
    if (!dept) return "DP";
    const deptLower = dept.toLowerCase().trim();
    
    const abbr = {
      "software development": "SD",
      "softwaredevelopment": "SD",
      "frontend development": "FD",
      "frontenddevelopment": "FD",
      "backend development": "BD",
      "backenddevelopment": "BD",
      "full stack development": "FSD",
      "fullstackdevelopment": "FSD",
      "data science": "DS",
      "datascience": "DS",
      "machine learning": "ML",
      "machinelearning": "ML",
      "cloud": "CLD",
      "devops": "DEVOPS",
      "qa": "QA",
      "business analysis": "BA",
      "businessanalysis": "BA",
    };
    return abbr[deptLower] || dept.replace(/\s+/g, "").substring(0, 4).toUpperCase();
  };
  
  const deptShort = getDeptAbbr(deptName);
  const companyShort = companyName
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase();

  const randomNum = Math.floor(10 + Math.random() * 90);
  const userId = `${firstName}-${deptShort}-${companyShort}-${randomNum}`;

  const password = generatePassword();

  // 1️⃣ Firebase Auth
  await createUserWithEmailAndPassword(auth, normalizedEmail, password);

  // 2️⃣ Firestore (SOURCE OF TRUTH)
  await setDoc(
    doc(db, "freshers", companyId, "departments", deptId, "users", userId),
    {
      userId,
      name,
      email: normalizedEmail,
      phone,

      companyId,
      companyName,
      deptId,
      deptName,

      status: "active",          // ✅ default
      progress: 0,               // ✅ backend controls
      trainingStatus: "ongoing", // ✅ synced with progress
      trainingOn,
      trainingLevel,

      onboarding: {
        onboardingCompleted: false,
      },

      notificationPreferences: {
        emailEnabled: true,
        calendarEnabled: true,
        dailyRemindersEnabled: true,
        quizNotificationsEnabled: true,
        preferredReminderTime: "15:00",
      },

      quizPolicy: {
        maxQuizAttempts: 3,
        quizUnlockPercent: 70,
      },

      createdAt: serverTimestamp(),
    }
  );

  try {
    const response = await fetch(
      apiUrl("/api/company/users/credentials-email"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: name,
          userEmail: normalizedEmail,
          userId,
          password,
          companyName,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || "Failed to send credentials email");
    }
  } catch (err) {
    console.error("Failed to email credentials:", err);
    throw new Error(
      "User created, but credentials email failed. Please retry email sending."
    );
  }

  try {
    const notificationResponse = await fetch(
      apiUrl("/api/company/users/initialize-notifications"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          deptId,
          userId,
        }),
      }
    );

    if (!notificationResponse.ok) {
      const errText = await notificationResponse.text();
      console.warn("⚠️ Fresher notification initialization failed:", errText);
    }
  } catch (err) {
    console.warn("⚠️ Fresher notification initialization request failed:", err?.message || err);
  }

  return {
    name,
    userId,
    userEmail: normalizedEmail,
    password,
    companyName,
    deptName,
    trainingLevel,
  };
};

