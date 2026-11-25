import { CodexError } from "./provider"
import type { CodexOwner, CodexStore } from "./service"

const emptyConnection = (membershipId: string) => ({
  membershipId, state: "disconnected", version: 0, attemptId: null, sessionHash: null,
  encryptedAttempt: null, encryptedCredentials: null, intervalSeconds: 5,
  expiresAt: null, nextPollAt: null, lastStartedAt: null, connectedAt: null,
})

export async function createPrismaCodexStore(owner: CodexOwner): Promise<CodexStore> {
  const { default: prisma } = await import("@super/db")
  const scope = {
    membershipId: owner.membershipId,
    membership: { userId: owner.userId, organizationId: owner.organizationId, status: "active" },
  }
  if (!prisma.novaCodexConnection) {
    throw new CodexError("Nova’s database client is out of date. Run db:generate and restart the web server.", 503)
  }
  const store: CodexStore = {
    async get() {
      const active = await prisma.organizationMembership.findFirst({
        where: { id: owner.membershipId, userId: owner.userId, organizationId: owner.organizationId, status: "active" },
        select: { id: true },
      })
      if (!active) throw new CodexError("Active organization membership required", 403)
      const row = await prisma.novaCodexConnection.findUnique({ where: { membershipId: owner.membershipId } })
      return row ?? emptyConnection(owner.membershipId)
    },
    async compareAndSwap(version, patch) {
      if (version === 0) {
        await prisma.novaCodexConnection.upsert({
          where: { membershipId: owner.membershipId },
          create: { membershipId: owner.membershipId },
          update: {},
        })
      }
      const result = await prisma.novaCodexConnection.updateMany({
        where: { ...scope, version },
        data: { ...patch, version: { increment: 1 } },
      })
      return result.count === 1
    },
  }
  return store
}
