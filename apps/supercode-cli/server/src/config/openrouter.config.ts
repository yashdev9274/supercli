
export const openRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY || "",
  model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free",
  maxTokens: Number(process.env.OPENROUTER_MAX_TOKENS) || 4096,
  siteUrl: process.env.OPENROUTER_SITE_URL || "",
  siteTitle: process.env.OPENROUTER_SITE_TITLE || "supercode",
}
