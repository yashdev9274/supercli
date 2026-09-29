import prisma from "@super/db"
import { NextResponse } from "next/server"

import { ingestNormalizedEvent } from "@/modules/nova/events/service"
import { normalizeGitHubEvent, parseGitHubEnvelope } from "@/modules/nova/providers/github"
import { verifyGitHubSignature } from "@/modules/nova/providers/signatures"

export const runtime = "nodejs"

async function processGitHubEvent(input: {
  eventName: string
  deliveryId: string
  envelope: NonNullable<ReturnType<typeof parseGitHubEnvelope>>
}): Promise<void> {
  const providerInstallationId = input.envelope.installation?.id
  if (!providerInstallationId) return
  const installation = await prisma.externalInstallation.findFirst({
    where: {
      provider: "github",
      status: { not: "revoked" },
      config: { path: ["installationId"], equals: providerInstallationId },
    },
    select: { id: true, organizationId: true, botExternalUserId: true },
  })
  if (!installation) return
  const appSlug = process.env.NOVA_GITHUB_APP_SLUG?.trim()
  if (!appSlug) throw new Error("NOVA_GITHUB_APP_SLUG is not configured")
  const event = normalizeGitHubEvent({
    ...input,
    installationId: installation.id,
    organizationId: installation.organizationId,
    botExternalUserId: installation.botExternalUserId,
    appSlug,
  })
  if (!event) return
  await ingestNormalizedEvent(event)
  await prisma.externalInstallation.update({
    where: { id: installation.id },
    data: { webhookStatus: "healthy", lastEventAt: new Date(), lastHealthCheckAt: new Date() },
  })
}

export async function POST(request: Request) {
  const secret = process.env.NOVA_GITHUB_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "GitHub webhook is not configured" }, { status: 503 })
  const rawBody = await request.text()
  if (!verifyGitHubSignature({
    rawBody,
    signature: request.headers.get("x-hub-signature-256"),
    secret,
  })) {
    return NextResponse.json({ error: "Invalid GitHub signature" }, { status: 401 })
  }
  const eventName = request.headers.get("x-github-event")
  const deliveryId = request.headers.get("x-github-delivery")
  if (!eventName || !deliveryId) {
    return NextResponse.json({ error: "Missing GitHub event headers" }, { status: 400 })
  }

  let envelope: ReturnType<typeof parseGitHubEnvelope>
  try {
    envelope = parseGitHubEnvelope(JSON.parse(rawBody))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!envelope) return NextResponse.json({ error: "Invalid GitHub event" }, { status: 400 })
  if (eventName === "ping") return NextResponse.json({ ok: true })

  await processGitHubEvent({ eventName, deliveryId, envelope })
  return NextResponse.json({ ok: true })
}
