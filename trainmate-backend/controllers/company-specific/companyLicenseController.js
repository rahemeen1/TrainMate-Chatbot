import { db, admin } from "../../config/firebase.js";
import { sendCompanyLicenseRenewalConfirmationEmail } from "../../services/emailService.js";

/**
 * Renew company license - extends license by 30 days from today
 * Can be called from email link or company dashboard
 */
export const renewCompanyLicense = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { newPlan } = req.body || {}; // Optional: upgrade/downgrade plan

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();

    if (!companySnap.exists) {
      return res.status(404).json({ error: "Company not found" });
    }

    const companyData = companySnap.data();
    const currentPlan = newPlan || companyData.licensePlan || "License Basic";
    
    // Verify it's a valid plan
    if (!["License Basic", "License Pro"].includes(currentPlan)) {
      return res.status(400).json({ error: "Invalid license plan" });
    }

    // Calculate renewal date: today + 30 days
    const renewalDate = new Date();
    renewalDate.setDate(renewalDate.getDate() + 30);

    // Get pricing info for the plan
    const PLAN_CONFIG = {
      "License Basic": { usdPrice: 99, inrPrice: 8250 },
      "License Pro": { usdPrice: 299, inrPrice: 24750 }
    };
    
    const pricing = PLAN_CONFIG[currentPlan] || PLAN_CONFIG["License Basic"];

    // Create billing payment record
    // Try to reuse latest billing/payment method if available
    const billingSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("billingPayments")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    const latestBilling = billingSnap.empty ? null : billingSnap.docs[0].data();

    await db
      .collection("companies")
      .doc(companyId)
      .collection("billingPayments")
      .add({
        plan: currentPlan,
        amountUsd: pricing.usdPrice,
        amountInr: pricing.inrPrice,
        currency: "USD/PKR",
        status: "success",
        provider: (latestBilling && latestBilling.provider) || "email-renewal",
        paymentMethod: latestBilling?.paymentMethod || null,
        cardLast4: latestBilling?.cardLast4 || null,
        billingPeriodDays: 30,
        renewalDate,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Update company with new license info
    await companyRef.update({
      licensePlan: currentPlan,
      billingPeriodDays: 30,
      licenseRenewalDate: renewalDate,
      licenseStatus: "active",
      upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
      pendingLicensePlan: admin.firestore.FieldValue.delete(),
      pendingChangeRequestedAt: admin.firestore.FieldValue.delete(),
      pendingChangeStatus: admin.firestore.FieldValue.delete(),
    });

    // Clear the dedup record so new reminders can be sent
    const licenseNotificationsRef = db
      .collection("companies")
      .doc(companyId)
      .collection("licenseNotifications");
    
    const notificationsSnap = await licenseNotificationsRef.get();
    for (const doc of notificationsSnap.docs) {
      await doc.ref.delete();
    }

    // Send confirmation email
    try {
      await sendCompanyLicenseRenewalConfirmationEmail({
        companyEmail: companyData.email,
        companyName: companyData.name || "Company",
        licensePlan: currentPlan,
        renewalDate,
      });
    } catch (emailErr) {
      console.warn("Failed to send renewal confirmation email:", emailErr.message);
    }

    return res.json({
      success: true,
      message: "License renewed successfully",
      companyId,
      licensePlan: currentPlan,
      renewalDate,
    });
  } catch (error) {
    console.error("License renewal error:", error);
    return res.status(500).json({ error: error.message || "Failed to renew license" });
  }
};

/**
 * Update company license plan (Super admin only)
 * Also creates billing record and updates renewal date to 30 days from today
 */
