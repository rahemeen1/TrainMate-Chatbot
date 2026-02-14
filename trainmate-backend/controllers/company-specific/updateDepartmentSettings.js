// trainmate-backend/controllers/company-specific/updateDepartmentSettings.js
import { db } from "../../config/firebase.js";
import admin from "firebase-admin";

/**
 * Update department quiz settings
 * This allows companies to configure whether departments can use coding questions
 */
export const updateDepartmentSettings = async (req, res) => {
  try {
    const { companyId, deptId, quizSettings } = req.body;

    if (!companyId || !deptId) {
      return res.status(400).json({ 
        error: "Missing required fields: companyId, deptId" 
      });
    }

    console.log(`🔧 Updating department settings for ${companyId}/${deptId}`);

    const deptRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId);

    // Validate and set default quiz settings
    const sanitizedSettings = {
      allowCodingQuestions: quizSettings?.allowCodingQuestions ?? true,
      // Add more settings as needed
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await deptRef.set(
      {
        quizSettings: sanitizedSettings,
      },
      { merge: true }
    );

    console.log(`✅ Department settings updated successfully`);

    return res.json({
      success: true,
      message: "Department quiz settings updated",
      settings: sanitizedSettings,
    });
  } catch (error) {
    console.error("❌ Error updating department settings:", error);
    return res.status(500).json({
      error: "Failed to update department settings",
      details: error.message,
    });
  }
};

/**
 * Get department quiz settings
 */
export const getDepartmentSettings = async (req, res) => {
  try {
    const { companyId, deptId } = req.query;

    if (!companyId || !deptId) {
      return res.status(400).json({ 
        error: "Missing required parameters: companyId, deptId" 
      });
    }

    const deptRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId);

    const deptSnap = await deptRef.get();

    if (!deptSnap.exists) {
      return res.status(404).json({ 
        error: "Department not found" 
      });
    }

    const deptData = deptSnap.data();
    const quizSettings = deptData.quizSettings || {
      allowCodingQuestions: true, // Default
    };

    return res.json({
      success: true,
      companyId,
      deptId,
      quizSettings,
    });
  } catch (error) {
    console.error("❌ Error fetching department settings:", error);
    return res.status(500).json({
      error: "Failed to fetch department settings",
      details: error.message,
    });
  }
};
