import prisma from "@super/db"
import {
  NOVA_CONTRACT_VERSION,
  isBotConnectorReady,
  type ConnectorStatus,
} from "@super/nova"

import { ensureUserOrganization } from "@/modules/integrations/lib/org"
import { connectorDefinition } from "./config"
import { createConnectorState } from "./state"

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function boolConfig(value: unknown, key: string): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>)[key] === true)
}

export async function listConnectorStatuses(
  userId: string,
  returnTo: "desktop" | "web" = "desktop",
): Promise<ConnectorStatus[]> {
  const organizationId = await ensureUserOrganization(userId)
  const [installations, delegated] = await Promise.all([
    prisma.externalInstallation.findMany({
      where: { organizationId, provider: { in: ["slack", "linear", "github"] } },
    }),
    prisma.userDelegatedConnection.findMany({
      where: {
        organizationId,
        membership: { userId },
        provider: { in: ["slack", "linear", "github"] },
      },
    }),
  ])

  return (["slack", "linear", "github"] as const).map((provider) => {
    const definition = connectorDefinition(provider)!
    const installation = installations.find((item) => item.provider === provider) ?? null
    const userConnection = delegated.find((item) => item.provider === provider) ?? null
    const grantedScopes = stringArray(installation?.grantedScopes)
    const missingScopes = definition.requiredConversationScopes.filter(
      (scope) => !grantedScopes.includes(scope),
    )
    const canReceiveMessages = boolConfig(installation?.config, "canReceiveMessages")
    const canReplyAsNova = boolConfig(installation?.config, "canReplyAsNova")
    const ready = installation
      ? isBotConnectorReady({
          status: installation.status,
          webhookStatus: installation.webhookStatus,
          canReceiveMessages,
          canReplyAsNova,
          missingScopes,
        })
      : false
    const state = createConnectorState({ userId, organizationId, provider, returnTo })
    const authorizeUrl = definition.authorizeUrl(state)

    return {
      provider,
      botInstallation: installation
        ? {
            contractVersion: NOVA_CONTRACT_VERSION,
            id: installation.id,
            provider,
            externalAccountId: installation.externalAccountId,
            externalAccountName: installation.externalAccountName,
            botExternalUserId: installation.botExternalUserId,
            health: installation.status === "active"
              ? missingScopes.length > 0 ? "permission_missing" : installation.webhookStatus === "healthy" ? "healthy" : "pending"
              : installation.status as "pending" | "permission_missing" | "unhealthy" | "revoked",
            webhookHealth: installation.webhookStatus as "pending" | "healthy" | "failing" | "disabled",
            grantedScopes,
            missingScopes,
            canReceiveMessages,
            canReplyAsNova,
            lastHealthCheckAt: installation.lastHealthCheckAt?.toISOString() ?? null,
            lastEventAt: installation.lastEventAt?.toISOString() ?? null,
          }
        : null,
      delegatedConnection: userConnection
        ? {
            contractVersion: NOVA_CONTRACT_VERSION,
            id: userConnection.id,
            provider,
            externalAccountId: userConnection.externalAccountId,
            grantedScopes: stringArray(userConnection.grantedScopes),
            status: userConnection.status as "active" | "expired" | "revoked",
            expiresAt: userConnection.expiresAt?.toISOString() ?? null,
          }
        : null,
      ready,
      statusMessage: ready
        ? `${definition.displayName} can receive messages and reply as Nova.`
        : installation
          ? missingScopes.length > 0
            ? `Reconnect ${definition.displayName} to grant: ${missingScopes.join(", ")}.`
            : "Installation is waiting for a verified event and Nova-authored reply."
          : `Install Nova in ${definition.displayName} to enable conversations.`,
      authorizeUrl: authorizeUrl?.toString() ?? null,
      testConversationUrl: null,
    }
  })
}
