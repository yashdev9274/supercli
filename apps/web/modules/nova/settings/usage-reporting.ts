import { createBillingService, MICROCREDITS_PER_CREDIT, type BillingDatabase } from "@super/billing"

import type { SettingsUsage } from "./service"

type UsageSession = { userId: string; expiresAt: Date; user: { email: string } } | null
type Aggregate = { kind: string; status: string; date: string; credits: bigint | string; requests: bigint | number }
type HistoryRow = {
  id: string
  kind: string
  status: string
  credits: bigint | string
  createdAt: Date
  metadata: { model?: unknown; toolName?: unknown; provider?: unknown } | null
}

function category(kind: string): SettingsUsage["categories"][number]["kind"] {
  if (kind === "inference") return "models"
  if (kind === "sandbox_wall_time") return "machines"
  if (kind === "mcp" || kind === "hosted_search") return "mcp"
  throw new Error("Unknown ledger charge kind")
}

const labels = { models: "Models", machines: "Machines", mcp: "MCP & hosted search" }

function historyLabel(row: HistoryRow, kind: SettingsUsage["history"][number]["kind"]): string {
  const value = kind === "models" ? row.metadata?.model
    : kind === "machines" ? row.metadata?.provider : row.metadata?.toolName
  const label = typeof value === "string" ? value.replace(new RegExp("\\p{Cc}", "gu"), "").trim().slice(0, 160) : ""
  return label || labels[kind]
}

function credits(value: bigint | string): number {
  if (value == null) throw new Error("Missing ledger amount")
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid ledger amount")
  return amount / MICROCREDITS_PER_CREDIT
}

export async function readSettingsUsage(
  input: { email: string },
  dependencies: {
    authenticate: () => Promise<UsageSession>
    database: () => Promise<BillingDatabase>
    now?: Date
  },
): Promise<SettingsUsage> {
  const now = dependencies.now ?? new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const unavailable: SettingsUsage = {
    periodLabel: start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    periodStart: start.toISOString(),
    periodEnd: now.toISOString(),
    resetAt: null,
    allowanceCredits: null,
    balanceCredits: null,
    spentCredits: null,
    reservedCredits: null,
    planName: null,
    planTier: null,
    isGrandfathered: false,
    categories: [],
    daily: [],
    history: [],
    source: "unavailable",
    message: "Credit usage is temporarily unavailable. No balance or usage estimate is shown.",
  }

  try {
    const session = await dependencies.authenticate()
    if (!input.email.trim() || !session?.userId || session.expiresAt <= now ||
      session.user.email.trim().toLowerCase() !== input.email.trim().toLowerCase()) return unavailable
    const database = await dependencies.database()
    const { balance, aggregates, history, plans } = await database.$transaction(async (tx) => {
      const balance = await createBillingService({
        $transaction: (operation) => operation(tx),
      }).getBalance(session.userId)
      if (balance.periodStart.getTime() !== start.getTime()) throw new Error("Ledger period mismatch")
      const [aggregates, history, plans] = await Promise.all([
        tx.$queryRawUnsafe<Aggregate[]>(
          `SELECT kind, status, TO_CHAR("createdAt", 'YYYY-MM-DD') AS date,
             SUM(CASE WHEN status = 'settled' THEN "actualMicrocredits" ELSE "reservedMicrocredits" END) AS credits,
             COUNT(*) AS requests
           FROM credit_reservation
           WHERE "userId" = $1 AND "periodStart" = $2 AND "createdAt" >= $2 AND "createdAt" < $3
           GROUP BY kind, status, date`,
          session.userId, start, end,
        ),
        tx.$queryRawUnsafe<HistoryRow[]>(
          `SELECT id, kind, status,
             CASE WHEN status = 'settled' THEN "actualMicrocredits" ELSE "reservedMicrocredits" END AS credits,
             "createdAt", metadata
           FROM credit_reservation
           WHERE "userId" = $1 AND "periodStart" = $2 AND "createdAt" >= $2 AND "createdAt" < $3
           ORDER BY "createdAt" DESC, id DESC LIMIT 50`,
          session.userId, start, end,
        ),
        tx.$queryRawUnsafe<Array<{ tier: string; metadata: { grandfathered?: boolean } | null }>>(
          `SELECT p.tier, s.metadata FROM subscription s JOIN plan p ON p.id = s."planId"
           WHERE s."userId" = $1 AND s.status IN ('active', 'trialing')
             AND (p.tier = 'spark' OR s."currentPeriodEnd" IS NULL OR s."currentPeriodEnd" > NOW())
           ORDER BY CASE WHEN p.tier = 'spark' THEN 1 ELSE 0 END, s."createdAt" DESC LIMIT 1`,
          session.userId,
        ),
      ])
      return { balance, aggregates, history, plans }
    })
    const categories: SettingsUsage["categories"] = (["models", "machines", "mcp"] as const).map((kind) => ({
      kind, label: labels[kind], spentCredits: 0, reservedCredits: 0, requests: 0,
    }))
    const daily = new Map<string, SettingsUsage["daily"][number]>()
    for (let cursor = start.getTime(); cursor <= now.getTime(); cursor += 86_400_000) {
      const date = new Date(cursor).toISOString().slice(0, 10)
      daily.set(date, { date, modelCredits: 0, machineCredits: 0, mcpCredits: 0 })
    }
    for (const row of aggregates) {
      if (row.status !== "settled" && row.status !== "reserved") throw new Error("Unknown ledger status")
      const kind = category(row.kind)
      const bucket = categories.find((item) => item.kind === kind)!
      const amount = credits(row.credits)
      bucket.requests += Number(row.requests)
      if (row.status === "reserved") {
        bucket.reservedCredits += amount
      } else {
        bucket.spentCredits += amount
        const day = daily.get(row.date)
        if (!day) throw new Error("Ledger date outside reporting range")
        const field = kind === "models" ? "modelCredits" : kind === "machines" ? "machineCredits" : "mcpCredits"
        day[field] += amount
      }
    }
    const tier = plans[0]?.tier ?? "spark"
    const planNames: Record<string, string> = { spark: "Free", "spark-premium": "Spark", pro: "Pro", ultra: "Ultra" }
    return {
      ...unavailable,
      resetAt: balance.resetAt.toISOString(),
      allowanceCredits: balance.allowanceCredits,
      balanceCredits: balance.balanceCredits,
      spentCredits: categories.reduce((sum, item) => sum + item.spentCredits, 0),
      reservedCredits: categories.reduce((sum, item) => sum + item.reservedCredits, 0),
      planName: planNames[tier] ?? null,
      planTier: tier,
      isGrandfathered: plans[0]?.metadata?.grandfathered === true,
      categories,
      daily: [...daily.values()],
      history: history.map((row) => {
        if (row.status !== "settled" && row.status !== "reserved") throw new Error("Unknown ledger status")
        const kind = category(row.kind)
        return { id: row.id, kind, label: historyLabel(row, kind), credits: credits(row.credits), status: row.status, createdAt: row.createdAt.toISOString() }
      }),
      source: "ledger",
      message: undefined,
    }
  } catch {
    return unavailable
  }
}
