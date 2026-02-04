import { db } from "../config/firebase.js";

/* ✅ ACTIVE COMPANIES */
export const getActiveCompanies = async (req, res) => {
  try {
    const snap = await db
      .collection("companies")
      .where("status", "==", "active")
      .get();

    res.json({ count: snap.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ✅ TOTAL COMPANIES */
export const getTotalCompanies = async (req, res) => {
  try {
    const snap = await db.collection("companies").get();
    res.json({ count: snap.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ✅ TOTAL FRESHERS (ALL COMPANIES) */
export const getTotalFreshers = async (req, res) => {
  try {
    let total = 0;

    const companiesSnap = await db.collection("companies").get();

    for (const company of companiesSnap.docs) {
      const deptSnap = await db
        .collection("freshers")
        .doc(company.id)
        .collection("departments")
        .get();

      for (const dept of deptSnap.docs) {
        const usersSnap = await db
          .collection("freshers")
          .doc(company.id)
          .collection("departments")
          .doc(dept.id)
          .collection("users")
          .get();

        total += usersSnap.size;
      }
    }

    res.json({ count: total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
