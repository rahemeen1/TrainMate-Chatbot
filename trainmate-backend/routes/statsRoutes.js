import express from "express";
import {
  getActiveCompanies,
  getTotalCompanies,
  getTotalFreshers
} from "../controllers/statsController.js";

const router = express.Router();

router.get("/companies", getActiveCompanies);
router.get("/companies/all", getTotalCompanies);
router.get("/users", getTotalFreshers);

export default router;
