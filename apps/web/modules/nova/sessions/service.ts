import prisma from "@super/db"
import {
  NOVA_CONTRACT_VERSION,
  type AgentSessionSummary,
  type SyncCursor,
} from "@super/nova"

import { ensureUserOrganization } from "@/modules/integrations/lib/org"

const DEFAULT_SYNC_LIMIT = 100
const MAX_SYNC_LIMIT = 500

function serializeSurface(surface: {
  id: string
  provider: string
  externalSurfaceId: string
  externalContainerId: string | null
  externalUrl: string | null
  status: string
}) {
  return {
    id: surface.id,
    provider: surface.provider as "desktop" | "web" | "slack" | "linear" | "github",
    externalSurfaceId: surface.externalSurfaceId,
    externalContainerId: surface.externalContainerId,
    externalUrl: surface.externalUrl,
    status: surface.status as "active" | "muted" | "archived",
  }
}

function serializeSession(session: {
  id: string
  objective: string
  mode: string
  status: string
  activeRunId: string | null
  nextSequence: number
  updatedAt: Date
  surfaces: Array<{
    id: string
    provider: string
    externalSurfaceId: string
    externalContainerId: string | null
    externalUrl: string | null
    status: string
  }>
}): AgentSessionSummary {
  return {
    contractVersion: NOVA_CONTRACT_VERSION,
    id: session.id,
    objective: session.objective,
    mode: session.mode,
    status: session.status as AgentSessionSummary["status"],
    activeRunId: session.activeRunId,
    latestSequence: Math.max(0, session.nextSequence - 1),
    surfaces: session.surfaces.map(serializeSurface),
    updatedAt: session.updatedAt.toISOString(),
  }
}

async function membershipForUser(userId: string, organizationId: string) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  })
  if (!membership || membership.status !== "active") {
    throw new Error("Active organization membership required")
  }
  return membership
}

export async function listAgentSessions(userId: string): Promise<AgentSessionSummary[]> {
  const organizationId = await ensureUserOrganization(userId)
  await membershipForUser(userId, organizationId)
  const sessions = await prisma.agentSession.findMany({
    where: { organizationId },
    include: { surfaces: { where: { status: { not: "archived" } } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  })
  return sessions.map(serializeSession)
}

export async function getAgentSession(userId: string, sessionId: string) {
  const organizationId = await ensureUserOrganization(userId)
  await membershipForUser(userId, organizationId)
  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, organizationId },
    include: {
      surfaces: true,
      runs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  })
  if (!session) return null
  return {
    ...serializeSession(session),
    runs: session.runs.map((run) => ({
      id: run.id,
      status: run.status,
      executionTarget: run.executionTarget,
      desktopDeviceId: run.desktopDeviceId,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    })),
  }
}

export async function createAgentSession(input: {
  userId: string
  objective: string
  mode?: string
}): Promise<AgentSessionSummary> {
  const organizationId = await ensureUserOrganization(input.userId)
  const membership = await membershipForUser(input.userId, organizationId)
  const objective = input.objective.trim()
  if (!objective) throw new Error("Session objective is required")

  return prisma.$transaction(async (tx) => {
    const session = await tx.agentSession.create({
      data: {
        organizationId,
        initiatorMembershipId: membership.id,
        objective,
        mode: input.mode?.trim() || "chat",
        nextSequence: 2,
      },
    })
    const surface = await tx.sessionSurface.create({
      data: {
        agentSessionId: session.id,
        provider: "desktop",
        surfaceKey: `${organizationId}:desktop:${session.id}`,
        externalSurfaceId: session.id,
        status: "active",
      },
    })
    await tx.agentActivity.create({
      data: {
        agentSessionId: session.id,
        surfaceId: surface.id,
        sequence: 1,
        type: "acknowledgement",
        status: "created",
        title: "Nova session created",
        body: objective,
      },
    })
    await tx.novaAuditEvent.create({
      data: {
        organizationId,
        agentSessionId: session.id,
        actorType: "membership",
        actorId: membership.id,
        action: "nova.session.create",
        resourceType: "agent_session",
        resourceId: session.id,
        decision: "allowed",
      },
    })
    const complete = await tx.agentSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { surfaces: true },
    })
    return serializeSession(complete)
  })
}

export async function syncAgentSession(input: {
  userId: string
  sessionId: string
  afterSequence: number
  limit?: number
}): Promise<SyncCursor | null> {
  const organizationId = await ensureUserOrganization(input.userId)
  await membershipForUser(input.userId, organizationId)
  const session = await prisma.agentSession.findFirst({
    where: { id: input.sessionId, organizationId },
    select: { id: true, nextSequence: true },
  })
  if (!session) return null

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_SYNC_LIMIT, 1), MAX_SYNC_LIMIT)
  const [messages, activities] = await Promise.all([
    prisma.agentSessionMessage.findMany({
      where: { agentSessionId: session.id, sequence: { gt: input.afterSequence } },
      orderBy: { sequence: "asc" },
      take: limit + 1,
    }),
    prisma.agentActivity.findMany({
      where: { agentSessionId: session.id, sequence: { gt: input.afterSequence } },
      orderBy: { sequence: "asc" },
      take: limit + 1,
    }),
  ])
  const selected = [
    ...messages.map((value) => ({ kind: "message" as const, sequence: value.sequence, value })),
    ...activities.map((value) => ({ kind: "activity" as const, sequence: value.sequence, value })),
  ].sort((a, b) => a.sequence - b.sequence).slice(0, limit)
  const selectedSequences = new Set(selected.map((item) => item.sequence))
  const nextSequence = selected.at(-1)?.sequence ?? input.afterSequence
  const availableLatest = Math.max(0, session.nextSequence - 1)

  return {
    contractVersion: NOVA_CONTRACT_VERSION,
    sessionId: session.id,
    afterSequence: input.afterSequence,
    messages: messages.filter((message) => selectedSequences.has(message.sequence)).map((message) => ({
      id: message.id,
      sessionId: message.agentSessionId,
      surfaceId: message.surfaceId,
      sequence: message.sequence,
      role: message.role as "user" | "assistant" | "system" | "tool",
      content: message.content,
      senderType: message.senderType as "member" | "external_user" | "nova" | "system" | null,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
    })),
    activities: activities.filter((activity) => selectedSequences.has(activity.sequence)).map((activity) => ({
      id: activity.id,
      sessionId: activity.agentSessionId,
      runId: activity.runId,
      sequence: activity.sequence,
      type: activity.type as "acknowledgement" | "plan" | "action" | "approval_request" | "response" | "error" | "result",
      status: activity.status,
      title: activity.title,
      body: activity.body,
      data: activity.data && typeof activity.data === "object" && !Array.isArray(activity.data)
        ? activity.data as Record<string, unknown>
        : null,
      createdAt: activity.createdAt.toISOString(),
    })),
    nextSequence,
    hasMore: nextSequence < availableLatest,
  }
}
