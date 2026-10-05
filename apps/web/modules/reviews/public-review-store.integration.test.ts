import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"

import prisma from "@super/db"

import { createPublicReviewStore, PUBLIC_REVIEW_QUOTAS, publicReviewQuotaLimits, type PublicReviewStore } from "./public-review-store"

const databaseTests = process.env.PUBLIC_REVIEW_DB_TEST === "1" ? describe : describe.skip
const envNames = [
  "PUBLIC_REVIEW_FETCH_GLOBAL_HOURLY",
  "PUBLIC_REVIEW_FETCH_CLIENT_HOURLY",
  "PUBLIC_REVIEW_AI_GLOBAL_HOURLY",
  "PUBLIC_REVIEW_AI_GLOBAL_DAILY",
  "PUBLIC_REVIEW_AI_CLIENT_DAILY",
  "PUBLIC_REVIEW_MAX_CONCURRENT",
]

databaseTests("durable anonymous quotas and cache (isolated namespace)", () => {
  let namespace: string
  let store: PublicReviewStore
  let env: Array<string | undefined>

  beforeAll(() => {
    env = envNames.map((name) => process.env[name])
    Object.assign(process.env, {
      PUBLIC_REVIEW_FETCH_GLOBAL_HOURLY: "10",
      PUBLIC_REVIEW_FETCH_CLIENT_HOURLY: "6",
      PUBLIC_REVIEW_AI_GLOBAL_HOURLY: "3",
      PUBLIC_REVIEW_AI_GLOBAL_DAILY: "20",
      PUBLIC_REVIEW_AI_CLIENT_DAILY: "2",
      PUBLIC_REVIEW_MAX_CONCURRENT: "2",
    })
  })
  afterAll(() => {
    for (const [index, name] of envNames.entries()) {
      if (env[index] === undefined) delete process.env[name]
      else process.env[name] = env[index]
    }
  })
  beforeEach(() => {
    namespace = `test-public-${randomUUID()}`
    store = createPublicReviewStore(prisma, namespace)
  })
  afterEach(async () => {
    await prisma.publicReviewCache.deleteMany({ where: { key: { startsWith: `${namespace}:` } } })
    await prisma.publicReviewQuota.deleteMany({ where: { key: { startsWith: `${namespace}:` } } })
  })

  const quotaCount = async (prefix: string) => (await prisma.publicReviewQuota.findFirst({ where: { key: { startsWith: `${namespace}:${prefix}:` } } }))?.count
  const finish = async (key: string, subject = "client") => {
    const reservation = await store.reserveGeneration(key, "hash", subject)
    if (!reservation.leaseToken) throw new Error("Expected owned lease")
    await store.complete(key, reservation.leaseToken, "### Summary\nDone.")
    return reservation.leaseToken
  }

  test("concurrent fetch reservations cannot exceed the global hourly budget", async () => {
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => store.reserveFetch(`client-${index}`)))
    const accepted = results.filter((result) => result.status === "fulfilled").length
    expect(accepted).toBeGreaterThan(0)
    expect(accepted).toBeLessThanOrEqual(PUBLIC_REVIEW_QUOTAS.fetchGlobalHourly)
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 429 })
    }
    for (let index = accepted; index < PUBLIC_REVIEW_QUOTAS.fetchGlobalHourly; index += 1) await store.reserveFetch(`remaining-${index}`)
    expect(await quotaCount("fetch:global")).toBe(10)
    const restarted = createPublicReviewStore(prisma, namespace)
    await expect(restarted.reserveFetch("new-client")).rejects.toMatchObject({ status: 429 })
  }, 60_000)

  test("per-client denials roll back the global counter atomically", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => store.reserveFetch("client")))
    const accepted = results.filter((result) => result.status === "fulfilled").length
    expect(accepted).toBeGreaterThan(0)
    expect(accepted).toBeLessThanOrEqual(6)
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 429 })
    }
    for (let index = accepted; index < 6; index += 1) await store.reserveFetch("client")
    await expect(store.reserveFetch("client")).rejects.toMatchObject({ status: 429 })
    expect(await quotaCount("fetch:global")).toBe(6)
    expect(await quotaCount("fetch:client")).toBe(6)
    await store.reserveFetch("other-client")
    expect(await quotaCount("fetch:global")).toBe(7)
  }, 60_000)

  test("concurrent cache reservations deduplicate and charge AI once", async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => store.reserveGeneration("acme/api#42@head", "hash", "client")))
    const fulfilled = results.filter((result) => result.status === "fulfilled")
    expect(fulfilled).toHaveLength(1)
    for (const result of results) {
      if (result.status === "rejected") expect([409, 429]).toContain(result.reason.status)
    }
    expect(await quotaCount("ai-hour:global")).toBe(1)
    expect(await quotaCount("ai-day:global")).toBe(1)
    expect(await quotaCount("ai-day:client")).toBe(1)
    const winner = fulfilled[0]
    if (winner.status !== "fulfilled" || !winner.value.leaseToken) throw new Error("Missing lease")
    await store.complete("acme/api#42@head", winner.value.leaseToken, "Cached review")
    const restarted = createPublicReviewStore(prisma, namespace)
    expect(await restarted.read("acme/api#42@head", "hash")).toMatchObject({ markdown: "Cached review" })
    expect(await restarted.reserveGeneration("acme/api#42@head", "hash", "client")).toMatchObject({ cached: { markdown: "Cached review" } })
    expect(await quotaCount("ai-day:client")).toBe(1)
  }, 60_000)

  test("AI concurrency is limited before consuming additional quotas", async () => {
    const first = await store.reserveGeneration("one", "hash", "client-1")
    await store.reserveGeneration("two", "hash", "client-2")
    await expect(store.reserveGeneration("three", "hash", "client-3")).rejects.toMatchObject({ status: 429 })
    expect(await quotaCount("ai-hour:global")).toBe(2)
    if (!first.leaseToken) throw new Error("Missing lease")
    await store.fail("one", first.leaseToken)
    expect(await store.reserveGeneration("three", "hash", "client-3")).toHaveProperty("leaseToken")
    expect(await quotaCount("ai-hour:global")).toBe(3)
  }, 60_000)

  test("client daily and global hourly AI budgets survive restarts", async () => {
    await finish("one")
    await finish("two")
    const restarted = createPublicReviewStore(prisma, namespace)
    await expect(restarted.reserveGeneration("three", "hash", "client")).rejects.toMatchObject({ status: 429 })
    expect(await quotaCount("ai-hour:global")).toBe(2)
    await finish("three", "other-client")
    await expect(restarted.reserveGeneration("four", "hash", "another-client")).rejects.toMatchObject({ status: 429 })
    expect(await quotaCount("ai-hour:global")).toBe(3)
    expect(await quotaCount("ai-day:global")).toBe(3)
  }, 60_000)

  test("failed leases cool down and recover without refunding usage", async () => {
    const first = await store.reserveGeneration("one", "hash", "client")
    if (!first.leaseToken) throw new Error("Missing lease")
    await store.fail("one", first.leaseToken)
    await expect(store.reserveGeneration("one", "hash", "client")).rejects.toMatchObject({ status: 503 })
    await prisma.publicReviewCache.update({ where: { key: `${namespace}:one` }, data: { leaseUntil: new Date(0) } })
    const second = await store.reserveGeneration("one", "hash", "client")
    expect(second.leaseToken).not.toBe(first.leaseToken)
    expect(await quotaCount("ai-day:client")).toBe(2)
    await expect(store.complete("one", first.leaseToken, "Late review")).rejects.toMatchObject({ status: 409 })
    if (!second.leaseToken) throw new Error("Missing lease")
    await store.complete("one", second.leaseToken, "Current review")
    await store.fail("one", first.leaseToken)
    expect(await store.read("one", "hash")).toMatchObject({ markdown: "Current review" })
  }, 60_000)

  test("expired pending leases are reclaimable and reject late completion", async () => {
    const first = await store.reserveGeneration("one", "hash", "client")
    if (!first.leaseToken) throw new Error("Missing lease")
    await prisma.publicReviewCache.update({ where: { key: `${namespace}:one` }, data: { leaseUntil: new Date(0) } })
    await expect(store.complete("one", first.leaseToken, "Late review")).rejects.toMatchObject({ status: 409 })
    const second = await store.reserveGeneration("one", "hash", "client")
    expect(second.leaseToken).not.toBe(first.leaseToken)
    expect(await quotaCount("ai-day:client")).toBe(2)
  }, 60_000)

  test("changed input invalidates a completed head-keyed entry", async () => {
    await finish("one")
    expect(await store.read("one", "different-hash")).toBeNull()
    const reservation = await store.reserveGeneration("one", "different-hash", "client")
    expect(reservation.leaseToken).toBeString()
    expect(await quotaCount("ai-day:client")).toBe(2)
  }, 60_000)

  test("cache TTL and quota TTL are enforced and expired rows are cleaned", async () => {
    await finish("one")
    await store.reserveFetch("client")
    await prisma.publicReviewCache.update({ where: { key: `${namespace}:one` }, data: { expiresAt: new Date(0) } })
    expect(await store.read("one", "hash")).toBeNull()
    expect(await prisma.publicReviewCache.findUnique({ where: { key: `${namespace}:one` } })).toBeNull()
    await prisma.publicReviewQuota.updateMany({ where: { key: { startsWith: `${namespace}:fetch:` } }, data: { expiresAt: new Date(0) } })
    await store.reserveFetch("client")
    expect(await quotaCount("fetch:global")).toBe(1)
    expect(await quotaCount("ai-day:client")).toBe(1)
  }, 60_000)

  test("global daily denials roll back the hourly counter and cache reservation", async () => {
    const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
    const bucket = Math.floor(clock.now.getTime() / (24 * 60 * 60 * 1000))
    await prisma.publicReviewQuota.create({ data: { key: `${namespace}:ai-day:global:${bucket}`, count: 20, expiresAt: new Date((bucket + 1) * 24 * 60 * 60 * 1000) } })
    await expect(store.reserveGeneration("one", "hash", "client")).rejects.toMatchObject({ status: 429 })
    expect(await quotaCount("ai-hour:global")).toBeUndefined()
    expect(await prisma.publicReviewCache.count({ where: { key: { startsWith: `${namespace}:` } } })).toBe(0)
  }, 60_000)

  test("bounded cache rejects new entries without charging AI", async () => {
    await prisma.publicReviewCache.createMany({ data: Array.from({ length: 256 }, (_, index) => ({ key: `${namespace}:seed-${index}`, inputHash: "hash", status: "failed", expiresAt: new Date(Date.now() + 60_000) })) })
    await expect(store.reserveGeneration("one", "hash", "client")).rejects.toMatchObject({ status: 503 })
    expect(await quotaCount("ai-hour:global")).toBeUndefined()
  }, 60_000)

  test("optional limits can reduce budget and invalid settings fail closed", async () => {
    process.env.PUBLIC_REVIEW_FETCH_GLOBAL_HOURLY = "0"
    try {
      expect(publicReviewQuotaLimits().fetchGlobalHourly).toBe(0)
      await expect(store.reserveFetch("client")).rejects.toMatchObject({ status: 429 })
      process.env.PUBLIC_REVIEW_FETCH_GLOBAL_HOURLY = "invalid"
      await expect(store.reserveFetch("client")).rejects.toMatchObject({ status: 503 })
      expect(await quotaCount("fetch:global")).toBeUndefined()
    } finally {
      process.env.PUBLIC_REVIEW_FETCH_GLOBAL_HOURLY = "10"
    }
  }, 60_000)

  test("the default daily allowance accepts ten distinct reviews and rejects the eleventh", async () => {
    process.env.PUBLIC_REVIEW_AI_GLOBAL_HOURLY = "10"
    process.env.PUBLIC_REVIEW_AI_CLIENT_DAILY = "10"
    try {
      for (let index = 0; index < 10; index += 1) await finish(`new-pr-${index}`)
      const restarted = createPublicReviewStore(prisma, namespace)
      await expect(restarted.reserveGeneration("new-pr-10", "hash", "client")).rejects.toMatchObject({
        status: 429,
        message: "The daily allowance of 10 free new PR reviews has been used. Try again after midnight UTC.",
      })
      expect(await quotaCount("ai-day:client")).toBe(10)
      expect(await quotaCount("ai-hour:global")).toBe(10)
      expect(await quotaCount("ai-day:global")).toBe(10)
      expect(await restarted.reserveGeneration("new-pr-0", "hash", "client")).toHaveProperty("cached")
      expect(await quotaCount("ai-day:client")).toBe(10)
    } finally {
      process.env.PUBLIC_REVIEW_AI_GLOBAL_HOURLY = "3"
      process.env.PUBLIC_REVIEW_AI_CLIENT_DAILY = "2"
    }
  }, 120_000)

  test("loading quota denials identify loading rather than daily AI usage", async () => {
    process.env.PUBLIC_REVIEW_FETCH_CLIENT_HOURLY = "2"
    try {
      await store.reserveFetch("client")
      await store.reserveFetch("client")
      await expect(store.reserveFetch("client")).rejects.toMatchObject({
        status: 429,
        message: "The hourly PR-loading limit (2 requests) has been reached. Previews and cached views also count. Try again after the hour resets.",
      })
      expect(await quotaCount("ai-day:client")).toBeUndefined()
      expect(await quotaCount("fetch:global")).toBe(2)
    } finally {
      process.env.PUBLIC_REVIEW_FETCH_CLIENT_HOURLY = "6"
    }
  }, 60_000)
})
