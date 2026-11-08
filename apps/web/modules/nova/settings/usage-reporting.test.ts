import { expect, test } from "bun:test"
import type { BillingTransaction } from "@super/billing"

import { readSettingsUsage } from "./usage-reporting"

const now = new Date()
const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
const date = now.toISOString().slice(0, 10)
type Row = {
  kind: string
  status: string
  credits: bigint
  requests: bigint
  date: string
  metadata?: { model?: unknown; toolName?: unknown; provider?: unknown; secret?: string }
}

function fixture(options: { rows?: Row[]; grandfathered?: boolean; fail?: string } = {}) {
  const queries: string[] = []
  let authenticatedId: string | null = null
  let inTransaction = false
  let accountLocked = false
  let transactions = 0
  const query = async <T>(sql: string, ...values: unknown[]): Promise<T> => {
    expect(inTransaction).toBe(true)
    queries.push(sql)
    if (options.fail) throw new Error(options.fail)
    authenticatedId = values[0] as string
    let result: unknown
    if (sql.includes("SELECT * FROM credit_account")) {
      expect(sql).toContain("FOR UPDATE")
      accountLocked = true
      const committed = (options.rows ?? []).reduce((sum, row) => sum + row.credits, BigInt(0))
      result = [{
        userId: values[0], balanceMicrocredits: BigInt(1_000_000_000) - committed,
        allowanceMicrocredits: BigInt(1_000_000_000), committedMicrocredits: committed,
        periodStart: start, resetAt: end,
      }]
    } else if (sql.includes("FROM subscription")) {
      result = [{ tier: "spark", monthlyCredits: 1000, metadata: { grandfathered: options.grandfathered ?? false } }]
    } else {
      expect(accountLocked).toBe(true)
      expect(values).toEqual(["terminal-user", start, end])
      expect(sql).toContain('"userId" = $1')
      expect(sql).toContain('"periodStart" = $2')
      expect(sql).toContain('"createdAt" >= $2')
      expect(sql).toContain('"createdAt" < $3')
      if (sql.includes("GROUP BY")) {
        expect(sql).not.toContain("LIMIT")
        expect(sql).toContain('SUM(CASE WHEN status = \'settled\' THEN "actualMicrocredits" ELSE "reservedMicrocredits" END)')
        result = options.rows ?? []
      } else {
        expect(sql).toContain("LIMIT 50")
        result = (options.rows ?? []).map((row, index) => ({ ...row, id: String(index), createdAt: now }))
      }
    }
    return result as T
  }
  const db = {
    $queryRawUnsafe: query,
    $executeRawUnsafe: async () => 1,
    $transaction: async <T>(operation: (tx: BillingTransaction) => Promise<T>) => {
      expect(inTransaction).toBe(false)
      inTransaction = true
      transactions += 1
      try {
        return await operation(db)
      } finally {
        inTransaction = false
      }
    },
  }
  const session = { userId: "terminal-user", expiresAt: end, user: { email: " USER@example.com " } }
  const dependencies = { authenticate: async () => session, database: async () => db, now }
  return { dependencies, session, queries, authenticatedId: () => authenticatedId, transactions: () => transactions }
}

test("settled fractional actuals/refunds and held credits remain separate across the shared ledger", async () => {
  const rows: Row[] = [
    { kind: "inference", status: "settled", credits: BigInt(125_000), requests: BigInt(2), date },
    { kind: "sandbox_wall_time", status: "settled", credits: BigInt(500_000), requests: BigInt(1), date },
    { kind: "mcp", status: "settled", credits: BigInt(250_000), requests: BigInt(1), date },
    { kind: "hosted_search", status: "settled", credits: BigInt(125_000), requests: BigInt(1), date },
    { kind: "inference", status: "reserved", credits: BigInt(250_000), requests: BigInt(1), date },
    { kind: "mcp", status: "settled", credits: BigInt(0), requests: BigInt(1), date },
  ]
  const f = fixture({ rows })
  const result = await readSettingsUsage({ email: "user@example.com" }, f.dependencies)
  expect(result.source).toBe("ledger")
  expect(result.spentCredits).toBe(1)
  expect(result.reservedCredits).toBe(0.25)
  expect(result.balanceCredits).toBe(998.75)
  expect(result.categories.map((item) => item.spentCredits)).toEqual([0.125, 0.5, 0.375])
  expect(result.categories.map((item) => item.requests)).toEqual([3, 1, 3])
  expect(result.daily.find((item) => item.date === date)).toEqual({
    date, modelCredits: 0.125, machineCredits: 0.5, mcpCredits: 0.375,
  })
  expect(result.history.find((item) => item.status === "reserved")?.credits).toBe(0.25)
  expect(f.authenticatedId()).toBe("terminal-user")
  expect(f.transactions()).toBe(1)
  expect(result.periodEnd).toBe(now.toISOString())
})

