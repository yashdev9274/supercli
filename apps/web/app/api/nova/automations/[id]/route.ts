import { NextResponse } from "next/server"

import { automationBody, automationFailure, automationUser } from "@/modules/nova/automations/http"
import { deleteAutomation, getAutomation, saveAutomation } from "@/modules/nova/automations/service"

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Context) {
  try { return NextResponse.json({ automation: (await getAutomation(await automationUser(), (await context.params).id)).dto }) } catch (error) { return automationFailure(error) }
}

export async function PUT(request: Request, context: Context) {
  try {
    const userId = await automationUser()
    return NextResponse.json({ automation: await saveAutomation(userId, await automationBody(request), (await context.params).id) })
  } catch (error) { return automationFailure(error) }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    await deleteAutomation(await automationUser(), (await context.params).id)
    return NextResponse.json({ ok: true })
  } catch (error) { return automationFailure(error) }
}
