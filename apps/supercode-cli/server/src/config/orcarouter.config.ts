export const orcarouterConfig = {
  get apiKey() { return process.env.ORCAROUTER_API_KEY || "" },
  get model() { return process.env.ORCAROUTER_MODEL || "openai/gpt-4o-mini" },
  baseUrl: "https://api.orcarouter.ai/v1",
  get maxTokens() { return Number(process.env.ORCAROUTER_MAX_TOKENS) || 128000 },
}
