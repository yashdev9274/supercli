import prisma from "@super/db"

import { ensureUserOrganization } from "@/modules/integrations/lib/org"
import { ensureHarnessToken } from "@/modules/nova/harness/auth"
import { readSettingsUsage } from "./usage-reporting"

export type SettingsActivity = {
  rangeDays: number
  sessions: number
  sessionsPrevious: number
  completedRuns: number
  completedRunsPrevious: number
  failedRuns: number
  approvals: number
  agentHours: number
  agentHoursPrevious: number
  heatmap: Array<{ date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }>
  recent: Array<{
    id: string
    objective: string
    status: string
    updatedAt: string
    runCount: number
  }>
}

export type SettingsUsage = {
  periodLabel: string
  periodStart: string
  periodEnd: string
  resetAt: string | null
  allowanceCredits: number | null
  balanceCredits: number | null
  spentCredits: number | null
  reservedCredits: number | null
  planName: string | null
  planTier: string | null
  isGrandfathered: boolean
  categories: Array<{
    kind: "models" | "machines" | "mcp"
    label: string
    spentCredits: number
    reservedCredits: number
    requests: number
  }>
  daily: Array<{ date: string; modelCredits: number; machineCredits: number; mcpCredits: number }>
  history: Array<{
    id: string
    kind: "models" | "machines" | "mcp"
    label: string
    credits: number
    status: "reserved" | "settled"
    createdAt: string
  }>
  source: "ledger" | "unavailable"
  message?: string
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

async function membershipContext(userId: string) {
  const organizationId = await ensureUserOrganization(userId)
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { id: true, status: true },
  })
  if (!membership || membership.status !== "active") {
    throw Object.assign(new Error("Active organization membership required"), { statusCode: 403 })
  }
  return { organizationId, membershipId: membership.id }
}

export async function getSettingsActivity(userId: string, rangeDays = 30): Promise<SettingsActivity> {
  const { organizationId, membershipId } = await membershipContext(userId)
  const days = Math.min(Math.max(rangeDays, 7), 90)
  const now = new Date()
  const rangeStart = new Date(now.getTime() - days * 86_400_000)
  const previousStart = new Date(now.getTime() - days * 2 * 86_400_000)
  const yearStart = new Date(now.getTime() - 52 * 7 * 86_400_000)

  const [sessionsNow, sessionsPrev, runsNow, runsPrev, approvals, heatmapRows, recent] = await Promise.all([
    prisma.agentSession.count({
      where: { organizationId, initiatorMembershipId: membershipId, createdAt: { gte: rangeStart } },
    }),
    prisma.agentSession.count({
      where: {
        organizationId,
        initiatorMembershipId: membershipId,
        createdAt: { gte: previousStart, lt: rangeStart },
      },
    }),
    prisma.agentRun.findMany({
      where: {
        createdAt: { gte: rangeStart },
        agentSession: { organizationId, initiatorMembershipId: membershipId },
      },
      select: { status: true, startedAt: true, completedAt: true, createdAt: true },
    }),
    prisma.agentRun.findMany({
      where: {
        createdAt: { gte: previousStart, lt: rangeStart },
        agentSession: { organizationId, initiatorMembershipId: membershipId },
      },
      select: { status: true, startedAt: true, completedAt: true, createdAt: true },
    }),
    prisma.approvalRequest.count({
      where: {
        createdAt: { gte: rangeStart },
        run: { agentSession: { organizationId, initiatorMembershipId: membershipId } },
      },
    }),
    prisma.agentSessionMessage.findMany({
      where: {
        createdAt: { gte: yearStart },
        role: "user",
        agentSession: { organizationId, initiatorMembershipId: membershipId },
      },
      select: { createdAt: true },
      take: 8_000,
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentSession.findMany({
      where: { organizationId, initiatorMembershipId: membershipId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        objective: true,
        status: true,
        updatedAt: true,
        _count: { select: { runs: true } },
      },
    }),
  ])

  const dayCounts = new Map<string, number>()
  for (const row of heatmapRows) {
    const key = isoDay(startOfDay(new Date(row.createdAt)))
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1)
  }

  const heatmap: SettingsActivity["heatmap"] = []
  for (let offset = 52 * 7 - 1; offset >= 0; offset -= 1) {
    const day = startOfDay(new Date(now.getTime() - offset * 86_400_000))
    const key = isoDay(day)
    const count = dayCounts.get(key) ?? 0
    heatmap.push({ date: key, count, level: heatLevel(count) })
  }

  function agentHours(runs: Array<{ status: string; startedAt: Date | null; completedAt: Date | null; createdAt: Date }>) {
    let ms = 0
    for (const run of runs) {
      const start = run.startedAt ?? run.createdAt
      const end = run.completedAt ?? (run.status === "completed" || run.status === "failed" ? run.createdAt : null)
      if (!end) continue
      ms += Math.max(0, end.getTime() - start.getTime())
    }
    return Math.round((ms / 3_600_000) * 10) / 10
  }

  return {
    rangeDays: days,
    sessions: sessionsNow,
    sessionsPrevious: sessionsPrev,
    completedRuns: runsNow.filter((run) => run.status === "completed").length,
    completedRunsPrevious: runsPrev.filter((run) => run.status === "completed").length,
    failedRuns: runsNow.filter((run) => run.status === "failed").length,
    approvals,
    agentHours: agentHours(runsNow),
    agentHoursPrevious: agentHours(runsPrev),
    heatmap,
    recent: recent.map((session) => ({
      id: session.id,
      objective: session.objective,
      status: session.status,
      updatedAt: session.updatedAt.toISOString(),
      runCount: session._count.runs,
    })),
  }
}

export async function getSettingsUsage(input: {
  userId: string
  email: string
  name?: string | null
  image?: string | null
}): Promise<SettingsUsage> {
  return readSettingsUsage(input, {
    authenticate: async () => {
      const { token } = await ensureHarnessToken({
        email: input.email,
        name: input.name,
        image: input.image,
      })
      const terminalPrisma = (await import("@super/db-terminal")).default
      return terminalPrisma.session.findUnique({
        where: { token },
        select: { userId: true, expiresAt: true, user: { select: { email: true } } },
      })
    },
    database: async () => (await import("@super/db-terminal")).default,
  })
}
