// Utility to check if company can add more users based on their plan
import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

// Plan limits
const PLAN_LIMITS = {
  "License Basic": { min: 10, max: 15 },
  "License Pro": { min: 20, max: 40 }
};

/**
 * Check if company can add more users based on their plan
 * @param {string} companyId - Company document ID
 * @returns {Promise<{canAdd: boolean, currentCount: number, maxAllowed: number, plan: string, message: string}>}
 */
export const checkUserQuota = async (companyId) => {
  try {
    const normalizedCompanyId = String(companyId || "").trim();
    const invalidIdValues = ["", "undefined", "null", "nan"];

    if (invalidIdValues.includes(normalizedCompanyId.toLowerCase())) {
      return {
        canAdd: false,
        currentCount: 0,
        maxAllowed: 0,
        plan: "Unknown",
        message: "Valid company ID is required"
      };
    }

    // Get company document by ID
    let resolvedCompanyId = normalizedCompanyId;
    let companyRef = db.collection("companies").doc(resolvedCompanyId);
    let companyDoc = await companyRef.get();

    // Fallback: if caller passed a non-doc identifier, try common fields
    if (!companyDoc.exists) {
      const fallbackQueries = [
        db.collection("companies").where("companyId", "==", normalizedCompanyId).limit(1).get(),
        db.collection("companies").where("email", "==", normalizedCompanyId.toLowerCase()).limit(1).get(),
      ];

      const [byCompanyIdSnap, byEmailSnap] = await Promise.all(fallbackQueries);
      const fallbackDoc =
        (byCompanyIdSnap.empty ? null : byCompanyIdSnap.docs[0]) ||
        (byEmailSnap.empty ? null : byEmailSnap.docs[0]);

      if (fallbackDoc) {
        resolvedCompanyId = fallbackDoc.id;
        companyRef = fallbackDoc.ref;
        companyDoc = fallbackDoc;
      }
    }

    if (!companyDoc.exists) {
      return {
        canAdd: false,
        currentCount: 0,
        maxAllowed: 0,
        plan: "Unknown",
        message: `Company not found for identifier: ${normalizedCompanyId}`
      };
    }

    const companyData = companyDoc.data();
    let licensePlan = null;
    
    // First, try to get latest onboarding answers (source of truth)
    const answersRef = companyRef.collection("onboardingAnswers");
    const answersSnap = await answersRef.orderBy("createdAt", "desc").limit(1).get();
    
    if (!answersSnap.empty) {
      const answers = answersSnap.docs[0].data().answers;
      licensePlan = answers?.[0] || answers?.["0"];
    }
    
    // Fall back to company doc if no onboarding answers
    if (!licensePlan) {
      licensePlan = companyData.licensePlan;
    }

    const deletedUsersCount = companyData.deletedUsersCount || 0;

    // Get plan limits
    const planLimits = PLAN_LIMITS[licensePlan];
    if (!planLimits) {
      return {
        canAdd: false,
        currentCount: 0,
        maxAllowed: 0,
        plan: licensePlan || "Unknown",
        message: licensePlan
          ? `Unknown plan: ${licensePlan}`
          : "License plan is not configured for this company"
      };
    }

    // Count current active users directly from all users subcollections
    const usersSnap = await db
      .collectionGroup("users")
      .where("companyId", "==", resolvedCompanyId)
      .get();

    let currentActiveUsers = usersSnap.size;

    // Fallback: if companyId field query returns 0, count by document path
    if (currentActiveUsers === 0) {
      console.log(`⚠️ No users found with companyId field, trying path-based count for ${resolvedCompanyId}`);
      const allUsersSnap = await db.collectionGroup("users").get();
      currentActiveUsers = allUsersSnap.docs.filter((docSnap) => {
        const pathSegments = docSnap.ref.path.split("/");
        // Path format: freshers/{companyId}/departments/{dept}/users/{userId}
        return pathSegments[1] === resolvedCompanyId;
      }).length;
      console.log(`✅ Found ${currentActiveUsers} users by path for company ${resolvedCompanyId}`);
    }

    // Calculate total users ever added (current + deleted)
    const totalUsersEverAdded = currentActiveUsers + deletedUsersCount;
    const maxAllowed = planLimits.max;
    const canAdd = totalUsersEverAdded < maxAllowed;

    return {
      canAdd,
      currentCount: currentActiveUsers,
      totalEverAdded: totalUsersEverAdded,
      deletedCount: deletedUsersCount,
      maxAllowed,
      plan: licensePlan,
      message: canAdd
        ? `You can add ${maxAllowed - totalUsersEverAdded} more users (Current: ${currentActiveUsers} active, ${deletedUsersCount} deleted, Total: ${totalUsersEverAdded}/${maxAllowed})`
        : `User limit reached. Your ${licensePlan} plan allows up to ${maxAllowed} users total. You have added ${totalUsersEverAdded} users (${currentActiveUsers} active + ${deletedUsersCount} deleted). Please upgrade your plan or contact support.`
    };
  } catch (err) {
    console.error("Error checking user quota:", err);
    return {
      canAdd: false,
      currentCount: 0,
      maxAllowed: 0,
      plan: "Unknown",
      message: `Error checking quota: ${err.message}`
    };
  }
};

/**
 * Get user quota status for frontend display
 * @param {string} companyId - Company document ID
 * @returns {Promise<object>} Quota status object
 */
export const getUserQuotaStatus = async (companyId) => {
  return await checkUserQuota(companyId);
};
