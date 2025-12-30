import { CohereClient } from "cohere-ai";

let cohereClient;

export const getCohereClient = () => {
  if (!process.env.COHERE_API_KEY) {
    throw new Error("COHERE_API_KEY missing in .env");
  }

  if (!cohereClient) {
    cohereClient = new CohereClient({
      token: process.env.COHERE_API_KEY,
    });
  }

  return cohereClient;
};
