import express from "express";
import { generateQuiz, submitQuiz, testFirestoreWrite, adminUnlockModule } from "../controllers/QuizController.js";

const router = express.Router();

router.post("/quiz/generate", generateQuiz);
router.post("/quiz/submit", submitQuiz);
router.post("/quiz/test-firestore", testFirestoreWrite);
router.post("/quiz/admin-unlock", adminUnlockModule);

export default router;
