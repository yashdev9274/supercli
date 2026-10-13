import { NextResponse } from "next/server"

import { automationFailure, automationUser } from "@/modules/nova/automations/http"
import { rotateAutomationWebhook } from "@/modules/nova/automations/service"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await rotateAutomationWebhook(await automationUser(), (await context.params).id), { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return automationFailure(error) }
}
