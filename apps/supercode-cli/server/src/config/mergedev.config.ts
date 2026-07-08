export const mergedevConfig = {
  apiKey: process.env.MERGE_DEV_API_KEY || "",
  model: process.env.MERGE_DEV_MODEL || "anthropic/claude-opus-4-8",
  baseUrl: "https://api-gateway.merge.dev/v1/openai",
  maxTokens: Number(process.env.MERGE_DEV_MAX_TOKENS) || 128000,
}
