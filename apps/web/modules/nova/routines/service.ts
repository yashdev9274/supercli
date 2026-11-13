import prisma from "@super/db"
import { ensureUserOrganization } from "@/modules/integrations/lib/org"
import { routineInputSchema, type RoutineDto } from "./contracts"
export function routineError(message: string, statusCode: number): Error & { statusCode: number } { return Object.assign(new Error(message), { statusCode }) }
async function membership(userId: string) { const organizationId = await ensureUserOrganization(userId); const member = await prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId } } }); if (!member || member.status !== "active") throw routineError("Active organization membership required", 403); return { organizationId } }
const include = { runs: { orderBy: { createdAt: "desc" as const }, take: 30 } } as const
function serialize(row: any): RoutineDto { return { name: row.name, instructions: row.instructions, scheduleType: row.scheduleType, dayOfWeek: row.dayOfWeek, hour: row.hour, minute: row.minute, timezone: row.timezone, requiresCalendar: row.requiresCalendar, separateThread: row.separateThread, status: row.status, id: row.id, agentId: row.agentId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), lastRunAt: row.lastRunAt?.toISOString() ?? null, runs: row.runs.map((run: any) => ({ id: run.id, status: run.status, reason: run.reason, createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null })) } }
async function agentFor(userId: string, agentId: string) { const { organizationId } = await membership(userId); const agent = await prisma.novaAgent.findFirst({ where: { id: agentId, organizationId, ownerUserId: userId, status: { not: "archived" } }, select: { id: true } }); if (!agent) throw routineError("Agent not found", 404); return organizationId }
function routineStore() {
  const store = (prisma as typeof prisma & { novaAgentRoutine?: typeof prisma.novaAgentRoutine }).novaAgentRoutine
  if (!store) throw routineError("Nova database client is out of date. Run db:generate and restart the web server.", 503)
  return store
}
export async function listRoutines(userId: string, agentId: string) { const organizationId = await agentFor(userId, agentId); const store = routineStore(); const rows = await store.findMany({ where: { agentId, organizationId }, include, orderBy: { createdAt: "desc" } }); return rows.map(serialize) }
export async function saveRoutine(userId: string, agentId: string, raw: unknown, id?: string) {
  const input = routineInputSchema.parse(raw)
  const organizationId = await agentFor(userId, agentId)
  const store = routineStore()
  if (id && !await store.findFirst({ where: { id, agentId, organizationId }, select: { id: true } })) throw routineError("Routine not found", 404)
  const row = id
    ? await store.update({ where: { id }, data: input, include })
    : await store.create({ data: { ...input, organization: { connect: { id: organizationId } }, ownerUser: { connect: { id: userId } }, agent: { connect: { id: agentId } } }, include })
  return serialize(row)
}
export async function deleteRoutine(userId: string, agentId: string, id: string) { const organizationId = await agentFor(userId, agentId); const store = routineStore(); if (!await store.findFirst({ where: { id, agentId, organizationId }, select: { id: true } })) throw routineError("Routine not found", 404); await store.delete({ where: { id } }) }
