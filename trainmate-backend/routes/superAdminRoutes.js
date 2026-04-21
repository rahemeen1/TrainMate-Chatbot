import express from "express";
import { getAllSuperAdmins } from "../controllers/superadmin/superAdminController.js";
import { updateSuperAdmin } from "../controllers/superadmin/updatesuperAdminController.js";
import { getTotalSuperAdmins } from "../controllers/superadmin/totalsuperAdminsController.js"; 
import { getSuperAdminAgentHealth } from "../controllers/superadmin/agentHealthController.js";


const router = express.Router();

router.get("/superadmins", getAllSuperAdmins);
router.put("/superadmins/:id", updateSuperAdmin);
router.get("/stats/superadmins", getTotalSuperAdmins);
router.get("/superadmin/agent-health", getSuperAdminAgentHealth);
export default router;
