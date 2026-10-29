import { createHash } from "node:crypto"
import { z } from "zod"

// Protocol pinned to openai/codex 727283cea5ba30e8cf8bbac6b68a03a4d91cf1b7.
export const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
export const CODEX_VERIFICATION_URL = "https://auth.openai.com/codex/device"
const ISSUER = "https://auth.openai.com"
const secret = z.string().min(1).max(32_768)
export const deviceSchema = z.object({ device_auth_id: secret, user_code: z.string().min(1).max(64) })
export const tokenSchema = z.object({ access_token: secret, refresh_token: secret, id_token: secret })
export type CodexTokens = z.infer<typeof tokenSchema>
export type DeviceSecret = z.infer<typeof deviceSchema>
export type CodexProvider = {
  start(): Promise<DeviceSecret & { interval: number }>
  poll(device: DeviceSecret): Promise<{ pending: true; retryAfter?: number } | { pending: false; tokens: CodexTokens }>
}

export class CodexError extends Error {
  constructor(message: string, public readonly statusCode = 502) { super(message) }
}

export async function boundedJson(response: Response, limit = 131_072): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new CodexError("Invalid response from Codex")
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > limit) throw new CodexError("Invalid response from Codex")
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new CodexError("Invalid response from Codex")
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export async function refreshCodexTokens(previous: CodexTokens, fetcher: typeof fetch = fetch): Promise<CodexTokens> {
  try {
    const response = await fetcher(`${ISSUER}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", client_id: CODEX_CLIENT_ID, refresh_token: previous.refresh_token }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error("rejected")
    }
    const updated = tokenSchema.partial().parse(await boundedJson(response))
    if (!updated.access_token) throw new Error("missing access token")
    return tokenSchema.parse({ ...previous, ...updated })
  } catch {
    throw new CodexError("Codex refresh failed. Reconnect Codex in Settings → Models.", 401)
  }
}

export function createCodexProvider(fetcher: typeof fetch = fetch): CodexProvider {
  async function post(path: string, body: string, form = false): Promise<Response> {
    try {
      return await fetcher(`${ISSUER}${path}`, {
        method: "POST",
        headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
        body,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      })
    } catch {
      throw new CodexError("Could not contact Codex. Cancel and start a new connection.")
    }
  }
  return {
    async start() {
      const response = await post("/api/accounts/deviceauth/usercode", JSON.stringify({ client_id: CODEX_CLIENT_ID }))
      if (!response.ok) {
        await response.body?.cancel()
        throw new CodexError("Codex could not start device authorization. Check that device code authorization is enabled in ChatGPT Security settings.")
      }
      const parsed = z.object({
        device_auth_id: secret,
        user_code: z.string().min(1).max(64).optional(),
        usercode: z.string().min(1).max(64).optional(),
        interval: z.union([z.string().regex(/^\s*\d+\s*$/), z.number().int().nonnegative()]).optional(),
      }).safeParse(await boundedJson(response))
      if (!parsed.success) throw new CodexError("Invalid response from Codex")
      const code = parsed.data.user_code ?? parsed.data.usercode
      const interval = Number(parsed.data.interval ?? 5)
      if (!code || !Number.isSafeInteger(interval) || interval > 900) throw new CodexError("Invalid response from Codex")
      return { device_auth_id: parsed.data.device_auth_id, user_code: code, interval: Math.max(5, interval) }
    },
    async poll(device) {
      const response = await post("/api/accounts/deviceauth/token", JSON.stringify(device))
      if ([403, 404, 429, 500, 502, 503, 504].includes(response.status)) {
        const retry = Number(response.headers.get("Retry-After"))
        await response.body?.cancel()
        return { pending: true, retryAfter: response.status === 403 || response.status === 404 ? undefined : Math.max(30, Math.min(900, Number.isFinite(retry) ? retry : 30)) }
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new CodexError("Codex authorization failed. Start a new connection.")
      }
      const result = z.object({
        authorization_code: secret,
        code_verifier: z.string().min(43).max(128).regex(/^[A-Za-z0-9._~-]+$/),
        code_challenge: z.string().min(43).max(128),
      }).safeParse(await boundedJson(response))
      if (!result.success || createHash("sha256").update(result.data.code_verifier).digest("base64url") !== result.data.code_challenge) {
        throw new CodexError("Invalid authorization response from Codex")
      }
      // Never retry this one-time exchange, including after a timeout.
      const exchanged = await post("/oauth/token", new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CODEX_CLIENT_ID,
        code: result.data.authorization_code,
        code_verifier: result.data.code_verifier,
        redirect_uri: `${ISSUER}/deviceauth/callback`,
      }).toString(), true)
      if (!exchanged.ok) {
        await exchanged.body?.cancel()
        throw new CodexError("Codex token exchange failed. Start a new connection.")
      }
      const tokens = tokenSchema.safeParse(await boundedJson(exchanged))
      if (!tokens.success) throw new CodexError("Invalid token response from Codex")
      return { pending: false, tokens: tokens.data }
    },
  }
}
