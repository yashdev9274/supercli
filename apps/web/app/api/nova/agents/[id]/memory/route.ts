import { NextResponse } from "next/server"

import { agentFailure, agentUser } from "@/modules/nova/agents/http"
import { rememberAgentMemory, searchAgentMemory } from "@/modules/nova/agent-memory/service"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const query = new URL(request.url).searchParams.get("q") ?? ""
    return NextResponse.json({ memories: await searchAgentMemory({ userId: await agentUser(), agentId: id, query }) })
  } catch (error) {
    return agentFailure(error)
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = (await request.json()) as { content?: string; memoryType?: string; source?: string; sessionId?: string; taskId?: string }
    if (!body.content?.trim()) return NextResponse.json({ error: "content is required" }, { status: 400 })
    const memoryType = body.memoryType ?? "conversation"
    const allowed = new Set(["conversation", "preference", "instruction", "project", "repository", "decision", "task-result", "error-pattern"])
    if (!allowed.has(memoryType)) return NextResponse.json({ error: "invalid memoryType" }, { status: 400 })
    const documentId = await rememberAgentMemory({ userId: await agentUser(), agentId: id, content: body.content, memoryType: memoryType as never, source: body.source ?? "user", sessionId: body.sessionId, taskId: body.taskId })
    return NextResponse.json({ documentId }, { status: 201 })
  } catch (error) {
    return agentFailure(error)
  }
}
