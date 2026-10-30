import prisma from "@super/db"

import { BrowserError, type BrowserRow, type BrowserStore } from "./contracts"

// Raw parameterized queries keep this registry compatible with independently
// deployed clients; missing migration/client prerequisites fail sanitized closed.
export const browserStore: BrowserStore = {
  async locked(scope, work) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: scope.userId }, select: { organizationId: true } })
      if (!user?.organizationId) throw new BrowserError("Browser session not found", 404)
      const organizationId = user.organizationId
      await tx.$queryRaw`SELECT id FROM organization WHERE id = ${organizationId} FOR UPDATE`
      const membership = await tx.organizationMembership.findFirst({
        where: { organizationId, userId: scope.userId, status: "active" }, select: { id: true },
      })
      const session = await tx.agentSession.findFirst({
        where: { id: scope.sessionId, organizationId }, select: { id: true },
      })
      if (!membership || !session) throw new BrowserError("Browser session not found", 404)
      async function get(id: string): Promise<BrowserRow | null> {
        const rows = await tx.$queryRaw<BrowserRow[]>`SELECT * FROM nova_browser_session WHERE id = ${id} AND "organizationId" = ${organizationId} AND "userId" = ${scope.userId} AND "agentSessionId" = ${scope.sessionId}`
        return rows[0] ?? null
      }
      return work({
        get,
        async latest() {
          const rows = await tx.$queryRaw<BrowserRow[]>`SELECT * FROM nova_browser_session WHERE "organizationId" = ${organizationId} AND "userId" = ${scope.userId} AND "agentSessionId" = ${scope.sessionId} ORDER BY "createdAt" DESC, id DESC LIMIT 1`
          return rows[0] ?? null
        },
        async countReserved(now) {
          const rows = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM nova_browser_session WHERE "organizationId" = ${organizationId} AND status <> 'ended' AND "quotaUntil" > ${now}`
          return Number(rows[0]?.count ?? 0)
        },
        async create(row) {
          if (row.organizationId !== organizationId || row.userId !== scope.userId || row.agentSessionId !== scope.sessionId) throw new BrowserError("Browser scope invalid", 403)
          const rows = await tx.$queryRaw<BrowserRow[]>`INSERT INTO nova_browser_session (id, "organizationId", "userId", "agentSessionId", "status", "control", "controlVersion", "expiresAt", "quotaUntil", "updatedAt") VALUES (${row.id}, ${organizationId}, ${scope.userId}, ${scope.sessionId}, 'provisioning', 'user', 0, ${row.expiresAt}, ${row.quotaUntil}, NOW()) RETURNING *`
          return rows[0]
        },
        async update(id, patch) {
          const current = await get(id)
          if (!current) throw new BrowserError("Browser session not found", 404)
          const next = { ...current, ...patch }
          const rows = await tx.$queryRaw<BrowserRow[]>`UPDATE nova_browser_session SET "providerSessionId" = ${next.providerSessionId}, status = ${next.status}, control = ${next.control}, "controlVersion" = ${next.controlVersion}, "expiresAt" = ${next.expiresAt}, "leaseToken" = ${next.leaseToken}, "leaseUntil" = ${next.leaseUntil}, screenshot = ${next.screenshot ? Buffer.from(next.screenshot) : null}, "screenshotVersion" = ${next.screenshotVersion}, "screenshotExpiresAt" = ${next.screenshotExpiresAt}, "updatedAt" = NOW() WHERE id = ${id} AND "organizationId" = ${organizationId} AND "userId" = ${scope.userId} AND "agentSessionId" = ${scope.sessionId} RETURNING *`
          return rows[0]
        },
      }, organizationId)
    }, { timeout: 12_000, maxWait: 10_000 })
  },
}
