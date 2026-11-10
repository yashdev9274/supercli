import { NextResponse } from "next/server"

import { agentFailure, agentUser } from "@/modules/nova/agents/http"
import { getAgent } from "@/modules/nova/agents/service"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    return NextResponse.json({ agent: await getAgent(await agentUser(), id) })
  } catch (error) {
    return agentFailure(error)
  }
}
