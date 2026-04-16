import { db, admin } from "../../config/firebase.js";
// ================= Get Companies =================
export const getAllCompanies = async (req, res) => {
  try {
    const snapshot = await db.collection("companies").get();

    const companies = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const latestBillingPaymentSnap = await db
          .collection("companies")
          .doc(doc.id)
          .collection("billingPayments")
          .orderBy("createdAt", "desc")
          .limit(1)
          .get();

        const latestBillingPaymentDoc = latestBillingPaymentSnap.docs[0];
        const latestBillingPaymentData = latestBillingPaymentDoc
          ? latestBillingPaymentDoc.data() || {}
          : null;
        const latestBillingPaymentCreatedAt = latestBillingPaymentDoc
          ? latestBillingPaymentData?.createdAt || null
          : null;
        const latestBillingPaymentPlan = latestBillingPaymentDoc
          ? latestBillingPaymentData?.plan || latestBillingPaymentData?.Plan || null
          : null;

        return {
          id: doc.id,
          ...doc.data(),
          latestBillingPaymentCreatedAt,
          latestBillingPaymentPlan,
        };
      })
    );

    res.json(companies);
  } catch (err) {
    console.error("❌ /companies GET error:", err);
    res.status(500).json({ message: err.message });
  }
};