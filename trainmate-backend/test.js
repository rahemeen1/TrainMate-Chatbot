import dotenv from "dotenv";
dotenv.config();

console.log("COHERE_API_KEY =", process.env.COHERE_API_KEY);
console.log("PINECONE_API_KEY =", process.env.PINECONE_API_KEY);
