// src/firebase.js
// ✅ Firebase Web SDK (Frontend)

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";


// Your Firebase config from Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyDXcZaG3DLI7wCJGoCIzQ37Qaui3guikyQ",
  authDomain: "trainmate-chatbot.firebaseapp.com",
  projectId: "trainmate-chatbot",
  storageBucket: "trainmate-chatbot.firebasestorage.app",
  messagingSenderId: "161059187631",
  appId: "1:161059187631:web:de44d8289b423c632b1d5a",
  measurementId: "G-67P7ZK3K51"
};

// Initialize Firebase

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
