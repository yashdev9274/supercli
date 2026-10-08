/**
 * Public base URL for OAuth redirects.
 * Prefer BETTER_AUTH_URL (already used for GitHub OAuth), then NEXT_PUBLIC_APP_BASE_URL.
 */
export function getAppBaseUrl(): string {
  const url =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3003"
  return url.replace(/\/$/, "")
}

/**
 * Nova web surface base URL (connections / settings live here, not /dashboard/*).
 * Prefer dedicated env, then nova host derived from BETTER_AUTH_URL, then app base.
 */
export function getNovaWebBaseUrl(requestOrigin?: string | null): string {
  const explicit =
    process.env.NOVA_WEB_URL?.trim() ||
    process.env.NEXT_PUBLIC_NOVA_WEB_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, "")

  if (requestOrigin) {
    try {
      const origin = new URL(requestOrigin).origin
      if (origin) return origin.replace(/\/$/, "")
    } catch {
      // fall through
    }
  }

  const app = getAppBaseUrl()
  try {
    const parsed = new URL(app)
    // Local dashboard host → Nova host on the same port.
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      parsed.hostname = "nova.localhost"
      return parsed.origin
    }
    // Production app host → nova subdomain when obvious.
    if (parsed.hostname === "supercodeai.tech" || parsed.hostname === "www.supercodeai.tech") {
      parsed.hostname = "nova.supercodeai.tech"
      return parsed.origin
    }
    if (parsed.hostname.endsWith(".supercodeai.tech") && !parsed.hostname.startsWith("nova.")) {
      parsed.hostname = "nova.supercodeai.tech"
      return parsed.origin
    }
  } catch {
    // fall through
  }

  return app
}

export function getIntegrationsSettingsUrl(params?: {
  connected?: "slack" | "linear" | "github"
  error?: string
}): string {
  const base = `${getAppBaseUrl()}/dashboard/integrations`
  if (!params) return base
  const sp = new URLSearchParams()
  if (params.connected) sp.set("connected", params.connected)
  if (params.error) sp.set("integration_error", params.error)
  const q = sp.toString()
  return q ? `${base}?${q}` : base
}

/** Post-OAuth landing page inside Nova web (Connections). */
export function getNovaConnectionsUrl(
  params?: {
    connected?: "slack" | "linear" | "github"
    error?: string
  },
  requestOrigin?: string | null,
): string {
  const base = `${getNovaWebBaseUrl(requestOrigin)}/connections`
  if (!params) return base
  const sp = new URLSearchParams()
  if (params.connected) sp.set("connected", params.connected)
  if (params.error) sp.set("integration_error", params.error)
  const q = sp.toString()
  return q ? `${base}?${q}` : base
}
