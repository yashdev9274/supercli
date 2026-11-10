import "server-only"

import { auth } from "@super/auth/server"
import prisma from "@super/db"

import { API_KEY_PROVIDER_IDS } from "@/modules/nova-web/provider-integrations"

import { configuredProviderVault, ProviderCredentialError } from "./vault"

export const SUPPORTED_PROVIDER_CREDENTIALS = ["cursor", "opencode", ...API_KEY_PROVIDER_IDS] as const
export type ProviderCredentialProvider = typeof SUPPORTED_PROVIDER_CREDENTIALS[number]

export type StoredProviderConfig = {
  apiKey: string
  name?: string
  baseUrl?: string
  apiFamily?: "openai" | "anthropic" | "google"
  headers?: Record<string, string>
  models?: Array<{ id: string; label: string; description?: string }>
}

export function isProviderCredentialProvider(value: string): value is ProviderCredentialProvider {
  return (SUPPORTED_PROVIDER_CREDENTIALS as readonly string[]).includes(value)
}

export async function providerCredentialContext(request: Request, provider: string) {
  if (!isProviderCredentialProvider(provider)) throw new ProviderCredentialError("Unsupported provider", 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user?.id || !session.session.id) throw new ProviderCredentialError("Sign in to Nova to connect this provider", 401)
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { organizationId: true } })
  if (!user?.organizationId) throw new ProviderCredentialError("Set up your Nova organization before connecting a provider", 403)
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: user.organizationId, userId: session.user.id } },
    select: { id: true, status: true },
  })
  if (!membership || membership.status !== "active") throw new ProviderCredentialError("Active organization membership required", 403)
  if (!prisma.novaProviderCredential) throw new ProviderCredentialError("Nova database client is out of date. Run db:generate and restart the web server.")
  const binding = JSON.stringify([user.organizationId, session.user.id, membership.id, provider])
  const vault = configuredProviderVault()
  return { userId: session.user.id, organizationId: user.organizationId, membershipId: membership.id, provider: provider as ProviderCredentialProvider, binding, vault }
}

export async function readProviderConfig(request: Request, provider: string) {
  const context = await providerCredentialContext(request, provider)
  const row = await prisma.novaProviderCredential.findUnique({ where: { membershipId_provider: { membershipId: context.membershipId, provider: context.provider } } })
  if (!row || row.status !== "connected" || !row.enabled) return { ...context, config: null as StoredProviderConfig | null }
  const decrypted = context.vault.open(row.encryptedApiKey, context.binding)
  try {
    const parsed = JSON.parse(decrypted) as Partial<StoredProviderConfig>
    if (typeof parsed.apiKey === "string") return { ...context, config: parsed as StoredProviderConfig }
  } catch { /* Existing cursor/OpenCode rows stored the raw key. */ }
  return { ...context, config: { apiKey: decrypted } satisfies StoredProviderConfig }
}

export async function readProviderApiKey(request: Request, provider: string) {
  const state = await readProviderConfig(request, provider)
  return { ...state, apiKey: state.config?.apiKey ?? null }
}
