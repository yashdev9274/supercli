export function getOrcaRouterApiKey(): string {
  return process.env.ORCAROUTER_BYOK_PROD_KEY
    || process.env.ORCAROUTER_BYOK_DEV_KEY
    || ""
}

export const orcarouterConfig = {
  get apiKey() { return getOrcaRouterApiKey() },
  get model() { return process.env.ORCAROUTER_MODEL || "openai/gpt-4o-mini" },
  baseUrl: "https://api.orcarouter.ai/v1",
  get maxTokens() { return Number(process.env.ORCAROUTER_MAX_TOKENS) || 128000 },
}
