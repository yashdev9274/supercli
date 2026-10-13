import { NextResponse } from "next/server"
import { z } from "zod"

import { automationBody, automationFailure, automationUser } from "@/modules/nova/automations/http"
import { requestAutomationTest } from "@/modules/nova/automations/runner"

const schema = z.object({ text: z.string().trim().min(1).max(24_000), deliveryId: z.string().uuid() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await automationUser()
    const input = schema.parse(await automationBody(request))
    return NextResponse.json({ run: await requestAutomationTest(userId, (await context.params).id, input.text, input.deliveryId) }, { status: 202 })
  } catch (error) { return automationFailure(error) }
}
