import express from "express";
import { addCompany } from "../controllers/company-specific/addcompanyController.js";
import { updateCompany } from "../controllers/company-specific/updateCompanyController.js";
import { toggleCompanyStatus } from "../controllers/company-specific/togglecompanyController.js";
import { deleteCompany } from "../controllers/company-specific/deletecompanyController.js";
import { getAllCompanies } from "../controllers/company-specific/getcompaniesController.js";
import { getTotalCompanies } from "../controllers/company-specific/totalcompaniesController.js";
import { deleteUser } from "../controllers/company-specific/deleteuserController.js";
import { updateDepartmentSettings, getDepartmentSettings } from "../controllers/company-specific/updateDepartmentSettings.js";


const router = express.Router();

router.post("/add-company", addCompany);
router.put("/companies/:id", updateCompany);
router.put("/companies/:id/status", toggleCompanyStatus);
router.delete("/companies/:id", deleteCompany);
router.get("/companies", getAllCompanies);
router.get("/stats/companies", getTotalCompanies);
router.delete("/company/users/:email", deleteUser);

// Department settings
router.put("/department/settings", updateDepartmentSettings);
router.get("/department/settings", getDepartmentSettings);

export default router;
