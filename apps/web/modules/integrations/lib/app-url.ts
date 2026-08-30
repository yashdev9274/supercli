/**
 * Public base URL for OAuth redirects.
 * Prefer BETTER_AUTH_URL (already used for GitHub OAuth), then NEXT_PUBLIC_APP_BASE_URL.
 */
export function getAppBaseUrl(): string {
  const url =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  return url.replace(/\/$/, "")
}

export function getIntegrationsSettingsUrl(params?: {
  connected?: "slack" | "linear"
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
