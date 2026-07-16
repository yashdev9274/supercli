export const mergedevConfig = {
  get apiKey() { return process.env.MERGE_DEV_API_KEY || "" },
  get model() { return process.env.MERGE_DEV_MODEL || "anthropic/claude-opus-4-8" },
  baseUrl: "https://api-gateway.merge.dev/v1/openai",
  get maxTokens() { return Number(process.env.MERGE_DEV_MAX_TOKENS) || 128000 },
}
