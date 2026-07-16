

export const minimaxConfig = {
  get apiKey() { return process.env.MINIMAX_API_KEY || "" },
  get model() { return process.env.MINIMAX_MODEL || "MiniMax-M2" },
}
