

export function getMinimaxApiKey(): string {
  return process.env.MINIMAX_BYOK_PROD_KEY
    || process.env.MINIMAX_BYOK_DEV_KEY
    || ""
}

export const minimaxConfig = {
  get apiKey() { return getMinimaxApiKey() },
  get model() { return process.env.MINIMAX_MODEL || "MiniMax-M2" },
}
