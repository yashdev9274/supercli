import dotenv from "dotenv"
dotenv.config()

export const minimaxConfig = {
  apiKey: process.env.MINIMAX_API_KEY || "",
  model: process.env.MINIMAX_MODEL || "MiniMax-M2",
}
