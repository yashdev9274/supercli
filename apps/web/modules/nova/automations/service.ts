import prisma, { Prisma } from "@super/db"

import { ensureUserOrganization } from "@/modules/integrations/lib/org"
import {
  automationInputSchema, canManageAutomation, type AutomationInput, type AutomationDto, type AutomationContext,
} from "./contracts"
import { createWebhookCredential } from "./security"

export function automationError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode })
}

export async function automationMembership(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } })
  if (!user) throw automationError("Unauthorized", 401)
  const organizationId = user.organizationId ?? await ensureUserOrganization(userId)
  const member = await prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId } } })
  if (!member || member.status !== "active") throw automationError("Active organization membership required", 403)
  return member
}

const includeAutomation = {
  creator: { include: { user: { select: { name: true } } } },
  runAs: { include: { user: { select: { name: true } } } },
  runs: { orderBy: { createdAt: "desc" as const }, take: 30 },
} satisfies Prisma.NovaAutomationInclude

type AutomationRow = Prisma.NovaAutomationGetPayload<{ include: typeof includeAutomation }>

function serialize(row: AutomationRow, member: { id: string; role: string }): AutomationDto {
  return {
    ...automationInputSchema.parse({ ...row, postAsRunAs: false }),
    id: row.id, creatorMembershipId: row.creatorMembershipId,
    creatorName: row.creator.user.name, runAsName: row.runAs.user.name,
    canManage: canManageAutomation(member, row.creatorMembershipId),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), lastRunAt: row.lastRunAt?.toISOString() ?? null,
    runs: row.runs.map((run) => ({ id: run.id, status: run.status, reason: run.reason, agentSessionId: run.agentSessionId, createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null })),
  }
}

export async function getAutomationContext(userId: string): Promise<AutomationContext> {
  const member = await automationMembership(userId)
  const [org, members, repositories, installations] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: member.organizationId }, select: { name: true } }),
    prisma.organizationMembership.findMany({ where: { organizationId: member.organizationId, status: "active", ...((member.role === "admin" || member.role === "owner") ? {} : { id: member.id }) }, select: { id: true, user: { select: { name: true } } } }),
    prisma.repository.findMany({ where: { organizationId: member.organizationId }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.externalInstallation.findMany({ where: { organizationId: member.organizationId, status: "active" }, select: { provider: true } }),
  ])
  return {
    organizationName: org.name, membershipId: member.id,
    members: members.map((item) => ({ id: item.id, name: item.user.name })), repositories,
    connections: ["slack", "github", "linear"].map((provider) => ({ provider, connected: installations.some((item) => item.provider === provider) })),
  }
}

export async function listAutomations(userId: string): Promise<AutomationDto[]> {
  const member = await automationMembership(userId)
  const rows = await prisma.novaAutomation.findMany({ where: { organizationId: member.organizationId }, include: includeAutomation, orderBy: { createdAt: "desc" }, take: 200 })
  return rows.map((row) => serialize(row, member))
}

export async function getAutomation(userId: string, id: string, manage = false) {
  const member = await automationMembership(userId)
  const row = await prisma.novaAutomation.findFirst({ where: { id, organizationId: member.organizationId }, include: includeAutomation })
  if (!row) throw automationError("Automation not found", 404)
  if (manage && !canManageAutomation(member, row.creatorMembershipId)) throw automationError("Only the creator or an organization admin can change this automation", 403)
  return { member, row, dto: serialize(row, member) }
}

export async function validateAutomationAccess(input: AutomationInput, organizationId: string) {
  const member = await prisma.organizationMembership.findFirst({ where: { id: input.runAsMembershipId, organizationId, status: "active" }, include: { user: { select: { id: true, email: true, name: true, image: true } } } })
  if (!member) throw automationError("Run-as account is not an active organization member", 403)
  const repositories = await prisma.repository.findMany({ where: { id: { in: input.repositoryIds }, organizationId }, select: { id: true, fullName: true } })
  if (repositories.length !== new Set(input.repositoryIds).size) throw automationError("Repository does not belong to this organization", 403)
  const filteredRepositories = input.triggers.flatMap((trigger) => (trigger.type === "github.check" || trigger.type === "github.review") && trigger.repository ? [trigger.repository] : [])
  if (filteredRepositories.length) {
    const allowed = await prisma.repository.findMany({ where: { organizationId, fullName: { in: filteredRepositories } }, select: { fullName: true } })
    if (filteredRepositories.some((name) => !allowed.some((repo) => repo.fullName === name))) throw automationError("Trigger repository does not belong to this organization", 403)
  }
  return { member, repositories }
}

export async function saveAutomation(userId: string, raw: unknown, id?: string) {
  const input = automationInputSchema.parse(raw)
  const member = await automationMembership(userId)
  if (id) await getAutomation(userId, id, true)
  if (input.runAsMembershipId !== member.id && !["owner", "admin"].includes(member.role)) throw automationError("Only admins can select another run-as account", 403)
  await validateAutomationAccess(input, member.organizationId)
  const { postAsRunAs: _postAsRunAs, ...data } = input
  void _postAsRunAs
  const row = id
    ? await prisma.novaAutomation.update({ where: { id, organizationId: member.organizationId }, data: { ...data, version: { increment: 1 } }, include: includeAutomation })
    : await prisma.novaAutomation.create({ data: { ...data, organizationId: member.organizationId, creatorMembershipId: member.id }, include: includeAutomation })
  return serialize(row, member)
}

export async function deleteAutomation(userId: string, id: string): Promise<void> {
  const { member } = await getAutomation(userId, id, true)
  await prisma.novaAutomation.delete({ where: { id, organizationId: member.organizationId } })
}

export async function rotateAutomationWebhook(userId: string, id: string) {
  const { row } = await getAutomation(userId, id, true)
  const input = automationInputSchema.parse({ ...row, postAsRunAs: false })
  if (!input.triggers.some((trigger) => trigger.type === "webhook")) throw automationError("Add a webhook trigger first", 400)
  const credential = createWebhookCredential()
  await prisma.novaAutomation.update({ where: { id }, data: { webhookTokenHash: credential.hash } })
  return { token: credential.token, path: `/api/nova/automations/${id}/webhook` }
}
