import { createHmac, timingSafeEqual } from "crypto"

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export type OAuthReturnTo = "desktop" | "web" | "nova"

function getStateSecret(): string {
  const secret =
    process.env.BETTER_AUTH_SECRET ||
    process.env.INTEGRATIONS_OAUTH_STATE_SECRET
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required for OAuth state signing")
  }
  return secret
}

function normalizeReturnTo(value: unknown): OAuthReturnTo {
  if (value === "desktop") return "desktop"
  if (value === "nova") return "nova"
  return "web"
}

/**
 * Signed CSRF state: base64url(payload).base64url(hmac)
 * payload = { userId, provider, returnTo, exp }
 */
export function createOAuthState(
  userId: string,
  provider: "slack" | "linear" | "github",
  returnTo: OAuthReturnTo = "web",
): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      provider,
      returnTo,
      exp: Date.now() + STATE_TTL_MS,
    }),
    "utf8",
  ).toString("base64url")

  const sig = createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("base64url")

  return `${payload}.${sig}`
}

export function verifyOAuthState(
  state: string,
  expectedProvider: "slack" | "linear" | "github",
): { userId: string; returnTo: OAuthReturnTo } | null {
  const parts = state.split(".")
  if (parts.length !== 2) return null
  const [payload, sig] = parts
  if (!payload || !sig) return null

  const expectedSig = createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("base64url")

  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: string
      provider?: string
      exp?: number
      returnTo?: string
    }
    if (!data.userId || data.provider !== expectedProvider) return null
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null
    return {
      userId: data.userId,
      returnTo: normalizeReturnTo(data.returnTo),
    }
  } catch {
    return null
  }
}
