import prisma from "@super/db"

import { ensureUserOrganization } from "@/modules/integrations/lib/org"

import { agentInputSchema, agentUpdateSchema, type AgentDto } from "./contracts"

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

export async function updateAgent(userId: string, id: string, raw: unknown): Promise<AgentDto> {
  const input = agentUpdateSchema.parse(raw)
  const { organizationId } = await agentMembership(userId)
  const existing = await prisma.novaAgent.findFirst({ where: { id, organizationId, ownerUserId: userId }, select: { id: true } })
  if (!existing) throw agentError("Agent not found", 404)
  const agent = await prisma.novaAgent.update({
    where: { id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description || null }),
      ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
      ...(input.provider === undefined ? {} : { provider: input.provider || null }),
      ...(input.model === undefined ? {} : { model: input.model || null }),
      ...(input.status === undefined ? {} : { status: input.status, archivedAt: input.status === "archived" ? new Date() : null }),
    },
    select: agentSelect,
  })
  return serializeAgent(agent)
}

export async function deleteAgent(userId: string, id: string): Promise<void> {
  const { organizationId } = await agentMembership(userId)
  const existing = await prisma.novaAgent.findFirst({ where: { id, organizationId, ownerUserId: userId }, select: { id: true } })
  if (!existing) throw agentError("Agent not found", 404)
  await prisma.novaAgent.delete({ where: { id } })
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
