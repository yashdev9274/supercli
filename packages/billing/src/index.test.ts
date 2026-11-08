import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { PGlite } from "@electric-sql/pglite"
import {
  createBillingService,
  calcMcpMicrocredits,
  calcSandboxMicrocredits,
  estimateSandboxCostUsd,
  providerCostToMicrocredits,
  type BillingDatabase,
  type BillingTransaction,
} from "./index"

const db = new PGlite()
let failStatement = ""
const adapter: BillingDatabase = {
  async $transaction(operation) {
    return db.transaction(async (transaction) => {
      const tx: BillingTransaction = {
        async $queryRawUnsafe<T>(sql: string, ...values: unknown[]) {
          if (failStatement && sql.includes(failStatement)) throw new Error("Injected storage failure")
          const result = await transaction.query(sql, values)
          return result.rows as T
        },
        async $executeRawUnsafe(sql, ...values) {
          if (failStatement && sql.includes(failStatement)) throw new Error("Injected storage failure")
          return (await transaction.query(sql, values)).affectedRows ?? 0
        },
      }
      return operation(tx)
    })
  },
}
const service = createBillingService(adapter)
const reserve = (key: string, amountMicrocredits: number) => service.reserve({ userId: "user", key, kind: "test", amountMicrocredits })

beforeAll(async () => {
  await db.exec(`CREATE TABLE "user" (id TEXT PRIMARY KEY);
    CREATE TABLE plan (id TEXT PRIMARY KEY, tier TEXT, "creditAmountCents" INTEGER, name TEXT, "contextLimit" INTEGER);
    CREATE TABLE subscription ("userId" TEXT, "planId" TEXT, status TEXT, "currentPeriodEnd" TIMESTAMP, "createdAt" TIMESTAMP DEFAULT NOW());`)
  await db.exec(await Bun.file(new URL("../../../apps/supercode-cli/server/prisma/migrations/20261108000000_durable_product_credits/migration.sql", import.meta.url)).text())
})

beforeEach(async () => {
  failStatement = ""
  await db.exec(`TRUNCATE credit_reservation, credit_account, subscription, plan, "user" CASCADE; INSERT INTO "user" VALUES ('user');`)
})

afterAll(async () => { await db.close() })

