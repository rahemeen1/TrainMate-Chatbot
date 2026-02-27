import express from "express";
import {
    generateQuiz,
    submitQuiz,
    testFirestoreWrite,
    adminUnlockModule,
    reportProctoringViolation,
} from "../controllers/QuizController.js";
const router = express.Router();

router.post("/quiz/generate", generateQuiz);
router.post("/quiz/submit", submitQuiz);
router.post("/quiz/test-firestore", testFirestoreWrite);
router.post("/quiz/admin-unlock", adminUnlockModule);
router.post("/quiz/proctoring-violation", reportProctoringViolation);

export default router;
