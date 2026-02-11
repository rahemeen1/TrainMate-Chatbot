import express from "express";
import { generateQuiz, submitQuiz, testFirestoreWrite } from "../controllers/QuizController.js";

const router = express.Router();

router.post("/quiz/generate", generateQuiz);
router.post("/quiz/submit", submitQuiz);
router.post("/quiz/test-firestore", testFirestoreWrite);

export default router;
