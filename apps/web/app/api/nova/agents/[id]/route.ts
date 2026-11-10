import { NextResponse } from "next/server"

import { agentBody, agentFailure, agentUser } from "@/modules/nova/agents/http"
import { deleteAgent, getAgent, updateAgent } from "@/modules/nova/agents/service"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    return NextResponse.json({ agent: await updateAgent(await agentUser(), id, await agentBody(request)) })
  } catch (error) {
    return agentFailure(error)
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    await deleteAgent(await agentUser(), id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return agentFailure(error)
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    return NextResponse.json({ agent: await getAgent(await agentUser(), id) })
  } catch (error) {
    return agentFailure(error)
  }
}
