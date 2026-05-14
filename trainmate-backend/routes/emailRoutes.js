import express from "express";
import { db } from "../config/firebase.js";
import {
  sendAdminRegeneratedRoadmapEmail,
  sendAdminGrantedAttemptsEmail,
  sendCompanyLicenseRenewalAlertEmail,
} from "../services/emailService.js";

const router = express.Router();

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const converted = value.toDate();
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  // Handles serialized Firestore Timestamp shapes from JSON payloads.
  if (typeof value === "object") {
    const seconds = Number(value.seconds ?? value._seconds);
    const nanos = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
    if (Number.isFinite(seconds)) {
      const converted = new Date(seconds * 1000 + Math.floor(nanos / 1e6));
      return Number.isNaN(converted.getTime()) ? null : converted;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * POST /api/email/admin-regenerated-roadmap
 * Send email when admin regenerates a user's roadmap
 */
router.post("/email/admin-regenerated-roadmap", async (req, res) => {
  try {
    const { userEmail, userName, moduleTitle, companyName, companyEmail } = req.body;

    if (!userEmail || !userName || !moduleTitle) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await sendAdminRegeneratedRoadmapEmail({
      userEmail,
      userName,
      moduleTitle,
      companyName,
      companyEmail,
    });

    res.json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error("Error in admin regenerated roadmap email route:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

/**
 * POST /api/email/admin-granted-attempts
 * Send email when admin grants additional quiz attempts to a user
 */
router.post("/email/admin-granted-attempts", async (req, res) => {
  try {
    const { userEmail, userName, moduleTitle, attemptsGranted, companyName, companyEmail } = req.body;

    if (!userEmail || !userName || !moduleTitle || !attemptsGranted) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await sendAdminGrantedAttemptsEmail({
      userEmail,
      userName,
      moduleTitle,
      attemptsGranted,
      companyName,
      companyEmail,
    });

    res.json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error("Error in admin granted attempts email route:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

/**
 * POST /api/email/test-license-renewal-reminder
 * Send a renewal reminder directly to a test inbox without waiting for cron
 */
router.post("/email/test-license-renewal-reminder", async (req, res) => {
  try {
    const {
      companyEmail,
      companyName = "TrainMate Test Company",
      companyId = "test-company",
      licensePlan = "License Basic",
      renewalDate,
      pendingLicensePlan = null,
    } = req.body || {};

    if (!companyEmail) {
      return res.status(400).json({ error: "companyEmail is required" });
    }

    let resolvedRenewalDate = null;
    let resolvedCompanyName = companyName;
    let resolvedLicensePlan = licensePlan;

    if (companyId && companyId !== "test-company") {
      const companySnap = await db.collection("companies").doc(companyId).get();
      const companyData = companySnap.exists ? companySnap.data() : null;
      resolvedRenewalDate = toDateSafe(companyData?.licenseRenewalDate) || toDateSafe(companyData?.nextRenewalDate);
      resolvedCompanyName = companyData?.name || resolvedCompanyName;
      resolvedLicensePlan = companyData?.licensePlan || resolvedLicensePlan;
    }

    if (!resolvedRenewalDate) {
      resolvedRenewalDate = toDateSafe(renewalDate) || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    }

    const renewalDay = startOfDay(resolvedRenewalDate);
    const today = startOfDay(new Date());
    const daysRemaining = Math.round((renewalDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    const result = await sendCompanyLicenseRenewalAlertEmail({
      companyEmail,
      companyId,
      companyName: resolvedCompanyName,
      licensePlan: resolvedLicensePlan,
      renewalDate: resolvedRenewalDate,
      daysRemaining,
      pendingLicensePlan,
    });

    res.json({
      success: true,
      messageId: result.messageId,
      to: companyEmail,
      daysRemaining,
      renewalDate: resolvedRenewalDate,
    });
  } catch (error) {
    console.error("Error in test license renewal reminder route:", error);
    res.status(500).json({ error: error.message || "Failed to send test reminder email" });
  }
});

export default router;
