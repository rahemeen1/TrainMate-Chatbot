import express from "express";
import { generateUserRoadmap } from "../controllers/roadmap.controller.js";

const router = express.Router();

/**
 * @route   POST /api/roadmap/generate
 * @desc    Generate personalized roadmap for a fresher
 * @body    { companyId, deptId, userId }
 */
router.post("/generate", async (req, res) => {
  console.log("📍 /api/roadmap/generate HIT");
  console.log("📦 Request body:", req.body);

  try {
    await generateUserRoadmap(req, res);
  } catch (error) {
    console.error("🔥 Route-level error:", error);
    res.status(500).json({
      error: "Roadmap route failed"
    });
  }
});

export default router;
