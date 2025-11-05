// firebase.js
import admin from "firebase-admin";
import { readFileSync } from "fs";
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };


const serviceAccount = JSON.parse(
  readFileSync("./serviceAccountKey.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

export { db };
