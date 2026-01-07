import { GoogleGenerativeAI } from "@google/generative-ai";
import { doc, collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "../config/firebase.js";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY missing");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const handleChat = async (req, res) => {
  const { userId, companyId, deptId, messageHistory, newMessage } = req.body;

  try {
    // -------------------------
    // Validate input
    // -------------------------
    if (!userId || !companyId || !deptId || !newMessage) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log("📨 Chat request received:", { userId, newMessage });

    // -------------------------
    // Firestore: store user message
    // -------------------------
    const chatRef = collection(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId,
      "chatSessions"
    );

    await addDoc(chatRef, {
      from: "user",
      text: newMessage,
      timestamp: Timestamp.now(),
    });

    // -------------------------
    // Gemini Model Setup
    // -------------------------
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
      systemInstruction:
        "You are a helpful AI assistant for freshers. Respond ONLY with valid JSON: { text: string }.",
    });

    // -------------------------
    // Build prompt
    // -------------------------
    const prompt = `
Conversation so far:
${messageHistory.join("\n")}
User: ${newMessage}

TASK:
Respond as a helpful AI assistant in JSON:
{ "text": "your response here" }
`;

    console.log("📨 Sending prompt to Gemini...");

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawResponse = await response.text();

    console.log("📩 Gemini raw response received");

    // -------------------------
    // Parse Gemini JSON safely
    // -------------------------
    let aiReply;
    try {
      const parsed = JSON.parse(rawResponse);
      aiReply = parsed.text ?? "Sorry, I did not understand that.";
    } catch (err) {
      console.error("❌ Invalid Gemini JSON:", rawResponse);
      aiReply = "Oops! AI returned invalid JSON.";
    }

    // -------------------------
    // Store AI reply in Firestore
    // -------------------------
    await addDoc(chatRef, {
      from: "bot",
      text: aiReply,
      timestamp: Timestamp.now(),
    });

    // -------------------------
    // Return AI reply
    // -------------------------
    res.json({ reply: aiReply });
  } catch (err) {
    console.error("🔥 Chatbot error:", err.message);
    res.status(500).json({ error: "Chatbot internal error" });
  }
};
