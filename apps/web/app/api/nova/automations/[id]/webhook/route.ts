import prisma from "@super/db"
import { NextResponse } from "next/server"

import { automationBody, automationFailure } from "@/modules/nova/automations/http"
import { automationInputSchema } from "@/modules/nova/automations/contracts"
import { queueAutomation } from "@/modules/nova/automations/runner"
import { verifyWebhookToken } from "@/modules/nova/automations/security"

export const runtime = "nodejs"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const automation = await prisma.novaAutomation.findUnique({ where: { id } })
    if (!automation || !verifyWebhookToken(request.headers.get("authorization"), automation.webhookTokenHash)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (automation.status !== "active" || !automationInputSchema.parse({ ...automation, postAsRunAs: false }).triggers.some((trigger) => trigger.type === "webhook")) return NextResponse.json({ error: "Webhook is disabled" }, { status: 409 })
    const deliveryId = request.headers.get("x-delivery-id")
    if (!deliveryId || !/^[A-Za-z0-9._:-]{1,200}$/.test(deliveryId)) return NextResponse.json({ error: "A unique X-Delivery-Id header is required" }, { status: 400 })
    const payload = await automationBody(request)
    const text = JSON.stringify(payload)
    if (text.length > 24_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    const run = await queueAutomation(id, { organizationId: automation.organizationId, type: "webhook", deliveryId: `webhook:${deliveryId}`, text })
    return NextResponse.json({ accepted: true, runId: run?.id }, { status: 202 })
  } catch (error) { return automationFailure(error) }
}
