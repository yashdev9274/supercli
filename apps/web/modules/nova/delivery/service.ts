import prisma from "@super/db"

import { inngest } from "@/inngest/client"
import {
  postGitHubReplyViaComposio,
  postLinearReplyViaComposio,
  postSlackReplyViaComposio,
} from "@/modules/nova/providers/composio"

const DELIVERY_PROVIDERS = new Set(["slack", "linear", "github"])
const DELIVERY_LEASE_MS = 5 * 60 * 1000

async function publishDeliveryOutbox(outboxEventId: string, activityId: string): Promise<void> {
  try {
    await inngest.send({
      name: "nova/activity.delivery.requested",
      data: { activityId },
    })
    await prisma.novaOutboxEvent.update({
      where: { id: outboxEventId },
      data: {
        status: "completed",
        processedAt: new Date(),
        attempts: { increment: 1 },
        error: null,
      },
    })
  } catch (error) {
    await prisma.novaOutboxEvent.update({
      where: { id: outboxEventId },
      data: {
        status: "pending",
        attempts: { increment: 1 },
        error: error instanceof Error ? error.message.slice(0, 4_000) : String(error).slice(0, 4_000),
      },
    })
    throw error
  }
}

export async function reconcileActivityDeliveryOutbox(limit = 100): Promise<{
  published: number
  failed: number
}> {
  const events = await prisma.novaOutboxEvent.findMany({
    where: {
      topic: "nova.activity.delivery.requested",
      status: "pending",
      availableAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 500),
  })

  let published = 0
  let failed = 0
  for (const event of events) {
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown>
      : {}
    const activityId = typeof payload.activityId === "string" ? payload.activityId : null
    if (!activityId) {
      await prisma.novaOutboxEvent.update({
        where: { id: event.id },
        data: {
          status: "failed",
          processedAt: new Date(),
          error: "Delivery outbox payload is missing activityId",
        },
      })
      failed += 1
      continue
    }

    try {
      await publishDeliveryOutbox(event.id, activityId)
      published += 1
    } catch {
      failed += 1
    }
  }
  return { published, failed }
}

function deliveryText(activity: { title: string | null; body: string | null }): string | null {
  const body = activity.body?.trim()
  if (body) return body
  const title = activity.title?.trim()
  return title || null
}

async function markDeliveryFailed(deliveryAttemptId: string, error: unknown): Promise<void> {
  await prisma.deliveryAttempt.update({
    where: { id: deliveryAttemptId },
    data: {
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 4_000) : String(error).slice(0, 4_000),
      nextAttemptAt: null,
    },
  })
}

export async function createResponseActivity(input: {
  agentSessionId: string
  surfaceId: string
  runId?: string | null
  type?: "acknowledgement" | "plan" | "action" | "approval_request" | "response" | "error" | "result"
  title?: string | null
  body: string
  data?: Record<string, unknown> | null
}): Promise<{ id: string }> {
  const body = input.body.trim()
  if (!body) throw new Error("Nova response body is required")

  const created = await prisma.$transaction(async (tx) => {
    if (input.runId) {
      const existing = await tx.agentActivity.findFirst({
        where: {
          runId: input.runId,
          surfaceId: input.surfaceId,
          type: input.type ?? "response",
        },
        select: { id: true },
      })
      if (existing) {
        const outbox = await tx.novaOutboxEvent.upsert({
          where: { idempotencyKey: `activity:${existing.id}:delivery` },
          create: {
            organizationId: (await tx.agentSession.findUniqueOrThrow({
              where: { id: input.agentSessionId },
              select: { organizationId: true },
            })).organizationId,
            agentSessionId: input.agentSessionId,
            topic: "nova.activity.delivery.requested",
            idempotencyKey: `activity:${existing.id}:delivery`,
            payload: { activityId: existing.id },
          },
          update: {},
          select: { id: true, status: true },
        })
        return { activity: existing, outbox }
      }
    }

    const surface = await tx.sessionSurface.findFirst({
      where: {
        id: input.surfaceId,
        agentSessionId: input.agentSessionId,
        status: "active",
      },
      select: { id: true },
    })
    if (!surface) throw new Error("Nova response surface does not belong to the session")

    const session = await tx.agentSession.update({
      where: { id: input.agentSessionId },
      data: { nextSequence: { increment: 1 } },
      select: { nextSequence: true, organizationId: true },
    })
    const activity = await tx.agentActivity.create({
      data: {
        agentSessionId: input.agentSessionId,
        surfaceId: surface.id,
        runId: input.runId,
        sequence: session.nextSequence - 1,
        type: input.type ?? "response",
        status: "created",
        title: input.title,
        body,
        data: input.data ? JSON.parse(JSON.stringify(input.data)) : undefined,
      },
      select: { id: true },
    })
    const outbox = await tx.novaOutboxEvent.create({
      data: {
        organizationId: session.organizationId,
        agentSessionId: input.agentSessionId,
        topic: "nova.activity.delivery.requested",
        idempotencyKey: `activity:${activity.id}:delivery`,
        payload: { activityId: activity.id },
      },
      select: { id: true, status: true },
    })
    return { activity, outbox }
  })

  if (created.outbox.status !== "completed") {
    await publishDeliveryOutbox(created.outbox.id, created.activity.id)
  }
  return created.activity
}

