import { InfisicalSDK } from "@infisical/sdk"
import { resolveToken } from "./resolve-token"
import type { AppId } from "./resolve-token"

let shared: InfisicalSDK | null = null

export function getClient(app: AppId): InfisicalSDK {
  if (!shared) {
    const { token } = resolveToken(app)
    shared = new InfisicalSDK({
      siteUrl: process.env.INFISICAL_SITE_URL ?? "https://app.infisical.com",
    })
    shared.authenticate(token)
  }
  return shared
}

export function resetClient(): void {
  shared = null
}
