import Supermemory from "supermemory"

import prisma from "@super/db"

const namespaceFor = (userId: string, agentId: string) => `user:${userId}:agent:${agentId}`

function client() {
  const apiKey = process.env.SUPERMEMORY_API_KEY
  if (!apiKey) throw new Error("SUPERMEMORY_API_KEY is not configured")
  return new Supermemory({ apiKey })
}

async function ownedAgent(userId: string, agentId: string) {
  const agent = await prisma.novaAgent.findFirst({
    where: { id: agentId, ownerUserId: userId, status: "active" },
    select: { id: true, organizationId: true },
  })
  if (!agent) throw new Error("Agent not found")
  return agent
}

export type AgentMemoryType =
  | "conversation"
  | "preference"
  | "instruction"
  | "project"
  | "repository"
  | "decision"
  | "task-result"
  | "error-pattern"

export async function searchAgentMemory(input: {
  userId: string
  agentId: string
  query: string
  limit?: number
}) {
  await ownedAgent(input.userId, input.agentId)
  if (!input.query.trim()) return []

  const result = await client().search(namespaceFor(input.userId, input.agentId), {
    query: input.query.trim(),
    limit: Math.min(input.limit ?? 5, 10),
    searchMode: "hybrid",
  })

  return result.results
    .map((item) => item.memory ?? item.chunk ?? "")
    .filter(Boolean)
}

export async function rememberAgentMemory(input: {
  userId: string
  agentId: string
  content: string
  memoryType: AgentMemoryType
  source: string
  sessionId?: string
  taskId?: string
}) {
  const agent = await ownedAgent(input.userId, input.agentId)
  const link = await prisma.novaAgentMemoryLink.create({
    data: {
      organizationId: agent.organizationId,
      ownerUserId: input.userId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      memoryType: input.memoryType,
      source: input.source,
      status: "queued",
    },
  })

  try {
    const document = await client().add(namespaceFor(input.userId, input.agentId), {
      content: input.content.trim(),
      metadata: {
        userId: input.userId,
        agentId: input.agentId,
        sessionId: input.sessionId ?? "",
        taskId: input.taskId ?? "",
        memoryType: input.memoryType,
        source: input.source,
      },
    })
    await prisma.novaAgentMemoryLink.update({
      where: { id: link.id },
      data: { supermemoryDocumentId: document.id, status: "indexed" },
    })
    return document.id
  } catch (error) {
    await prisma.novaAgentMemoryLink.update({ where: { id: link.id }, data: { status: "failed" } }).catch(() => undefined)
    throw error
  }
}

export { namespaceFor }
