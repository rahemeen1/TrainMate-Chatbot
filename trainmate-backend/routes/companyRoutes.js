import express from "express";
import { addCompany } from "../controllers/company-specific/addcompanyController.js";
import { updateCompany } from "../controllers/company-specific/updateCompanyController.js";
import { toggleCompanyStatus } from "../controllers/company-specific/togglecompanyController.js";
import { deleteCompany } from "../controllers/company-specific/deletecompanyController.js";
import { getAllCompanies } from "../controllers/company-specific/getcompaniesController.js";
import { getTotalCompanies } from "../controllers/company-specific/totalcompaniesController.js";
import { deleteUser } from "../controllers/company-specific/deleteuserController.js";
import { sendUserCredentials } from "../controllers/company-specific/sendCredentialsController.js";
import { initializeFresherNotifications } from "../controllers/company-specific/initializeFresherNotificationsController.js";
import { getModuleLockNotifications, resolveModuleLockNotification, getCompanyAdminNotifications } from "../controllers/company-specific/moduleLockNotificationsController.js";
import { updateDepartmentSettings, getDepartmentSettings } from "../controllers/company-specific/updateDepartmentSettings.js";
import { checkCompanyUserQuota } from "../controllers/company-specific/userQuotaController.js";


const router = express.Router();

router.post("/add-company", addCompany);
router.put("/companies/:id", updateCompany);
router.put("/companies/:id/status", toggleCompanyStatus);
router.delete("/companies/:id", deleteCompany);
router.get("/companies", getAllCompanies);
router.get("/stats/companies", getTotalCompanies);
router.delete("/company/users/:email", deleteUser);
router.post("/company/users/credentials-email", sendUserCredentials);
router.post("/company/users/initialize-notifications", initializeFresherNotifications);
router.get("/company/notifications/module-lock/:companyId", getModuleLockNotifications);
router.patch("/company/notifications/module-lock/:companyId/:notificationId", resolveModuleLockNotification);
router.get("/company/notifications/:companyId", getCompanyAdminNotifications);

// User quota check
router.get("/company/:companyId/user-quota", checkCompanyUserQuota);

// Department settings
router.put("/department/settings", updateDepartmentSettings);
router.get("/department/settings", getDepartmentSettings);

export default router;
