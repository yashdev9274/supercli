import { createHash } from "node:crypto"
import type { IntegrationId } from "@super/agent-runtime/integrations"

import { parseStoredProviderConfig, type StoredProviderConfig } from "./config"
import { configuredProviderVault, ProviderCredentialError } from "./vault"

export type ProviderCredentialScope = {
  userId: string
  organizationId: string
  membershipId: string
  provider: IntegrationId
  connectionId: string
}

export type ProviderCredentialEnvironment = {
  NOVA_CODEX_ENCRYPTION_KEYS?: string
  NOVA_CODEX_ENCRYPTION_KEY_VERSION?: string
}

export async function readScopedProviderConfig(
  scope: ProviderCredentialScope,
  env?: ProviderCredentialEnvironment,
): Promise<StoredProviderConfig> {
  try {
    const { default: prisma } = await import("@super/db")
    if (!prisma.novaProviderCredential) {
      throw new ProviderCredentialError("Nova database client is out of date. Run db:generate and restart the server.")
    }
    const row = await prisma.novaProviderCredential.findFirst({
      where: {
        membershipId: scope.membershipId,
        provider: scope.provider,
        status: "connected",
        enabled: true,
        membership: {
          id: scope.membershipId,
          userId: scope.userId,
          organizationId: scope.organizationId,
          status: "active",
        },
      },
      select: { updatedAt: true, encryptedApiKey: true },
    })
    if (!row) throw new ProviderCredentialError("An active scoped provider connection is required", 403)
    const connectionId = createHash("sha256")
      .update(JSON.stringify([scope.membershipId, scope.provider, row.updatedAt.toISOString()]))
      .digest("base64url")
    if (connectionId !== scope.connectionId) {
      throw new ProviderCredentialError("Provider connection changed. Authorize the new connection before continuing.", 409)
    }
    const binding = JSON.stringify([scope.organizationId, scope.userId, scope.membershipId, scope.provider])
    return parseStoredProviderConfig(configuredProviderVault(env).open(row.encryptedApiKey, binding))
  } catch (error) {
    if (error instanceof ProviderCredentialError) throw error
    throw new ProviderCredentialError("Provider credentials could not be loaded")
  }
}
