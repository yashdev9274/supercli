import { NextResponse } from "next/server"

import { automationBody, automationFailure, automationUser } from "@/modules/nova/automations/http"
import { getAutomationContext, listAutomations, saveAutomation } from "@/modules/nova/automations/service"

export async function GET() {
  try {
    const userId = await automationUser()
    const [automations, context] = await Promise.all([listAutomations(userId), getAutomationContext(userId)])
    return NextResponse.json({ automations, context })
  } catch (error) { return automationFailure(error) }
}

export async function POST(request: Request) {
  try {
    const userId = await automationUser()
    return NextResponse.json({ automation: await saveAutomation(userId, await automationBody(request)) }, { status: 201 })
  } catch (error) { return automationFailure(error) }
}
