
export const openRouterConfig = {
  get apiKey() { return process.env.OPENROUTER_API_KEY || "" },
  get model() { return process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2.6" },
  get maxTokens() { return Number(process.env.OPENROUTER_MAX_TOKENS) || 8192 },
  get siteUrl() { return process.env.OPENROUTER_SITE_URL || "" },
  get siteTitle() { return process.env.OPENROUTER_SITE_TITLE || "supercode" },
}