describe("durable product credits", () => {
  it("provisions new Free users at exactly 1000 product credits", async () => {
    const balance = await service.getBalance("user")
    expect(balance.balanceCredits).toBe(1000)
    expect(balance.balanceMicrocredits).toBe(1_000_000_000)
    expect(balance.resetAt.getUTCDate()).toBe(1)
  })

  it("gives grandfathered Spark the same allowance despite legacy plan amount", async () => {
    await db.exec(`INSERT INTO plan (id,tier,"creditAmountCents","monthlyCredits") VALUES ('spark','spark',500,500); INSERT INTO subscription ("userId","planId",status) VALUES ('user','spark','active');`)
    expect((await service.getBalance("user")).allowanceCredits).toBe(1000)
  })

  it("enforces exhausted credits before work and preserves fractional calls", async () => {
    const tiny = await reserve("tiny", 3)
    await service.settle({ reservationId: tiny.id, actualMicrocredits: 1 })
    await reserve("rest", 999_999_999)
    await expect(reserve("denied", 1)).rejects.toThrow("exhausted")
    expect((await service.getBalance("user")).balanceMicrocredits).toBe(0)
  })

  it("atomically admits only funded concurrent reservations", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => reserve(String(i), 300_000_000)))
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3)
    expect((await service.getBalance("user")).balanceMicrocredits).toBe(100_000_000)
  })

  it("replays reserve and settlement exactly once across service instances", async () => {
    const initial = await reserve("same", 100)
    const other = createBillingService(adapter)
    const replay = await other.reserve({ userId: "user", key: "same", kind: "test", amountMicrocredits: 100 })
    expect(replay.id).toBe(initial.id)
    expect(replay.replayed).toBe(true)
    await other.settle({ reservationId: initial.id, actualMicrocredits: 40 })
    expect((await service.settle({ reservationId: initial.id, actualMicrocredits: 40 })).replayed).toBe(true)
    expect((await service.getBalance("user")).balanceMicrocredits).toBe(999_999_960)
    await expect(service.settle({ reservationId: initial.id, actualMicrocredits: 39 })).rejects.toThrow("differs")
    await expect(reserve("same", 101)).rejects.toThrow("different charge")
    expect((await other.getReservation({ userId: "user", key: "same" }))?.status).toBe("settled")
  })

  it("rolls back the debit when ledger insertion fails", async () => {
    await service.getBalance("user")
    failStatement = "INSERT INTO credit_reservation"
    await expect(reserve("failed", 100)).rejects.toThrow("Injected")
    failStatement = ""
    expect((await service.getBalance("user")).balanceMicrocredits).toBe(1_000_000_000)
    expect(await service.getReservation({ userId: "user", key: "failed" })).toBeNull()
  })

  it("rolls back refunds on settlement failure and retries safely", async () => {
    const reservation = await reserve("retry", 100)
    failStatement = "UPDATE credit_reservation"
    await expect(service.settle({ reservationId: reservation.id, actualMicrocredits: 20 })).rejects.toThrow("Injected")
    failStatement = ""
    expect((await service.getBalance("user")).balanceMicrocredits).toBe(999_999_900)
    await service.settle({ reservationId: reservation.id, actualMicrocredits: 20 })
    expect((await service.getBalance("user")).balanceMicrocredits).toBe(999_999_980)
  })

  it("does not mint a new-period refund for an old reservation", async () => {
    const reservation = await reserve("old", 100)
    await db.exec(`UPDATE credit_account SET "periodStart"='2020-01-01', "resetAt"='2020-02-01'; UPDATE credit_reservation SET "periodStart"='2020-01-01';`)
    await service.settle({ reservationId: reservation.id, actualMicrocredits: 20 })
    expect((await service.getBalance("user")).balanceMicrocredits).toBe(1_000_000_000)
    expect((await service.getReservation({ userId: "user", key: "old" }))?.actualMicrocredits).toBe(20)
  })

  it("holds unknown/abandoned usage until explicit recovery and forbids oversettlement", async () => {
    const reservation = await reserve("unknown", 100)
    await expect(service.settle({ reservationId: reservation.id, actualMicrocredits: 101 })).rejects.toThrow("exceeds")
    expect((await service.getBalance("user")).balanceMicrocredits).toBe(999_999_900)
    await service.settle({ reservationId: reservation.id, actualMicrocredits: reservation.reservedMicrocredits })
    expect((await service.getBalance("user")).balanceMicrocredits).toBe(999_999_900)
  })

  it("rejects invalid amounts and missing users instead of granting unmetered work", async () => {
    await expect(reserve("bad", 0.1)).rejects.toThrow("safe integer")
    await expect(service.getBalance("missing")).rejects.toThrow()
  })

  it("preserves consumed credits across upgrades and downgrades without repeatable topups", async () => {
    await reserve("free-spend", 700_000_000)
    await db.exec(`INSERT INTO plan (id,tier,"creditAmountCents","monthlyCredits") VALUES ('paid','pro',2000,2000); INSERT INTO subscription ("userId","planId",status) VALUES ('user','paid','active');`)
    expect((await service.getBalance("user")).balanceCredits).toBe(1300)
    await reserve("paid-spend", 800_000_000)
    await db.exec(`UPDATE subscription SET status='cancelled';`)
    expect((await service.getBalance("user")).balanceCredits).toBe(0)
    await db.exec(`UPDATE subscription SET status='active';`)
    expect((await service.getBalance("user")).balanceCredits).toBe(500)
    expect((await service.getBalance("user")).balanceCredits).toBe(500)
  })

  it("retries serialization conflicts but never treats database outages as allowance", async () => {
    let attempts = 0
    const transient: BillingDatabase = {
      async $transaction(operation, options) {
        attempts++
        if (attempts === 1) throw Object.assign(new Error("serialize"), { code: "P2034" })
        return adapter.$transaction(operation, options)
      },
    }
    expect((await createBillingService(transient).getBalance("user")).balanceCredits).toBe(1000)
    expect(attempts).toBe(2)
    const unavailable: BillingDatabase = { async $transaction() { throw new Error("database unavailable") } }
    await expect(createBillingService(unavailable).reserve({ userId: "user", key: "failure", kind: "test", amountMicrocredits: 1 })).rejects.toThrow("database unavailable")
  })
})

describe("explicit provider conversion", () => {
  it("converts $5 provider cost to the $10 retail/1000-credit allowance at 2x", () => {
    expect(providerCostToMicrocredits(5, { creditsPerUsd: 100, providerMarkup: 2 })).toBe(1_000_000_000)
    expect(providerCostToMicrocredits(0.000000001)).toBe(1)
  })

  it("charges every CPU and RAM second including one-CPU machines", () => {
    expect(estimateSandboxCostUsd({ vcpus: 1, memoryMb: 1024 }, 60)).toBeCloseTo(60 * (0.000014 + 0.0000045), 10)
    expect(calcSandboxMicrocredits({ vcpus: 1, memoryMb: 1024 }, 1)).toBeGreaterThan(0)
    expect(estimateSandboxCostUsd({ vcpus: 2, memoryMb: 2048 }, 60)).toBeCloseTo(estimateSandboxCostUsd({ vcpus: 1, memoryMb: 1024 }, 60) * 2, 10)
  })

  it("preserves per-call MCP fractions as integer microcredits", () => {
    expect(calcMcpMicrocredits("github_create_issue")).toBe(400_000)
    expect(calcMcpMicrocredits("gmail_send_email")).toBe(1_000_000)
  })
})
