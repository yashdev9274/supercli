import { expect, test } from "bun:test"
import { PGlite } from "@electric-sql/pglite"

import { readSettingsUsage } from "../../../apps/web/modules/nova/settings/usage-reporting"
import { createBillingService, type BillingTransaction } from "./index"

const db = new PGlite()

test("reporting SQL shares real balance/refunds, excludes other users and periods, and limits only history", async () => {
  try {
    await db.exec(`CREATE TABLE "user" (id TEXT PRIMARY KEY);
      CREATE TABLE plan (id TEXT PRIMARY KEY, tier TEXT, "creditAmountCents" INTEGER, name TEXT, "contextLimit" INTEGER);
      CREATE TABLE subscription ("userId" TEXT, "planId" TEXT, status TEXT, metadata JSONB, "currentPeriodEnd" TIMESTAMP, "createdAt" TIMESTAMP DEFAULT NOW());`)
    await db.exec(await Bun.file(new URL("../../../apps/supercode-cli/server/prisma/migrations/20261108000000_durable_product_credits/migration.sql", import.meta.url)).text())
    await db.exec(`INSERT INTO "user" VALUES ('self'), ('other');
      INSERT INTO plan (id, tier, "monthlyCredits") VALUES ('free', 'spark', 500);
      INSERT INTO subscription ("userId", "planId", status, metadata) VALUES ('self', 'free', 'active', '{"grandfathered":true}');`)
    const adapter = {
      async $queryRawUnsafe<T>(sql: string, ...values: unknown[]) {
        return (await db.query(sql, values)).rows as T
      },
      async $transaction<T>(operation: (tx: BillingTransaction) => Promise<T>) {
        return db.transaction(async (tx) => operation({
          async $queryRawUnsafe<R>(sql: string, ...values: unknown[]) { return (await tx.query(sql, values)).rows as R },
          async $executeRawUnsafe(sql: string, ...values: unknown[]) { return (await tx.query(sql, values)).affectedRows ?? 0 },
        }))
      },
    }
    const billing = createBillingService(adapter)
    const balance = await billing.getBalance("self")
    const reserve = (key: string, kind: string, amountMicrocredits: number, userId = "self") =>
      billing.reserve({ userId, key, kind, amountMicrocredits })
    const model = await reserve("refunded-model", "inference", 1_000_000)
    await billing.settle({ reservationId: model.id, actualMicrocredits: 125_000 })
    const machine = await reserve("machine", "sandbox_wall_time", 500_000)
    await billing.settle({ reservationId: machine.id, actualMicrocredits: 500_000 })
    const search = await reserve("search", "hosted_search", 125_000)
    await billing.settle({ reservationId: search.id, actualMicrocredits: 125_000 })
    await reserve("held-mcp", "mcp", 250_000)
    await reserve("other-user", "mcp", 100_000_000, "other")
    for (let index = 0; index < 75; index++) {
      const micro = await reserve(String(index), "mcp", 1)
      await billing.settle({ reservationId: micro.id, actualMicrocredits: 1 })
    }
    const oldPeriod = new Date(balance.periodStart.getTime() - 86_400_000)
    await db.query(`INSERT INTO credit_reservation
      (id, "userId", key, kind, "periodStart", status, "reservedMicrocredits", "actualMicrocredits", "createdAt")
      VALUES ('old-period', 'self', 'old-period', 'inference', $1, 'settled', 900000000, 900000000, NOW()),
        ('old-created', 'self', 'old-created', 'inference', $2, 'settled', 900000000, 900000000, $1)`,
    [oldPeriod, balance.periodStart])
    await db.exec("SET TIME ZONE 'America/Los_Angeles'")
    const now = new Date()
    const result = await readSettingsUsage({ email: "self@example.com" }, {
      authenticate: async () => ({ userId: "self", expiresAt: balance.resetAt, user: { email: "self@example.com" } }),
      database: async () => adapter,
      now,
    })
    expect(result.source).toBe("ledger")
    expect(result.allowanceCredits).toBe(1000)
    expect(result.isGrandfathered).toBe(true)
    expect(result.spentCredits).toBeCloseTo(0.750075, 6)
    expect(result.reservedCredits).toBe(0.25)
    expect(result.balanceCredits).toBeCloseTo(998.999925, 6)
    expect(result.history).toHaveLength(50)
    expect(result.history.some((entry) => entry.id === "old-period" || entry.id === "old-created")).toBe(false)
    expect(result.categories.map((entry) => entry.requests)).toEqual([1, 1, 77])
    expect(result.daily.reduce((sum, day) => sum + day.modelCredits + day.machineCredits + day.mcpCredits, 0)).toBeCloseTo(0.750075, 6)
  } finally {
    await db.close()
  }
})
