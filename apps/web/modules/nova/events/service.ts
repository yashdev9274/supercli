import prisma from "@super/db"
import {
  normalizedInboundEventSchema,
  type NormalizedInboundEvent,
} from "@super/nova"

import { inngest } from "@/inngest/client"
import { publishRunOutboxForInbound } from "@/modules/nova/runs/service"

function surfaceKey(event: NormalizedInboundEvent): string {
  const installation = event.installationId ?? "none"
  return `${event.organizationId}:${event.provider}:${installation}:${event.surface!.externalSurfaceId}`
}

async function enqueueInboundEvent(inboundEventId: string): Promise<void> {
  await inngest.send({
    name: "nova/inbound.received",
    data: { inboundEventId },
  })
}

async function createSurfaceSession(event: NormalizedInboundEvent) {
  if (!event.surface) return null

  const key = surfaceKey(event)
  const existing = await prisma.sessionSurface.findUnique({
    where: { surfaceKey: key },
  })
  if (existing) return existing

  try {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.agentSession.create({
        data: {
          organizationId: event.organizationId,
          objective: `Nova conversation from ${event.provider}`,
          mode: "chat",
          nextSequence: 2,
        },
      })
      const surface = await tx.sessionSurface.create({
        data: {
          agentSessionId: session.id,
          installationId: event.installationId,
          provider: event.provider,
          surfaceKey: key,
          externalSurfaceId: event.surface!.externalSurfaceId,
          externalContainerId: event.surface!.externalContainerId,
          status: "active",
          lastInboundAt: new Date(event.occurredAt),
        },
      })
      await tx.agentActivity.create({
        data: {
          agentSessionId: session.id,
          surfaceId: surface.id,
          sequence: 1,
          type: "acknowledgement",
          status: "created",
          title: `${event.provider} conversation connected`,
        },
      })
      return surface
    })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return prisma.sessionSurface.findUniqueOrThrow({ where: { surfaceKey: key } })
    }
    throw error
  }
}

export async function ingestNormalizedEvent(input: unknown): Promise<{
  id: string
  duplicate: boolean
}> {
  const event = normalizedInboundEventSchema.parse(input)
  const installation = event.installationId
    ? await prisma.externalInstallation.findFirst({
        where: {
          id: event.installationId,
          organizationId: event.organizationId,
          provider: event.provider,
          status: { not: "revoked" },
        },
        select: { id: true },
      })
    : null
  if (event.installationId && !installation) {
    throw new Error("Nova installation does not belong to this organization")
  }

  const existing = await prisma.inboundEvent.findUnique({
    where: {
      provider_providerDeliveryId: {
        provider: event.provider,
        providerDeliveryId: event.providerDeliveryId,
      },
    },
    select: { id: true },
  })
  if (existing) {
    await enqueueInboundEvent(existing.id)
    return { id: existing.id, duplicate: true }
  }

  const surface = await createSurfaceSession(event)
  let created: { id: string }
  try {
    created = await prisma.inboundEvent.create({
      data: {
        organizationId: event.organizationId,
        installationId: event.installationId,
        agentSessionId: surface?.agentSessionId,
        surfaceId: surface?.id,
        provider: event.provider,
        providerDeliveryId: event.providerDeliveryId,
        eventType: event.eventType,
        actorExternalId: event.actorExternalId,
        payload: JSON.parse(JSON.stringify(event.payload)),
        payloadVersion: event.contractVersion,
        verificationState: "verified",
        status: "pending",
        receivedAt: new Date(event.occurredAt),
      },
      select: { id: true },
    })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const duplicate = await prisma.inboundEvent.findUniqueOrThrow({
        where: {
          provider_providerDeliveryId: {
            provider: event.provider,
            providerDeliveryId: event.providerDeliveryId,
          },
        },
        select: { id: true },
      })
      await enqueueInboundEvent(duplicate.id)
      return { id: duplicate.id, duplicate: true }
    }
    throw error
  }

  await enqueueInboundEvent(created.id)
  return { id: created.id, duplicate: false }
}

export async function appendInboundMessage(inboundEventId: string): Promise<{
  status: "completed" | "ignored"
  messageId?: string
}> {
  const result: {
    status: "completed" | "ignored"
    messageId?: string
  } = await prisma.$transaction(async (tx) => {
    const event = await tx.inboundEvent.findUnique({ where: { id: inboundEventId } })
    if (!event) throw new Error("Inbound event not found")
    if (event.status === "completed" || event.status === "ignored") {
      return { status: event.status as "completed" | "ignored" }
    }
    if (event.verificationState !== "verified") {
      throw new Error("Inbound event is not verified")
    }
    if (!event.agentSessionId || !event.surfaceId) {
      await tx.inboundEvent.update({
        where: { id: event.id },
        data: { status: "ignored", processedAt: new Date(), error: "No conversational surface" },
      })
      return { status: "ignored" }
    }

    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown>
      : {}
    const text = typeof payload.text === "string"
      ? payload.text.trim()
      : typeof payload.body === "string"
        ? payload.body.trim()
        : ""
    if (!text) {
      await tx.inboundEvent.update({
        where: { id: event.id },
        data: { status: "ignored", processedAt: new Date(), error: "No message text" },
      })
      return { status: "ignored" }
    }

    const claimed = await tx.inboundEvent.updateMany({
      where: { id: event.id, status: { in: ["pending", "failed"] } },
      data: { status: "processing", attempts: { increment: 1 }, error: null },
    })
    if (claimed.count === 0) return { status: "completed" }

    const updatedSession = await tx.agentSession.update({
      where: { id: event.agentSessionId },
      data: { nextSequence: { increment: 1 } },
      select: { nextSequence: true },
    })
    const message = await tx.agentSessionMessage.create({
      data: {
        agentSessionId: event.agentSessionId,
        surfaceId: event.surfaceId,
        sequence: updatedSession.nextSequence - 1,
        role: "user",
        content: text,
        senderType: "external_user",
        senderId: event.actorExternalId,
        originEventId: event.id,
        externalId: typeof payload.externalId === "string" ? payload.externalId : null,
        metadata: { provider: event.provider, eventType: event.eventType },
      },
      select: { id: true },
    })
    await tx.sessionSurface.update({
      where: { id: event.surfaceId },
      data: { lastInboundAt: event.receivedAt },
    })
    await tx.inboundEvent.update({
      where: { id: event.id },
      data: { status: "completed", processedAt: new Date(), error: null },
    })
    await tx.novaOutboxEvent.create({
      data: {
        organizationId: event.organizationId,
        agentSessionId: event.agentSessionId,
        topic: "nova.run.requested",
        idempotencyKey: `inbound:${event.id}:run`,
        payload: { inboundEventId: event.id, messageId: message.id },
      },
    })
    return { status: "completed", messageId: message.id }
  })

  if (result.status === "completed") {
    await publishRunOutboxForInbound(inboundEventId)
  }
  return result
}

export async function markInboundEventFailed(inboundEventId: string, error: unknown): Promise<void> {
  await prisma.inboundEvent.updateMany({
    where: { id: inboundEventId, status: { notIn: ["completed", "ignored"] } },
    data: {
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 4_000) : String(error).slice(0, 4_000),
    },
  })
}
