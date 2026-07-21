
export function getOpenRouterApiKey(): string {
  return process.env.OPENROUTER_BYOK_PROD_KEY
    || process.env.OPENROUTER_BYOK_DEV_KEY
    || ""
}

export const openRouterConfig = {
  get apiKey() { return getOpenRouterApiKey() },
  get model() { return process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2.6" },
  get maxTokens() { return Number(process.env.OPENROUTER_MAX_TOKENS) || 8192 },
  get siteUrl() { return process.env.OPENROUTER_SITE_URL || "" },
  get siteTitle() { return process.env.OPENROUTER_SITE_TITLE || "supercode" },
}
