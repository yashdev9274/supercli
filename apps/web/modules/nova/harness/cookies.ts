export const HARNESS_TOKEN_COOKIE = "nova_harness_token"

const HARNESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 14

export function harnessTokenMaxAgeSeconds() {
  return HARNESS_TOKEN_MAX_AGE_SECONDS
}

export function harnessTokenCookieHeader(token: string): string {
  const parts = [
    `${HARNESS_TOKEN_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${HARNESS_TOKEN_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ]
  if (process.env.NODE_ENV === "production") parts.push("Secure")
  return parts.join("; ")
}

export function clearHarnessTokenCookieHeader(): string {
  const parts = [
    `${HARNESS_TOKEN_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ]
  if (process.env.NODE_ENV === "production") parts.push("Secure")
  return parts.join("; ")
}
