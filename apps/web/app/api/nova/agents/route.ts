import { NextResponse } from "next/server"

import { agentBody, agentFailure, agentUser } from "@/modules/nova/agents/http"
import { createAgent, listAgents } from "@/modules/nova/agents/service"

export async function GET() {
  try {
    return NextResponse.json({ agents: await listAgents(await agentUser()) })
  } catch (error) {
    return agentFailure(error)
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json({ agent: await createAgent(await agentUser(), await agentBody(request)) }, { status: 201 })
  } catch (error) {
    return agentFailure(error)
  }
}
