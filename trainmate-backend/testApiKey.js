import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log("Testing API Key:", apiKey ? `${apiKey.substring(0, 15)}...` : "NOT FOUND");

const genAI = new GoogleGenerativeAI(apiKey);

console.log("\n🧪 Testing gemini-2.5-flash (checking quota status)...");
console.log(`⏰ Current time: ${new Date().toLocaleTimeString()}\n`);

const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

try {
  const result = await model.generateContent("Say hello in 3 words");
  console.log("✅ gemini-2.5-flash works! Quota is available.");
  console.log("Response:", result.response.text());
  console.log("\n✨ Your API is ready! Restart your server and try the roadmap generation.");
} catch (error) {
  if (error.message.includes("429") || error.message.includes("quota")) {
    // Extract retry time if available
    const retryMatch = error.message.match(/retry in ([\d.]+)s/);
    
    if (retryMatch) {
      const seconds = parseFloat(retryMatch[1]);
      console.error(`❌ Rate limit hit. Wait ${Math.ceil(seconds)} seconds and try again.`);
      console.log(`   This is a PER-MINUTE rate limit - resets quickly!`);
    } else {
      console.error("❌ Daily quota (20 requests) exceeded for gemini-2.5-flash");
      console.log("   Resets at midnight UTC (or your timezone)");
    }
    
    console.log("\n💡 Solutions:");
    console.log("   1. Wait for quota to reset");
    console.log("   2. Get a NEW API key: https://aistudio.google.com/app/apikey");
    console.log("   3. Upgrade to paid tier for unlimited requests");
  } else {
    console.error("❌ Error:", error.message);
  }
}

