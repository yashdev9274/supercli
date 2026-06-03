import dotenv from "dotenv"
dotenv.config();

export const config = {
  googleApiKey: process.env.GOOGL_GENERATIVE_AI_API_KEY || "",
  model: process.env.MODEL1 || "gemini-2.5-flash"
}
