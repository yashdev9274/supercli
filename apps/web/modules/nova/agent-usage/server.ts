import "server-only"

import prisma from "@super/db"

import { codexContextForRequest } from "../codex/server"
import { agentUsageSnapshot, codingProviderLabels } from "./service"

export async function agentUsageForRequest(request: Request) {
  const context = await codexContextForRequest(request)
  const connectedProviders = await prisma.novaProviderCredential.findMany({
    where: {
      membershipId: context.owner.membershipId,
      membership: { userId: context.owner.userId, organizationId: context.owner.organizationId, status: "active" },
      provider: { in: Object.keys(codingProviderLabels) },
      status: "connected",
      enabled: true,
    },
    select: { provider: true },
  })
  return agentUsageSnapshot(context, connectedProviders, fetch, request.signal)
}
