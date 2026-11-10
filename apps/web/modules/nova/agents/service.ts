import prisma from "@super/db"

import { ensureUserOrganization } from "@/modules/integrations/lib/org"

import { agentInputSchema, type AgentDto } from "./contracts"

export function agentError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode })
}

async function agentMembership(userId: string) {
  const organizationId = await ensureUserOrganization(userId)
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  })
  if (!membership || membership.status !== "active") {
    throw agentError("Active organization membership required", 403)
  }
  return { organizationId, membership }
}

function serializeAgent(agent: {
  id: string
  ownerUserId: string
  name: string
  description: string | null
  instructions: string
  provider: string | null
  model: string | null
  status: string
  createdAt: Date
  updatedAt: Date
  archivedAt: Date | null
}): AgentDto {
  return {
    id: agent.id,
    ownerUserId: agent.ownerUserId,
    name: agent.name,
    description: agent.description ?? "",
    instructions: agent.instructions,
    provider: agent.provider ?? "",
    model: agent.model ?? "",
    status: agent.status,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    archivedAt: agent.archivedAt?.toISOString() ?? null,
  }
}

const agentSelect = {
  id: true,
  ownerUserId: true,
  name: true,
  description: true,
  instructions: true,
  provider: true,
  model: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} as const

export async function listAgents(userId: string): Promise<AgentDto[]> {
  const { organizationId } = await agentMembership(userId)
  const agents = await prisma.novaAgent.findMany({
    where: { organizationId, ownerUserId: userId, status: { not: "archived" } },
    select: agentSelect,
    orderBy: { updatedAt: "desc" },
    take: 100,
  })
  return agents.map(serializeAgent)
}

export async function getAgent(userId: string, id: string): Promise<AgentDto> {
  const { organizationId } = await agentMembership(userId)
  const agent = await prisma.novaAgent.findFirst({ where: { id, organizationId, ownerUserId: userId }, select: agentSelect })
  if (!agent) throw agentError("Agent not found", 404)
  return serializeAgent(agent)
}

export async function createAgent(userId: string, raw: unknown): Promise<AgentDto> {
  const input = agentInputSchema.parse(raw)
  const { organizationId } = await agentMembership(userId)
  const agent = await prisma.novaAgent.create({
    data: {
      organizationId,
      ownerUserId: userId,
      ...input,
      description: input.description || null,
      provider: input.provider || null,
      model: input.model || null,
    },
    select: agentSelect,
  })
  return serializeAgent(agent)
}