for (const grandfathered of [false, true]) {
  test(`zero current-period usage retains the same 1000 credit allowance (grandfathered=${grandfathered})`, async () => {
    const result = await readSettingsUsage({ email: "user@example.com" }, fixture({ grandfathered }).dependencies)
    expect(result.source).toBe("ledger")
    expect(result.allowanceCredits).toBe(1000)
    expect(result.balanceCredits).toBe(1000)
    expect(result.isGrandfathered).toBe(grandfathered)
    expect(result.spentCredits).toBe(0)
    expect(result.reservedCredits).toBe(0)
    expect(result.history).toEqual([])
    expect(result.daily.every((day) => day.modelCredits === 0 && day.machineCredits === 0 && day.mcpCredits === 0)).toBe(true)
    expect(result.periodStart).toBe(start.toISOString())
    expect(result.resetAt).toBe(end.toISOString())
  })
}

for (const fail of ["relation credit_account does not exist", "network failure"]) {
  test(`database failure is unavailable, never a fabricated balance: ${fail}`, async () => {
    const result = await readSettingsUsage({ email: "user@example.com" }, fixture({ fail }).dependencies)
    expect(result.source).toBe("unavailable")
    expect(result.balanceCredits).toBeNull()
    expect(result.allowanceCredits).toBeNull()
    expect(result.spentCredits).toBeNull()
    expect(result.reservedCredits).toBeNull()
  })
}

test("unknown charge kinds cannot silently understate totals", async () => {
  const f = fixture({ rows: [{ kind: "unexpected", status: "settled", credits: BigInt(1), requests: BigInt(1), date }] })
  expect((await readSettingsUsage({ email: "user@example.com" }, f.dependencies)).source).toBe("unavailable")
})

test("database aggregation reports large request counts independently of history's latest 50", async () => {
  const f = fixture({ rows: [{ kind: "inference", status: "settled", credits: BigInt(150_125_000), requests: BigInt(60_000), date }] })
  const result = await readSettingsUsage({ email: "user@example.com" }, f.dependencies)
  expect(result.spentCredits).toBe(150.125)
  expect(result.categories[0]?.requests).toBe(60_000)
  expect(result.history.length).toBeLessThanOrEqual(50)
  expect(f.queries.find((sql) => sql.includes("GROUP BY"))).not.toContain("LIMIT")
})

test("authentication failures do not expose a success-shaped zero balance", async () => {
  const f = fixture()
  const result = await readSettingsUsage({ email: "user@example.com" }, {
    ...f.dependencies, authenticate: async () => { throw new Error("No harness session") },
  })
  expect(result.source).toBe("unavailable")
  expect(result.balanceCredits).toBeNull()
  expect(f.queries).toEqual([])
})

test("a missing reservation schema does not report a successful empty month after balance succeeds", async () => {
  const f = fixture()
  const database = await f.dependencies.database()
  const result = await readSettingsUsage({ email: "user@example.com" }, {
    ...f.dependencies,
    database: async () => ({
      $transaction: (operation) => database.$transaction((tx) => operation({
        ...tx,
        $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]): Promise<T> => {
          if (sql.includes("credit_reservation")) throw new Error("relation credit_reservation does not exist")
          return tx.$queryRawUnsafe<T>(sql, ...values)
        },
      })),
    }),
  })
  expect(result.source).toBe("unavailable")
  expect(result.allowanceCredits).toBeNull()
  expect(result.balanceCredits).toBeNull()
  expect(result.spentCredits).toBeNull()
})

test("history uses only safe model, provider, and tool metadata, with category fallbacks", async () => {
  const rows: Row[] = [
    { kind: "inference", status: "settled", credits: BigInt(1), requests: BigInt(1), date, metadata: { model: "gpt-5.4" } },
    { kind: "sandbox_wall_time", status: "settled", credits: BigInt(1), requests: BigInt(1), date, metadata: { provider: "e2b" } },
    { kind: "mcp", status: "settled", credits: BigInt(1), requests: BigInt(1), date, metadata: { toolName: "github.search" } },
    { kind: "hosted_search", status: "settled", credits: BigInt(1), requests: BigInt(1), date, metadata: { toolName: "exa_search" } },
    { kind: "inference", status: "settled", credits: BigInt(1), requests: BigInt(1), date, metadata: { model: { unexpected: true }, secret: "never-return" } },
    { kind: "mcp", status: "settled", credits: BigInt(1), requests: BigInt(1), date, metadata: { toolName: "  slack\nsearch  " } },
  ]
  const result = await readSettingsUsage({ email: "user@example.com" }, fixture({ rows }).dependencies)
  expect(result.history.map((entry) => entry.label)).toEqual(["gpt-5.4", "e2b", "github.search", "exa_search", "Models", "slacksearch"])
  expect(JSON.stringify(result)).not.toContain("never-return")
})

for (const invalid of ["mismatched-email", "expired", "missing"]) {
  test(`authentication rejects ${invalid} before querying any ledger`, async () => {
    const f = fixture()
    if (invalid === "mismatched-email") f.session.user.email = "other@example.com"
    if (invalid === "expired") f.session.expiresAt = start
    const result = await readSettingsUsage({ email: "user@example.com" }, {
      ...f.dependencies,
      authenticate: invalid === "missing" ? async () => null : f.dependencies.authenticate,
    })
    expect(result.source).toBe("unavailable")
    expect(f.queries).toEqual([])
  })
}
