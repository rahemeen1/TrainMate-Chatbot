import {
  collection,
  getDocs,
  setDoc,
  getDoc,
  doc,
  addDoc,
  serverTimestamp,
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

  // Firestore path: companies -> <companyId> -> departments -> <deptName> -> documents
  const docRef = await addDoc(
    collection(db, "companies", companyId, "departments", deptName, "documents"),
    {
      name: file.name,
      createdAt: serverTimestamp(),
    }
  );

  // Storage path
  const storageRef = ref(
    storage,
    `companydocs/${companyId}/departments/${deptName}/${docRef.id}/${file.name}`
  );

  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  // Save URL in Firestore doc
  await setDoc(docRef, { url }, { merge: true });
};


/* =============================
   DELETE DOCUMENT (FIRESTORE + STORAGE)
============================= */
export const deleteDepartmentDoc = async ({ companyId, deptName, docId }) => {
  // Get doc from Firestore to find file name
  const docRef = doc(
    db,
    "companies",
    companyId,
    "departments",
    deptName,
    "documents",
    docId
  );
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) throw new Error("Document not found");

  const docData = docSnap.data();
  const fileName = docData.name;

  // Delete from Storage
  const fileRef = ref(
    storage,
    `companydocs/${companyId}/departments/${deptName}/${docId}/${fileName}`
  );
  await deleteObject(fileRef);

  // Delete Firestore doc
  await deleteDoc(docRef);
};



// 🔹 Add fresher user (BIG ONE)
export const addFresherUser = async ({
  companyId,
  companyName,
  deptId,
  deptName,
  newUser,
}) => {


  const { name, phone, trainingOn,  } = newUser;

  if (!name || !phone) throw new Error("Name & phone required");
  if (!/^[0-9]{11}$/.test(phone))
    throw new Error("Phone must be 11 digits");

  const firstName = name.split(" ")[0];
  const deptShort = deptName.replace(/\s+/g, "").toUpperCase();
  const companyShort = companyName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const userId = `${firstName}-${deptShort}-${companyShort}-${randomNum}`;

  const companyDomain =
    companyName.toLowerCase().replace(/\s+/g, "") + ".com";
  const email = `${userId}@${companyDomain}`;

  const password = generatePassword();

  // 1️⃣ Firebase Auth
  await createUserWithEmailAndPassword(auth, email, password);


  // 3️⃣ Firestore
  await setDoc(
    doc(db, "freshers", companyId, "departments", deptId, "users", userId),
    {
      userId,
      name,
      email,
      phone,
      trainingOn,
      progress: 0,
      companyId,
      companyName,
      deptId,
      deptName,
      onboarding: { onboardingCompleted: false },
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
