import { InfisicalSDK } from "@infisical/sdk"
import { resolveToken } from "./resolve-token"
import type { AppId } from "./resolve-token"

let sharedTokenClient: InfisicalSDK | null = null

export async function getClient(app: AppId): Promise<InfisicalSDK> {
  try {
    const { token } = resolveToken(app)
    if (!sharedTokenClient) {
      sharedTokenClient = new InfisicalSDK({
        siteUrl: process.env.INFISICAL_SITE_URL ?? "https://app.infisical.com",
      }).auth().accessToken(token)
    }
    return sharedTokenClient
  } catch (error) {
    const clientId = process.env.INFISICAL_CLIENT_ID
    const clientSecret = process.env.INFISICAL_CLIENT_SECRET
    if (!clientId || !clientSecret) throw error

    const client = new InfisicalSDK({
      siteUrl: process.env.INFISICAL_SITE_URL ?? "https://app.infisical.com",
    })
    await client.auth().universalAuth.login({ clientId, clientSecret })
    return client
  }
}

export function resetClient(): void {
  sharedTokenClient = null
}
