import admin from "firebase-admin";
import { db } from "../../config/firebase.js";
import { sendTrainingLockedEmail } from "../../services/emailService.js";

const BASE_MAX_QUIZ_ATTEMPTS = 3;

async function ensurePendingNotificationsForLockedUsers(companyId) {
  const companySnap = await db.collection("companies").doc(companyId).get();
  const companyData = companySnap.exists ? companySnap.data() : {};
  const companyName = companyData?.name || "TrainMate Company";
  const companyEmail = companyData?.email || companyData?.companyEmail || null;

  const usersSnap = await db.collectionGroup("users").where("companyId", "==", companyId).get();

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data() || {};

    const segments = userDoc.ref.path.split("/");
    const deptId = segments[3];
    const userId = segments[5];

    const roadmapSnap = await userDoc.ref.collection("roadmap").get();
    const lockedModules = roadmapSnap.docs.filter((moduleDoc) => {
      const moduleData = moduleDoc.data() || {};
      const moduleAttemptLimit = Number.isInteger(moduleData.maxAttemptsOverride)
        ? moduleData.maxAttemptsOverride
        : BASE_MAX_QUIZ_ATTEMPTS;

      const reachedAttemptLimit = !moduleData.quizPassed && (moduleData.quizAttempts || 0) >= moduleAttemptLimit;
      const alreadyLocked = Boolean(moduleData.moduleLocked || moduleData.quizLocked);

      return !moduleData.completed && (alreadyLocked || reachedAttemptLimit);
    });

    if (!lockedModules.length) continue;

    if (!userData.trainingLocked || !userData.requiresAdminContact) {
      await userDoc.ref.set(
        {
          trainingLocked: true,
          trainingLockedAt: admin.firestore.FieldValue.serverTimestamp(),
          requiresAdminContact: true,
        },
        { merge: true }
      );
    }

    for (const moduleDoc of lockedModules) {
      const moduleData = moduleDoc.data() || {};
      const moduleId = moduleDoc.id;
      const moduleAttemptLimit = Number.isInteger(moduleData.maxAttemptsOverride)
        ? moduleData.maxAttemptsOverride
        : BASE_MAX_QUIZ_ATTEMPTS;

      if (!moduleData.moduleLocked || !moduleData.quizLocked || moduleData.status !== "locked") {
        await moduleDoc.ref.set(
          {
            moduleLocked: true,
            quizLocked: true,
            status: "locked",
            requiresAdminContact: true,
          },
          { merge: true }
        );
      }

      const notificationId = `module-lock-${deptId}-${userId}-${moduleId}`;

      const notificationRef = db
        .collection("companies")
        .doc(companyId)
        .collection("adminNotifications")
        .doc(notificationId);

      const existingSnap = await notificationRef.get();
      if (existingSnap.exists) continue;

      await notificationRef.set(
        {
          type: "module_lock",
          status: "pending",
          companyId,
          deptId,
          userId,
          moduleId,
          userName: userData.name || "",
          userEmail: userData.email || "",
          moduleTitle: moduleData.moduleTitle || "",
          attemptNumber: moduleData.quizAttempts || moduleAttemptLimit,
          score: null,
          message: `${userData.name || "Fresher"} exceeded quiz retries for ${moduleData.moduleTitle || "module"}. Give one final retry?`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          resolvedAt: null,
          source: "auto-backfill",
        },
        { merge: true }
      );

      if (companyEmail) {
        try {
          await sendTrainingLockedEmail({
            companyEmail,
            companyName,
            userName: userData.name || "",
            userEmail: userData.email || "",
            moduleTitle: moduleData.moduleTitle || "",
            attemptNumber: moduleData.quizAttempts || moduleAttemptLimit,
            score: null,
          });
        } catch (emailErr) {
          console.warn("Training lock backfill email failed:", emailErr.message);
        }
      }
    }
  }
}

export const getModuleLockNotifications = async (req, res) => {
  try {
    const { companyId } = req.params;
    const status = (req.query.status || "pending").toLowerCase();

    if (!companyId) {
      return res.status(400).json({ error: "companyId is required" });
    }

    if (status === "pending" || status === "all") {
      await ensurePendingNotificationsForLockedUsers(companyId);
    }

    const notificationsRef = db
      .collection("companies")
      .doc(companyId)
      .collection("adminNotifications");

    let queryRef = notificationsRef.where("type", "==", "module_lock");
    if (status !== "all") {
      queryRef = queryRef.where("status", "==", status);
    }

    const snap = await queryRef.get();
    const notifications = snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

    return res.json({ success: true, notifications });
  } catch (err) {
    console.error("Error fetching module lock notifications:", err);
    return res.status(500).json({ error: "Failed to fetch notifications", details: err.message });
  }
};

export const getCompanyAdminNotifications = async (req, res) => {
  try {
    const { companyId } = req.params;
    const status = String(req.query.status || "pending").toLowerCase();
    const requestedTypes = String(req.query.types || "module_lock,training_completion,training_summary_report")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    if (!companyId) {
      return res.status(400).json({ error: "companyId is required" });
    }

    const allowedTypes = new Set(["module_lock", "training_completion", "training_summary_report"]);
    const types = requestedTypes.filter((t) => allowedTypes.has(t));
    const effectiveTypes = types.length ? types : ["module_lock", "training_completion", "training_summary_report"];

    if ((status === "pending" || status === "all") && effectiveTypes.includes("module_lock")) {
      await ensurePendingNotificationsForLockedUsers(companyId);
    }

    const notificationsRef = db
      .collection("companies")
      .doc(companyId)
      .collection("adminNotifications");

    const snap = await notificationsRef.get();
    const notifications = snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((n) => effectiveTypes.includes(String(n.type || "").toLowerCase()))
      .filter((n) => {
        if (status === "all") return true;
        return String(n.status || "").toLowerCase() === status;
      })
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

    return res.json({ success: true, notifications });
  } catch (err) {
    console.error("Error fetching company admin notifications:", err);
    return res.status(500).json({ error: "Failed to fetch notifications", details: err.message });
  }
};

export const resolveModuleLockNotification = async (req, res) => {
  try {
    const { companyId, notificationId } = req.params;
    const { action, adminNote = "" } = req.body || {};

    if (!companyId || !notificationId) {
      return res.status(400).json({ error: "companyId and notificationId are required" });
    }

    if (!["approved", "rejected"].includes(action)) {
      return res.status(400).json({ error: "action must be approved or rejected" });
    }

    const notificationRef = db
      .collection("companies")
      .doc(companyId)
      .collection("adminNotifications")
      .doc(notificationId);

    const snap = await notificationRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Notification not found" });
    }

    await notificationRef.set(
      {
        status: action,
        adminNote,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ success: true, status: action });
  } catch (err) {
    console.error("Error resolving module lock notification:", err);
    return res.status(500).json({ error: "Failed to resolve notification", details: err.message });
  }
};