export const updateCompanyLicensePlan = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { licensePlan } = req.body;

    if (!companyId || !licensePlan) {
      return res.status(400).json({ error: "Company ID and license plan are required" });
    }

    if (!["License Basic", "License Pro"].includes(licensePlan)) {
      return res.status(400).json({ error: "Invalid license plan" });
    }

    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();

    if (!companySnap.exists) {
      return res.status(404).json({ error: "Company not found" });
    }

    const companyData = companySnap.data();

    // Calculate renewal date: today + 30 days
    const renewalDate = new Date();
    renewalDate.setDate(renewalDate.getDate() + 30);

    // Get pricing info for the plan
    const PLAN_CONFIG = {
      "License Basic": { usdPrice: 99, inrPrice: 8250 },
      "License Pro": { usdPrice: 299, inrPrice: 24750 }
    };
    
    const pricing = PLAN_CONFIG[licensePlan] || PLAN_CONFIG["License Basic"];

    // Create billing payment record (same as payment method)
    // Try to reuse latest billing/payment method if available
    const billingSnap2 = await db
      .collection("companies")
      .doc(companyId)
      .collection("billingPayments")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    const latestBilling2 = billingSnap2.empty ? null : billingSnap2.docs[0].data();

    await db
      .collection("companies")
      .doc(companyId)
      .collection("billingPayments")
      .add({
        plan: licensePlan,
        amountUsd: pricing.usdPrice,
        amountInr: pricing.inrPrice,
        currency: "USD/PKR",
        status: "success",
        provider: (latestBilling2 && latestBilling2.provider) || "super-admin-update",
        paymentMethod: latestBilling2?.paymentMethod || null,
        cardLast4: latestBilling2?.cardLast4 || null,
        billingPeriodDays: 30,
        renewalDate,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Update company with new license info and renewal date
    await companyRef.update({
      licensePlan,
      billingPeriodDays: 30,
      licenseRenewalDate: renewalDate,
      licenseStatus: "active",
      upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
      pendingLicensePlan: admin.firestore.FieldValue.delete(),
      pendingChangeRequestedAt: admin.firestore.FieldValue.delete(),
      pendingChangeStatus: admin.firestore.FieldValue.delete(),
    });

    // Clear the dedup record so new reminders can be sent
    const licenseNotificationsRef = db
      .collection("companies")
      .doc(companyId)
      .collection("licenseNotifications");
    
    const notificationsSnap = await licenseNotificationsRef.get();
    for (const doc of notificationsSnap.docs) {
      await doc.ref.delete();
    }

    return res.json({
      success: true,
      message: "License plan updated successfully with new renewal date",
      companyId,
      companyName: companyData.name,
      licensePlan,
      renewalDate,
      billingPeriodDays: 30,
    });
  } catch (error) {
    console.error("Update license plan error:", error);
    return res.status(500).json({ error: error.message || "Failed to update license plan" });
  }
};

/**
 * Get company license status
 */
export const getCompanyLicenseInfo = async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    const companySnap = await db.collection("companies").doc(companyId).get();

    if (!companySnap.exists) {
      return res.status(404).json({ error: "Company not found" });
    }

    const companyData = companySnap.data();
    const billingSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("billingPayments")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    const latestBilling = billingSnap.empty ? null : billingSnap.docs[0].data();

    const renewalDate = companyData.licenseRenewalDate?.toDate?.() || new Date(companyData.licenseRenewalDate);
    const today = new Date();
    const daysRemaining = Math.ceil((renewalDate - today) / (1000 * 60 * 60 * 24));

    return res.json({
      success: true,
      companyId,
      companyName: companyData.name,
      licensePlan: companyData.licensePlan || "License Basic",
      licenseRenewalDate: renewalDate,
      daysRemaining,
      licenseStatus: companyData.licenseStatus || "active",
      pendingLicensePlan:
        companyData.pendingLicensePlan === "License Basic" || companyData.pendingLicensePlan === "License Pro"
          ? companyData.pendingLicensePlan
          : null,
      latestBillingInfo: latestBilling,
    });
  } catch (error) {
    console.error("Get license info error:", error);
    return res.status(500).json({ error: error.message || "Failed to get license info" });
  }
};
