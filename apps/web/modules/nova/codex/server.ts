import "server-only"

import { auth } from "@super/auth/server"
import prisma from "@super/db"

import { createCodexProvider, CodexError } from "./provider"
import { createCodexService, type CodexOwner } from "./service"
import { createPrismaCodexStore } from "@super/codex-runtime/store"
import { configuredCodexVault } from "./vault"

export async function codexContextForRequest(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user?.id || !session.session.id) throw new CodexError("Sign in to Nova to connect Codex", 401)
  return codexContextForUser(session.user.id, session.session.id)
}

export async function codexContextForUser(userId: string, sessionId: string) {
  // Do not call ensureUserOrganization: it reactivates suspended memberships.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } })
  if (!user?.organizationId) throw new CodexError("Set up your Nova organization before connecting Codex", 403)
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: user.organizationId, userId } },
    select: { id: true, status: true },
  })
  if (!membership || membership.status !== "active") throw new CodexError("Active organization membership required", 403)
  const owner: CodexOwner = {
    userId, organizationId: user.organizationId,
    membershipId: membership.id, sessionId,
  }
  const store = await createPrismaCodexStore(owner)
  return { owner, store, provider: createCodexProvider(), vault: configuredCodexVault }
}

export async function codexServiceForRequest(request: Request) {
  return createCodexService(await codexContextForRequest(request))
}
