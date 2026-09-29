import prisma from "@super/db"
import { NextResponse } from "next/server"

import { ingestNormalizedEvent } from "@/modules/nova/events/service"
import { normalizeSlackEvent, parseSlackEnvelope } from "@/modules/nova/providers/slack"
import { verifySlackSignature } from "@/modules/nova/providers/signatures"

export const runtime = "nodejs"

async function processSlackEvent(envelope: NonNullable<ReturnType<typeof parseSlackEnvelope>>): Promise<void> {
  const externalAccountId = envelope.enterprise_id ?? envelope.team_id
  if (!externalAccountId) return
  const installation = await prisma.externalInstallation.findFirst({
    where: { provider: "slack", externalAccountId, status: { not: "revoked" } },
    select: { id: true, organizationId: true, botExternalUserId: true },
  })
  if (!installation) return
  const event = normalizeSlackEvent({ envelope, ...installation, installationId: installation.id })
  if (!event) return
  await ingestNormalizedEvent(event)
  await prisma.externalInstallation.update({
    where: { id: installation.id },
    data: { webhookStatus: "healthy", lastEventAt: new Date(), lastHealthCheckAt: new Date() },
  })
}

export async function POST(request: Request) {
  const signingSecret = process.env.NOVA_SLACK_SIGNING_SECRET
  if (!signingSecret) return NextResponse.json({ error: "Slack webhook is not configured" }, { status: 503 })
  const rawBody = await request.text()
  const verified = verifySlackSignature({
    rawBody,
    signature: request.headers.get("x-slack-signature"),
    timestamp: request.headers.get("x-slack-request-timestamp"),
    secret: signingSecret,
  })
  if (!verified) return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 })

  let envelope: ReturnType<typeof parseSlackEnvelope>
  try {
    envelope = parseSlackEnvelope(JSON.parse(rawBody))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!envelope) return NextResponse.json({ error: "Invalid Slack event" }, { status: 400 })
  if (envelope.type === "url_verification") {
    if (!envelope.challenge) return NextResponse.json({ error: "Missing challenge" }, { status: 400 })
    return NextResponse.json({ challenge: envelope.challenge })
  }

  await processSlackEvent(envelope)
  return NextResponse.json({ ok: true })
}
