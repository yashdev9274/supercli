export const DEFAULT_NEON_MODEL = "gpt-5-mini"

export function normalizeNeonBaseURL(value: string): string {
  const message = "NEON_AI_GATEWAY_BASE_URL must be a bare HTTPS branch URL without credentials, query, fragment, or API path. Copy it from Neon Console → branch → AI Gateway."
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error(message)
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(message)
  }
  return url.origin
}

export function getNeonConfig(env: Record<string, string | undefined> = process.env) {
  if (!env.NEON_AI_GATEWAY_BASE_URL?.trim()) {
    throw new Error("Set NEON_AI_GATEWAY_BASE_URL to your Neon branch's HTTPS gateway URL, or run /connect → Neon AI Gateway in the CLI.")
  }
  const baseURL = normalizeNeonBaseURL(env.NEON_AI_GATEWAY_BASE_URL)
  const apiKey = env.NEON_AI_GATEWAY_TOKEN?.trim()
  if (!apiKey) {
    throw new Error("Set NEON_AI_GATEWAY_TOKEN to a branch token with ai_gateway:invoke (not a Neon management API key), or run /connect → Neon AI Gateway in the CLI.")
  }
  return { baseURL, apiKey }
}
