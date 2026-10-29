import "server-only"

import { auth } from "@super/auth/server"
import prisma from "@super/db"

import { createCodexProvider, CodexError } from "./provider"
import { createCodexService, type CodexOwner, type CodexStore } from "./service"
import { configuredCodexVault } from "./vault"

const emptyConnection = (membershipId: string) => ({
  membershipId, state: "disconnected", version: 0, attemptId: null, sessionHash: null,
  encryptedAttempt: null, encryptedCredentials: null, intervalSeconds: 5,
  expiresAt: null, nextPollAt: null, lastStartedAt: null, connectedAt: null,
})

export async function codexContextForRequest(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user?.id || !session.session.id) throw new CodexError("Sign in to Nova to connect Codex", 401)
  // Do not call ensureUserOrganization: it reactivates suspended memberships.
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { organizationId: true } })
  if (!user?.organizationId) throw new CodexError("Set up your Nova organization before connecting Codex", 403)
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: user.organizationId, userId: session.user.id } },
    select: { id: true, status: true },
  })
  if (!membership || membership.status !== "active") throw new CodexError("Active organization membership required", 403)
  const owner: CodexOwner = {
    userId: session.user.id, organizationId: user.organizationId,
    membershipId: membership.id, sessionId: session.session.id,
  }
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
  return { owner, store, provider: createCodexProvider(), vault: configuredCodexVault }
}

export async function codexServiceForRequest(request: Request) {
  return createCodexService(await codexContextForRequest(request))
}
