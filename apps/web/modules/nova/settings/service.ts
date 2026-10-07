import prisma from "@super/db"

import { ensureUserOrganization } from "@/modules/integrations/lib/org"
import { ensureHarnessToken } from "@/modules/nova/harness/auth"
import { terminalHarnessUrl } from "@/modules/nova/harness/client"

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
  totalSpendUsd: number
  totalTokens: number
  totalRequests: number
  balanceUsd: number | null
  planName: string | null
  planTier: string | null
  requestsUsed: number | null
  requestLimit: number | null
  daily: Array<{ date: string; spendUsd: number; tokens: number; requests: number }>
  models: Array<{
    model: string
    provider: string
    spendUsd: number
    tokens: number
    requests: number
    share: number
  }>
  source: "harness" | "sessions"
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
  const now = new Date()
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const periodEnd = now
  const periodLabel = periodStart.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })

  let planName: string | null = null
  let planTier: string | null = null
  let balanceUsd: number | null = null
  let requestsUsed: number | null = null
  let requestLimit: number | null = null
  let harnessToken: string | null = null

  try {
    const harness = await ensureHarnessToken({
      email: input.email,
      name: input.name,
      image: input.image,
    })
    harnessToken = harness.token
  } catch {
    harnessToken = null
  }

  if (harnessToken) {
    try {
      const response = await fetch(`${terminalHarnessUrl()}/api/user/me`, {
        headers: { Authorization: `Bearer ${harnessToken}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      })
      if (response.ok) {
        const me = await response.json() as { id?: string }
        if (me.id) {
          const statusResponse = await fetch(
            `${terminalHarnessUrl()}/api/billing/status?userId=${encodeURIComponent(me.id)}`,
            {
              headers: { Authorization: `Bearer ${harnessToken}`, Accept: "application/json" },
              cache: "no-store",
              signal: AbortSignal.timeout(8_000),
            },
          )
          if (statusResponse.ok) {
            const status = await statusResponse.json() as {
              plan?: { name?: string; tier?: string; requestLimit?: number | null } | null
              creditBalance?: { balanceCents?: number | null } | null
              requestsUsed?: number
            }
            planName = status.plan?.name ?? null
            planTier = status.plan?.tier ?? null
            requestLimit = status.plan?.requestLimit ?? null
            requestsUsed = status.requestsUsed ?? null
            if (typeof status.creditBalance?.balanceCents === "number") {
              balanceUsd = Math.round(status.creditBalance.balanceCents) / 100
            }
          }

          try {
            const terminalPrisma = (await import("@super/db-terminal")).default as {
              $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T>
            }
            const events = await terminalPrisma.$queryRawUnsafe<Array<{
              model: string
              provider: string
              totalTokens: number
              costUsd: number | null
              createdAt: Date
            }>>(
              `SELECT "model", "provider", "totalTokens", "costUsd", "createdAt"
               FROM "usage_event"
               WHERE "createdAt" >= $1 AND "createdAt" <= $2
                 AND (
                   CASE WHEN EXISTS (
                     SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'usage_event' AND column_name = 'userId'
                   ) THEN "userId" = $3 ELSE FALSE END
                 )
               ORDER BY "createdAt" ASC
               LIMIT 10000`,
              periodStart,
              periodEnd,
              me.id,
            )
            if (events.length > 0) {
              const dailyMap = new Map<string, { spendUsd: number; tokens: number; requests: number }>()
              const modelMap = new Map<string, { model: string; provider: string; spendUsd: number; tokens: number; requests: number }>()
              let totalSpendUsd = 0
              let totalTokens = 0
              for (const event of events) {
                const spend = event.costUsd ?? 0
                totalSpendUsd += spend
                totalTokens += event.totalTokens
                const day = isoDay(startOfDay(event.createdAt))
                const dayBucket = dailyMap.get(day) ?? { spendUsd: 0, tokens: 0, requests: 0 }
                dayBucket.spendUsd += spend
                dayBucket.tokens += event.totalTokens
                dayBucket.requests += 1
                dailyMap.set(day, dayBucket)
                const key = `${event.provider}::${event.model}`
                const modelBucket = modelMap.get(key) ?? {
                  model: event.model,
                  provider: event.provider,
                  spendUsd: 0,
                  tokens: 0,
                  requests: 0,
                }
                modelBucket.spendUsd += spend
                modelBucket.tokens += event.totalTokens
                modelBucket.requests += 1
                modelMap.set(key, modelBucket)
              }
              const daily: SettingsUsage["daily"] = []
              for (let cursor = new Date(periodStart); cursor <= periodEnd; cursor = new Date(cursor.getTime() + 86_400_000)) {
                const key = isoDay(startOfDay(cursor))
                const bucket = dailyMap.get(key) ?? { spendUsd: 0, tokens: 0, requests: 0 }
                daily.push({ date: key, ...bucket })
              }
              const models = [...modelMap.values()]
                .sort((a, b) => b.spendUsd - a.spendUsd || b.tokens - a.tokens)
                .map((item) => ({
                  ...item,
                  share: totalSpendUsd > 0 ? item.spendUsd / totalSpendUsd : totalTokens > 0 ? item.tokens / totalTokens : 0,
                }))
              return {
                periodLabel,
                periodStart: periodStart.toISOString(),
                periodEnd: periodEnd.toISOString(),
                totalSpendUsd: Math.round(totalSpendUsd * 100) / 100,
                totalTokens,
                totalRequests: events.length,
                balanceUsd,
                planName,
                planTier,
                requestsUsed,
                requestLimit,
                daily,
                models,
                source: "harness",
              }
            }
          } catch {
            // Fall through to session-based usage.
          }
        }
      }
    } catch {
      // Fall through.
    }
  }

  const { organizationId, membershipId } = await membershipContext(input.userId)
  const runs = await prisma.agentRun.findMany({
    where: {
      createdAt: { gte: periodStart, lte: periodEnd },
      agentSession: { organizationId, initiatorMembershipId: membershipId },
    },
    select: { status: true, createdAt: true, completedAt: true, startedAt: true },
  })
  const dailyMap = new Map<string, { spendUsd: number; tokens: number; requests: number }>()
  for (const run of runs) {
    const key = isoDay(startOfDay(run.createdAt))
    const bucket = dailyMap.get(key) ?? { spendUsd: 0, tokens: 0, requests: 0 }
    bucket.requests += 1
    dailyMap.set(key, bucket)
  }
  const daily: SettingsUsage["daily"] = []
  for (let cursor = new Date(periodStart); cursor <= periodEnd; cursor = new Date(cursor.getTime() + 86_400_000)) {
    const key = isoDay(startOfDay(cursor))
    daily.push({ date: key, ...(dailyMap.get(key) ?? { spendUsd: 0, tokens: 0, requests: 0 }) })
  }

  return {
    periodLabel,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalSpendUsd: 0,
    totalTokens: 0,
    totalRequests: runs.length,
    balanceUsd,
    planName,
    planTier,
    requestsUsed: requestsUsed ?? runs.length,
    requestLimit,
    daily,
    models: [],
    source: "sessions",
    message: harnessToken
      ? "Harness usage detail is not available for this account yet. Showing Nova turn counts for the current month."
      : "Sign in to the CLI harness to see token spend and plan balance. Showing Nova turn counts for now.",
  }
}
