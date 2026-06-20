
export const openRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY || "",
  model: process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2.6",
  maxTokens: Number(process.env.OPENROUTER_MAX_TOKENS) || 8192,
  siteUrl: process.env.OPENROUTER_SITE_URL || "",
  siteTitle: process.env.OPENROUTER_SITE_TITLE || "supercode",
}
