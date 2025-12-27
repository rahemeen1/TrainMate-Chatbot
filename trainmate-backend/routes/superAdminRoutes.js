import express from "express";
import { getAllSuperAdmins } from "../controllers/superadmin/superAdminController.js";
import { updateSuperAdmin } from "../controllers/superadmin/updateSuperAdminController.js";
import { getTotalSuperAdmins } from "../controllers/superadmin/totalsuperAdminsController.js"; 


const router = express.Router();

router.get("/superadmins", getAllSuperAdmins);
router.put("/superadmins/:id", updateSuperAdmin);
router.get("/stats/superadmins", getTotalSuperAdmins);
export default router;
