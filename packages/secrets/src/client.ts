import { InfisicalClient } from "@infisical/sdk"
import { resolveToken } from "./resolve-token"
import type { AppId } from "./resolve-token"

let shared: InfisicalClient | null = null

export function getClient(app: AppId): InfisicalClient {
  if (!shared) {
    const { token, source } = resolveToken(app)
    shared = new InfisicalClient({
      token,
      siteUrl: process.env.INFISICAL_SITE_URL ?? "https://app.infisical.com",
    })
  }
  return shared
}

export function resetClient(): void {
  shared = null
}
