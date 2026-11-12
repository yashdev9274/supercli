import { NextResponse } from "next/server"

import { agentFailure, agentUser } from "@/modules/nova/agents/http"
import { forgetAgentMemory } from "@/modules/nova/agent-memory/service"

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; memoryId: string }> }) {
  try {
    const { id, memoryId } = await context.params
    await forgetAgentMemory({ userId: await agentUser(), agentId: id, documentId: decodeURIComponent(memoryId) })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return agentFailure(error)
  }
}