export async function deliverActivity(activityId: string): Promise<{
  delivered: number
  ignored: number
}> {
  const activity = await prisma.agentActivity.findUnique({
    where: { id: activityId },
    include: {
      agentSession: { select: { organizationId: true } },
      surface: {
        include: { installation: true },
      },
    },
  })
  if (!activity) throw new Error("Nova activity not found")
  if (activity.type === "approval_request") return { delivered: 0, ignored: 1 }
  const text = deliveryText(activity)
  const surface = activity.surface
  const installation = surface?.installation
  if (!text || !surface || !installation || !DELIVERY_PROVIDERS.has(surface.provider)) {
    return { delivered: 0, ignored: 1 }
  }
  if (installation.status === "revoked") {
    throw new Error("Nova installation is revoked")
  }

  const idempotencyKey = `activity:${activity.id}:${surface.provider}:${surface.id}`
  const attempt = await prisma.deliveryAttempt.upsert({
    where: { idempotencyKey },
    create: {
      installationId: installation.id,
      activityId: activity.id,
      idempotencyKey,
      provider: surface.provider,
    },
    update: {},
  })
  if (attempt.status === "delivered") return { delivered: 0, ignored: 1 }

  const now = new Date()
  const claimed = await prisma.deliveryAttempt.updateMany({
    where: {
      id: attempt.id,
      OR: [
        { status: { in: ["pending", "failed"] } },
        { status: "processing", nextAttemptAt: { lte: now } },
      ],
    },
    data: {
      status: "processing",
      attempts: { increment: 1 },
      nextAttemptAt: new Date(now.getTime() + DELIVERY_LEASE_MS),
      error: null,
    },
  })
  if (claimed.count === 0) {
    throw new Error("Nova activity delivery is already in progress")
  }

  try {
    let externalId: string
    if (surface.provider === "slack") {
      const separator = surface.externalSurfaceId.indexOf(":")
      if (separator < 1) throw new Error("Slack surface is missing its thread identity")
      externalId = await postSlackReplyViaComposio({
        organizationId: activity.agentSession.organizationId,
        channelId: surface.externalSurfaceId.slice(0, separator),
        threadTimestamp: surface.externalSurfaceId.slice(separator + 1),
        text,
      })
    } else if (surface.provider === "linear") {
      if (!surface.externalContainerId) throw new Error("Linear surface is missing its issue identity")
      externalId = await postLinearReplyViaComposio({
        organizationId: activity.agentSession.organizationId,
        issueId: surface.externalContainerId,
        text,
      })
    } else {
      const separator = surface.externalSurfaceId.lastIndexOf("#")
      const issueNumber = Number(surface.externalSurfaceId.slice(separator + 1))
      if (separator < 1 || !Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
        throw new Error("GitHub surface is missing its issue identity")
      }
      externalId = await postGitHubReplyViaComposio({
        organizationId: activity.agentSession.organizationId,
        repository: surface.externalSurfaceId.slice(0, separator),
        issueNumber,
        text,
      })
    }

    await prisma.$transaction([
      prisma.deliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "delivered",
          externalId,
          deliveredAt: new Date(),
          error: null,
        },
      }),
      prisma.sessionSurface.update({
        where: { id: surface.id },
        data: { lastOutboundAt: new Date() },
      }),
      prisma.externalInstallation.update({
        where: { id: installation.id },
        data: {
          status: "active",
          webhookStatus: "healthy",
          lastHealthCheckAt: new Date(),
        },
      }),
    ])
    return { delivered: 1, ignored: 0 }
  } catch (error) {
    await markDeliveryFailed(attempt.id, error)
    throw error
  }
}
