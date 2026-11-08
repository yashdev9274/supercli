export const MICROCREDITS_PER_CREDIT = 1_000_000
export const FREE_MONTHLY_CREDITS = 1000

export type BillingConfig = { creditsPerUsd: number; providerMarkup: number }

export function billingConfig(): BillingConfig {
  const config = {
    creditsPerUsd: Number(process.env.BILLING_CREDITS_PER_USD ?? 100),
    providerMarkup: Number(process.env.BILLING_PROVIDER_MARKUP ?? 2),
  }
  if (!Object.values(config).every((value) => Number.isFinite(value) && value > 0)) throw new Error("Invalid billing conversion configuration")
  return config
}

export function providerCostToMicrocredits(usd: number, config = billingConfig()): number {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("Invalid provider cost")
  return Math.ceil(usd * config.creditsPerUsd * config.providerMarkup * MICROCREDITS_PER_CREDIT)
}

export const SANDBOX_RATES = {
  e2b: { cpuUsdPerSecond: 0.000014, ramUsdPerGbSecond: 0.0000045, minimumSeconds: 0 },
  vercel: { cpuUsdPerSecond: 0.128 / 3600, ramUsdPerGbSecond: 0.0212 / 3600, minimumSeconds: 60 },
} as const

export function estimateSandboxCostUsd(resources: { vcpus: number; memoryMb: number }, seconds: number, provider: keyof typeof SANDBOX_RATES = "e2b"): number {
  if (![resources.vcpus, resources.memoryMb, seconds].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("Invalid sandbox resources")
  const rate = SANDBOX_RATES[provider]
  if (!rate) throw new Error("Unknown sandbox provider")
  return Math.max(seconds, rate.minimumSeconds) * (resources.vcpus * rate.cpuUsdPerSecond + resources.memoryMb / 1024 * rate.ramUsdPerGbSecond)
}

export function calcSandboxMicrocredits(resources: { vcpus: number; memoryMb: number }, seconds: number, provider: keyof typeof SANDBOX_RATES = "e2b"): number {
  return providerCostToMicrocredits(estimateSandboxCostUsd(resources, seconds, provider))
}

export const MCP_TOOL_COST_USD: Record<string, number> = {
  github: 0.002, linear: 0.002, slack: 0.002, jira: 0.002,
  notion: 0.003, figma: 0.003, gmail: 0.005, drive: 0.005,
  googledocs: 0.005, calendar: 0.003, contacts: 0.003,
  web_search: 0.01, context_search: 0.01, exa_search: 0.01, firecrawl: 0.01,
}

export function calcMcpMicrocredits(toolName: string): number {
  const entry = Object.entries(MCP_TOOL_COST_USD).find(([key]) => toolName.toLowerCase().includes(key))
  return providerCostToMicrocredits(entry?.[1] ?? 0.003)
}

export class InsufficientCreditsError extends Error {
  readonly statusCode = 402
  constructor() { super("Monthly product credits exhausted") }
}

export interface BillingTransaction {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>
}

export interface BillingDatabase {
  $transaction<T>(operation: (tx: BillingTransaction) => Promise<T>, options?: { isolationLevel: "Serializable" }): Promise<T>
}

export type CreditReservation = {
  id: string
  userId: string
  key: string
  kind: string
  periodStart: Date
  status: "reserved" | "settled"
  reservedMicrocredits: number
  actualMicrocredits: number | null
  replayed: boolean
}

type ReservationRow = Omit<CreditReservation, "replayed" | "reservedMicrocredits" | "actualMicrocredits"> & {
  reservedMicrocredits: bigint
  actualMicrocredits: bigint | null
}

export function createBillingService(prisma: BillingDatabase) {
  async function transact<T>(operation: (tx: BillingTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(operation, { isolationLevel: "Serializable" })
      } catch (error) {
        const failure = error as { code?: string; meta?: { code?: string } }
        if (attempt >= 5 || !["P2034", "40001", "40P01", "23505"].includes(failure.meta?.code ?? failure.code ?? "")) throw error
      }
    }
  }

  const result = (row: ReservationRow, replayed: boolean): CreditReservation => ({
    ...row, reservedMicrocredits: Number(row.reservedMicrocredits),
    actualMicrocredits: row.actualMicrocredits === null ? null : Number(row.actualMicrocredits), replayed,
  })

  function amount(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Microcredits must be a nonnegative safe integer")
  }

  async function account(tx: BillingTransaction, userId: string) {
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const plans = await tx.$queryRawUnsafe<{ tier: string; monthlyCredits: number }[]>(`SELECT p.tier, p."monthlyCredits" FROM subscription s JOIN plan p ON p.id = s."planId" WHERE s."userId" = $1 AND s.status IN ('active', 'trialing') AND (p.tier = 'spark' OR s."currentPeriodEnd" IS NULL OR s."currentPeriodEnd" > NOW()) ORDER BY CASE WHEN p.tier = 'spark' THEN 1 ELSE 0 END, s."createdAt" DESC LIMIT 1`, userId)
    const credits = !plans[0] || plans[0].tier === "spark" ? FREE_MONTHLY_CREDITS : plans[0].monthlyCredits
    const allowance = credits * MICROCREDITS_PER_CREDIT
    amount(allowance)
    await tx.$executeRawUnsafe(`INSERT INTO credit_account ("userId", "balanceMicrocredits", "allowanceMicrocredits", "periodStart", "resetAt", "updatedAt") VALUES ($1,$2,$2,$3,$4,NOW()) ON CONFLICT ("userId") DO NOTHING`, userId, BigInt(allowance), start, end)
    const rows = await tx.$queryRawUnsafe<{ userId: string; balanceMicrocredits: bigint; allowanceMicrocredits: bigint; committedMicrocredits: bigint; periodStart: Date; resetAt: Date }[]>(`SELECT * FROM credit_account WHERE "userId"=$1 FOR UPDATE`, userId)
    const row = rows[0]
    if (!row) throw new Error("Billing account missing")
    if (row.resetAt <= now) {
      await tx.$executeRawUnsafe(`UPDATE credit_account SET "balanceMicrocredits"=$2,"allowanceMicrocredits"=$2,"committedMicrocredits"=0,"periodStart"=$3,"resetAt"=$4,"updatedAt"=NOW() WHERE "userId"=$1`, userId, BigInt(allowance), start, end)
      return { ...row, balanceMicrocredits: BigInt(allowance), allowanceMicrocredits: BigInt(allowance), committedMicrocredits: BigInt(0), periodStart: start, resetAt: end }
    }
    if (Number(row.allowanceMicrocredits) !== allowance) {
      const available = BigInt(allowance) > BigInt(row.committedMicrocredits) ? BigInt(allowance) - BigInt(row.committedMicrocredits) : BigInt(0)
      await tx.$executeRawUnsafe(`UPDATE credit_account SET "balanceMicrocredits"=$2,"allowanceMicrocredits"=$3,"updatedAt"=NOW() WHERE "userId"=$1`, userId, available, BigInt(allowance))
      return { ...row, balanceMicrocredits: available, allowanceMicrocredits: BigInt(allowance) }
    }
    return row
  }

  return {
    async getBalance(userId: string) {
      return transact(async (tx) => {
        const row = await account(tx, userId)
        return { userId, balanceMicrocredits: Number(row.balanceMicrocredits), allowanceMicrocredits: Number(row.allowanceMicrocredits), balanceCredits: Number(row.balanceMicrocredits) / MICROCREDITS_PER_CREDIT, allowanceCredits: Number(row.allowanceMicrocredits) / MICROCREDITS_PER_CREDIT, periodStart: row.periodStart, resetAt: row.resetAt }
      })
    },
    async getReservation(input: { userId: string; key: string }) {
      return transact(async (tx) => {
        const rows = await tx.$queryRawUnsafe<ReservationRow[]>(`SELECT * FROM credit_reservation WHERE "userId"=$1 AND key=$2`, input.userId, input.key)
        return rows[0] ? result(rows[0], true) : null
      })
    },
    async reserve(input: { userId: string; key: string; kind: string; amountMicrocredits: number; metadata?: Record<string, unknown> }) {
      amount(input.amountMicrocredits)
      if (!input.key || !input.kind) throw new Error("Reservation key and kind required")
      return transact(async (tx) => {
        const balance = await account(tx, input.userId)
        const existing = await tx.$queryRawUnsafe<ReservationRow[]>(`SELECT * FROM credit_reservation WHERE "userId"=$1 AND key=$2`, input.userId, input.key)
        if (existing[0]) {
          if (existing[0].kind !== input.kind || Number(existing[0].reservedMicrocredits) !== input.amountMicrocredits) throw new Error("Idempotency key reused with different charge")
          return result(existing[0], true)
        }
        const updated = await tx.$executeRawUnsafe(`UPDATE credit_account SET "balanceMicrocredits"="balanceMicrocredits"-$2,"committedMicrocredits"="committedMicrocredits"+$2,"updatedAt"=NOW() WHERE "userId"=$1 AND "balanceMicrocredits">=$2`, input.userId, BigInt(input.amountMicrocredits))
        if (updated !== 1) throw new InsufficientCreditsError()
        const rows = await tx.$queryRawUnsafe<ReservationRow[]>(`INSERT INTO credit_reservation (id,"userId",key,kind,"periodStart",status,"reservedMicrocredits",metadata,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'reserved',$6,$7::jsonb,NOW(),NOW()) RETURNING *`, crypto.randomUUID(), input.userId, input.key, input.kind, balance.periodStart, BigInt(input.amountMicrocredits), JSON.stringify(input.metadata ?? {}))
        return result(rows[0]!, false)
      })
    },
    async settle(input: { reservationId: string; actualMicrocredits: number; metadata?: Record<string, unknown> }) {
      amount(input.actualMicrocredits)
      return transact(async (tx) => {
        const found = await tx.$queryRawUnsafe<ReservationRow[]>(`SELECT * FROM credit_reservation WHERE id=$1`, input.reservationId)
        if (!found[0]) throw new Error("Unknown credit reservation")
        const balance = await account(tx, found[0].userId)
        const rows = await tx.$queryRawUnsafe<ReservationRow[]>(`SELECT * FROM credit_reservation WHERE id=$1 FOR UPDATE`, input.reservationId)
        const row = rows[0]!
        if (row.status === "settled") {
          if (Number(row.actualMicrocredits) !== input.actualMicrocredits) throw new Error("Settlement replay amount differs")
          return result(row, true)
        }
        if (input.actualMicrocredits > Number(row.reservedMicrocredits)) throw new Error("Actual charge exceeds reservation; reserve the upper bound before execution")
        if (row.periodStart.getTime() === balance.periodStart.getTime()) {
          await tx.$executeRawUnsafe(`UPDATE credit_account SET "committedMicrocredits"="committedMicrocredits"-$2,"balanceMicrocredits"=GREATEST(0,"allowanceMicrocredits"-"committedMicrocredits"+$2),"updatedAt"=NOW() WHERE "userId"=$1`, row.userId, BigInt(row.reservedMicrocredits) - BigInt(input.actualMicrocredits))
        }
        const settled = await tx.$queryRawUnsafe<ReservationRow[]>(`UPDATE credit_reservation SET status='settled',"actualMicrocredits"=$2,metadata=metadata || $3::jsonb,"updatedAt"=NOW() WHERE id=$1 RETURNING *`, input.reservationId, BigInt(input.actualMicrocredits), JSON.stringify(input.metadata ?? {}))
        return result(settled[0]!, false)
      })
    },
  }
}
