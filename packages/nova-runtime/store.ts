import { createHash } from "node:crypto"
import { integrationFor } from "@super/agent-runtime/integrations"
import type { NovaScopeStore } from "./scope"

export function providerConnectionId(membershipId: string, provider: string, revision: string): string {
  return createHash("sha256").update(JSON.stringify([membershipId, provider, revision])).digest("base64url")
}

export function createPrismaScopeStore(): NovaScopeStore {
  return {
    async findSession(novaSessionId) {
      const { default: prisma } = await import("@super/db")
      return prisma.agentSession.findUnique({
        where: { id: novaSessionId },
        select: {
          id: true,
          organizationId: true,
          initiatorMembership: {
            select: { id: true, organizationId: true, userId: true, status: true },
          },
        },
      })
    },
    async findConnection(scope) {
      const { default: prisma } = await import("@super/db")
      if (scope.provider === "codex") {
        const row = await prisma.novaCodexConnection.findUnique({
          where: { membershipId: scope.membershipId },
          select: { state: true, connectedAt: true, membership: { select: { id: true, userId: true, organizationId: true, status: true } } },
        })
        if (!row?.connectedAt || row.membership.status !== "active") return null
        return {
          connectionId: providerConnectionId(row.membership.id, scope.provider, row.connectedAt.toISOString()),
          provider: scope.provider, membershipId: row.membership.id, userId: row.membership.userId,
          organizationId: row.membership.organizationId, status: row.state, enabled: row.state === "connected",
        }
      }
      if (integrationFor(scope.provider).credential !== "provider-key") return null
      const row = await prisma.novaProviderCredential.findUnique({
        where: { membershipId_provider: { membershipId: scope.membershipId, provider: scope.provider } },
        select: { status: true, enabled: true, updatedAt: true, membership: { select: { id: true, userId: true, organizationId: true, status: true } } },
      })
      if (!row || row.membership.status !== "active") return null
      return {
        connectionId: providerConnectionId(row.membership.id, scope.provider, row.updatedAt.toISOString()),
        provider: scope.provider, membershipId: row.membership.id, userId: row.membership.userId,
        organizationId: row.membership.organizationId, status: row.status, enabled: row.enabled,
      }
    },
  }
}
