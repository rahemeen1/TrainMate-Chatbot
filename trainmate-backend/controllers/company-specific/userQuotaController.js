// Controller to check user quota for a company
import { checkUserQuota } from "../../utils/userQuotaChecker.js";

/**
 * GET /api/company/:companyId/user-quota
 * Check if company can add more users based on their plan
 */
export const checkCompanyUserQuota = async (req, res) => {
  try {
    const { companyId } = req.params;
    
    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    const quotaStatus = await checkUserQuota(companyId);
    
    return res.status(200).json(quotaStatus);
  } catch (err) {
    console.error("Error in checkCompanyUserQuota:", err);
    return res.status(500).json({ error: err.message });
  }
};
