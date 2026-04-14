import express from "express";
import {
    generateQuiz,
    submitQuiz,
    testFirestoreWrite,
    adminUnlockModule,
    adminPassModule,
    reportProctoringViolation,
    openFinalQuiz,
    generateFinalQuiz,
    submitFinalQuiz,
} from "../controllers/QuizController.js";
const router = express.Router();

router.post("/quiz/generate", generateQuiz);
router.post("/quiz/submit", submitQuiz);
router.post("/quiz/test-firestore", testFirestoreWrite);
router.post("/quiz/admin-unlock", adminUnlockModule);
router.post("/quiz/admin-pass-module", adminPassModule);
router.post("/quiz/proctoring-violation", reportProctoringViolation);
router.post("/quiz/final/open", openFinalQuiz);
router.post("/quiz/final/generate", generateFinalQuiz);
router.post("/quiz/final/submit", submitFinalQuiz);

export default router;
