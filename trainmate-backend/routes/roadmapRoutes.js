import express from "express";
import { generateUserRoadmap, regenerateRoadmapModule } from "../controllers/roadmap.controller.js";

const router = express.Router();

/**
 * @route   POST /api/roadmap/generate
 * @desc    Generate personalized roadmap for a fresher
 * @body    { companyId, deptId, userId }
 */
router.post("/generate", async (req, res) => {
  try {
    await generateUserRoadmap(req, res);
  } catch (error) {
    console.error("🔥 Route-level error:", error);
    res.status(500).json({
      error: "Roadmap route failed"
    });
  }
});

/**
 * @route   POST /api/roadmap/regenerate
 * @desc    Regenerate a failed module into 2-3 focused modules and resequence roadmap
 * @body    { companyId, deptId, userId, moduleId, notificationId? }
 */
router.post("/regenerate", async (req, res) => {
  try {
    await regenerateRoadmapModule(req, res);
  } catch (error) {
    console.error("🔥 Regenerate route-level error:", error);
    res.status(500).json({
      error: "Roadmap regenerate route failed"
    });
  }
});

export default router;
