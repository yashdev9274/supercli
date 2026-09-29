import prisma from "@super/db"
import { NextResponse } from "next/server"

import { ingestNormalizedEvent } from "@/modules/nova/events/service"
import { normalizeLinearEvent, parseLinearEnvelope } from "@/modules/nova/providers/linear"
import { verifyLinearSignature } from "@/modules/nova/providers/signatures"

export const runtime = "nodejs"

async function processLinearEvent(
  envelope: NonNullable<ReturnType<typeof parseLinearEnvelope>>,
  deliveryId: string,
): Promise<void> {
  if (!envelope.organizationId) return
  const installation = await prisma.externalInstallation.findFirst({
    where: {
      provider: "linear",
      externalAccountId: envelope.organizationId,
      status: { not: "revoked" },
    },
    select: { id: true, organizationId: true, botExternalUserId: true },
  })
  if (!installation) return
  const event = normalizeLinearEvent({
    envelope,
    deliveryId,
    ...installation,
    installationId: installation.id,
  })
  if (!event) return
  await ingestNormalizedEvent(event)
  await prisma.externalInstallation.update({
    where: { id: installation.id },
    data: { webhookStatus: "healthy", lastEventAt: new Date(), lastHealthCheckAt: new Date() },
  })
}

export async function POST(request: Request) {
  const signingSecret = process.env.NOVA_LINEAR_WEBHOOK_SECRET
  if (!signingSecret) return NextResponse.json({ error: "Linear webhook is not configured" }, { status: 503 })
  const rawBody = await request.text()
  const verified = verifyLinearSignature({
    rawBody,
    signature: request.headers.get("linear-signature"),
    timestamp: request.headers.get("linear-timestamp"),
    secret: signingSecret,
  })
  if (!verified) return NextResponse.json({ error: "Invalid Linear signature" }, { status: 401 })

  let envelope: ReturnType<typeof parseLinearEnvelope>
  try {
    envelope = parseLinearEnvelope(JSON.parse(rawBody))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!envelope) return NextResponse.json({ error: "Invalid Linear event" }, { status: 400 })
  const deliveryId = request.headers.get("linear-delivery")
    ?? `${envelope.type ?? "unknown"}:${envelope.action ?? "unknown"}:${envelope.createdAt ?? "unknown"}`

  await processLinearEvent(envelope, deliveryId)
  return NextResponse.json({ ok: true })
}
