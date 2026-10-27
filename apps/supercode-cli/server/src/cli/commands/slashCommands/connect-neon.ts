import { isCancel, password, text } from "@clack/prompts"
import { normalizeNeonBaseURL } from "../../../config/neon.config"

export async function connectNeon(): Promise<boolean> {
  let baseURL = process.env.NEON_AI_GATEWAY_BASE_URL
  try {
    baseURL = normalizeNeonBaseURL(baseURL || "")
  } catch {
    const value = await text({
      message: "Neon branch gateway URL (bare HTTPS origin, no /v1)",
      placeholder: "Copy from Neon Console → branch → AI Gateway",
      validate(value) {
        try { normalizeNeonBaseURL(value || "") } catch (error) {
          return error instanceof Error ? error.message : "Invalid branch URL"
        }
      },
    })
    if (isCancel(value)) return false
    baseURL = normalizeNeonBaseURL(value)
  }
  let token = process.env.NEON_AI_GATEWAY_TOKEN?.trim()
  if (!token) {
    const value = await password({
      message: "Neon branch token with ai_gateway:invoke (not a management API key)",
      validate(value) { if (!value?.trim()) return "A branch invocation token is required" },
    })
    if (isCancel(value)) return false
    token = value.trim()
  }
  // Only update after both prompts succeed; never write the token to disk.
  process.env.NEON_AI_GATEWAY_BASE_URL = baseURL
  process.env.NEON_AI_GATEWAY_TOKEN = token
  return true
}
