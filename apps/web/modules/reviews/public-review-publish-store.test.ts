import { describe, expect, mock, test } from "bun:test"

import { createPublicReviewPublishStore, PUBLIC_REVIEW_PUBLISH_LIMITS } from "./public-review-publish-store"

type CacheRow = {
  key: string
  inputHash: string
  status: string
  leaseToken: string | null
  leaseUntil: Date | null
  expiresAt: Date
  markdown: string | null
}
type QuotaRow = { key: string; count: number; expiresAt: Date }
type Where = {
  key: string | { startsWith: string }
  leaseToken?: string
  leaseUntil?: { gt: Date }
  expiresAt?: { lte: Date }
}

function databaseHarness() {
  let cache = new Map<string, CacheRow>()
  let quotas = new Map<string, QuotaRow>()
  const state = { now: new Date("2026-10-05T12:00:00Z"), available: true, failure: false }
  const matches = (row: CacheRow | QuotaRow, where: Where) => {
    return (typeof where.key === "string" ? row.key === where.key : row.key.startsWith(where.key.startsWith))
      && (!where.expiresAt || row.expiresAt <= where.expiresAt.lte)
      && (!where.leaseToken || ("leaseToken" in row && row.leaseToken === where.leaseToken))
      && (!where.leaseUntil || ("leaseUntil" in row && row.leaseUntil !== null && row.leaseUntil > where.leaseUntil.gt))
  }
  const remove = <T extends CacheRow | QuotaRow>(rows: Map<string, T>, where: Where) => {
    let count = 0
    for (const [key, row] of rows) {
      if (matches(row, where)) {
        rows.delete(key)
        count += 1
      }
    }
    return { count }
  }
  const tx = {
    $queryRaw: mock(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("").includes("clock_timestamp")) return [{ now: state.now, locked: state.available }]
      const [key, expiresAt, limit] = values as [string, Date, number]
      const row = quotas.get(key)
      if (row && row.count >= limit) return []
      const count = (row?.count ?? 0) + 1
      quotas.set(key, { key, count, expiresAt: row?.expiresAt ?? expiresAt })
      return [{ count }]
    }),
    publicReviewCache: {
      findUnique: mock(async ({ where }: { where: { key: string } }) => cache.get(where.key) ?? null),
      count: mock(async ({ where }: { where: Where }) => [...cache.values()].filter((row) => matches(row, where)).length),
      deleteMany: mock(async ({ where }: { where: Where }) => remove(cache, where)),
      upsert: mock(async ({ where, create, update }: { where: { key: string }; create: CacheRow; update: Omit<CacheRow, "key"> }) => {
        const row = cache.has(where.key) ? { key: where.key, ...update } : create
        cache.set(where.key, row)
        return row
      }),
    },
    publicReviewQuota: {
      deleteMany: mock(async ({ where }: { where: Where }) => remove(quotas, where)),
    },
  }
  let transactionHeld = false
  const database = {
    $transaction: mock(async (work: (client: typeof tx) => Promise<unknown>) => {
      if (state.failure) throw new Error("secret-database-detail")
      if (transactionHeld) throw new Error("connection-busy")
      transactionHeld = true
      const oldCache = new Map(cache)
      const oldQuotas = new Map(quotas)
      try {
        return await work(tx)
      } catch (error) {
        cache = oldCache
        quotas = oldQuotas
        throw error
      } finally {
        transactionHeld = false
      }
    }),
  }
  const store = () => createPublicReviewPublishStore(database as unknown as NonNullable<Parameters<typeof createPublicReviewPublishStore>[0]>, "test-publish")
  const count = (lane: string) => [...quotas.values()].filter((row) => row.key.includes(`:${lane}:`)).reduce((sum, row) => sum + row.count, 0)
  return { state, store, tx, database, count, cache: () => cache, quotas: () => quotas }
}

describe("persistent publish quotas and leases with injected storage", () => {
  test("source-fetch attempt charges the user and global lane before returning a lease", async () => {
    const h = databaseHarness()
    const lease = await h.store().begin("user-a", "acme/api#42")
    expect(lease.key).toMatch(/^test-publish:lock:[a-f\d]{64}:[a-f\d]{64}$/)
    expect(lease.key).not.toContain("user-a")
    expect(h.count("fetch-hour")).toBe(2)
    expect(h.count("write-hour")).toBe(0)
    expect(h.cache().get(lease.key)).toMatchObject({ leaseToken: lease.token, status: "pending" })
    expect(h.database.$transaction).toHaveBeenCalled()
    expect(h.tx.$queryRaw.mock.calls[0][0].join("")).toContain("pg_try_advisory_xact_lock")
  })

  test("the same user and PR deduplicate across store restarts but other users are independent", async () => {
    const h = databaseHarness()
    const first = await h.store().begin("user-a", "acme/api#42")
    await expect(h.store().begin("user-a", "acme/api#42")).rejects.toMatchObject({ status: 409 })
    const other = await h.store().begin("user-b", "acme/api#42")
    expect(other.key).not.toBe(first.key)
    expect(h.cache().size).toBe(2)
    expect(h.count("fetch-hour")).toBe(4)
  })

  test("user concurrency is bounded independently of global concurrency", async () => {
    const h = databaseHarness()
    await h.store().begin("user-a", "pr-1")
    await h.store().begin("user-a", "pr-2")
    await expect(h.store().begin("user-a", "pr-3")).rejects.toMatchObject({ status: 429 })
    expect(h.count("fetch-hour")).toBe(4)
    expect(await h.store().begin("user-b", "pr-3")).toHaveProperty("token")
  })

  test("global concurrency prevents further source fetches", async () => {
    const h = databaseHarness()
    for (let index = 0; index < PUBLIC_REVIEW_PUBLISH_LIMITS.globalConcurrency; index += 1) await h.store().begin(`user-${index}`, "pr")
    await expect(h.store().begin("next-user", "pr")).rejects.toMatchObject({ status: 429 })
    expect(h.count("fetch-hour")).toBe(2 * PUBLIC_REVIEW_PUBLISH_LIMITS.globalConcurrency)
  })

  test("released and failed attempts retain per-user fetch usage across restarts", async () => {
    const h = databaseHarness()
    for (let index = 0; index < PUBLIC_REVIEW_PUBLISH_LIMITS.fetchUserHourly; index += 1) {
      const store = h.store()
      const lease = await store.begin("user-a", `pr-${index}`)
      await store.release(lease)
    }
    await expect(h.store().begin("user-a", "new-pr")).rejects.toMatchObject({ status: 429 })
    expect(h.cache().size).toBe(0)
    expect(h.count("fetch-hour")).toBe(2 * PUBLIC_REVIEW_PUBLISH_LIMITS.fetchUserHourly)
    expect(await h.store().begin("user-b", "new-pr")).toHaveProperty("token")
  })

  test("write attempts are durable and independently bounded", async () => {
    const h = databaseHarness()
    for (let index = 0; index < PUBLIC_REVIEW_PUBLISH_LIMITS.writeUserHourly; index += 1) {
      const store = h.store()
      const lease = await store.begin("user-a", `pr-${index}`)
      await store.reserveWrite("user-a", lease)
      await store.release(lease)
    }
    const store = h.store()
    const lease = await store.begin("user-a", "new-pr")
    await expect(store.reserveWrite("user-a", lease)).rejects.toMatchObject({ status: 429 })
    expect(h.count("write-hour")).toBe(2 * PUBLIC_REVIEW_PUBLISH_LIMITS.writeUserHourly)
    expect(h.count("write-day")).toBe(PUBLIC_REVIEW_PUBLISH_LIMITS.writeUserHourly)
  })

  test("expired leases are reclaimable and stale releases cannot unlock a new attempt", async () => {
    const h = databaseHarness()
    const store = h.store()
    const first = await store.begin("user-a", "pr")
    h.state.now = new Date(h.state.now.getTime() + PUBLIC_REVIEW_PUBLISH_LIMITS.leaseMs + 1)
    const next = await h.store().begin("user-a", "pr")
    expect(next.key).toBe(first.key)
    expect(next.token).not.toBe(first.token)
    await expect(store.assertLease(first)).rejects.toMatchObject({ status: 409 })
    await expect(store.reserveWrite("user-a", first)).rejects.toMatchObject({ status: 409 })
    await store.release(first)
    expect(h.cache().get(next.key)?.leaseToken).toBe(next.token)
    await store.assertLease(next)
    await store.release(next)
    expect(h.cache().size).toBe(0)
  })

  test("expired quota windows are cleaned and reset with database time", async () => {
    const h = databaseHarness()
    const store = h.store()
    await store.release(await store.begin("user-a", "pr"))
    expect(h.quotas().size).toBe(2)
    h.state.now = new Date("2026-10-05T13:00:01Z")
    await store.begin("user-a", "pr")
    expect(h.quotas().size).toBe(2)
    expect(h.count("fetch-hour")).toBe(2)
  })

  test("the daily write allowance survives hourly resets", async () => {
    const h = databaseHarness()
    for (let hour = 0; hour < 5; hour += 1) {
      h.state.now = new Date(`2026-10-05T${12 + hour}:00:00Z`)
      for (let index = 0; index < PUBLIC_REVIEW_PUBLISH_LIMITS.writeUserHourly; index += 1) {
        const store = h.store()
        const lease = await store.begin("user-a", `pr-${hour}-${index}`)
        await store.reserveWrite("user-a", lease)
        await store.release(lease)
      }
    }
    h.state.now = new Date("2026-10-05T17:00:00Z")
    const store = h.store()
    const lease = await store.begin("user-a", "new-pr")
    await expect(store.reserveWrite("user-a", lease)).rejects.toMatchObject({ status: 429 })
    expect(h.count("write-day")).toBe(PUBLIC_REVIEW_PUBLISH_LIMITS.writeUserDaily)
    expect(h.count("write-hour")).toBe(0)
    h.state.now = new Date("2026-10-06T00:00:00Z")
    const next = await store.begin("user-a", "new-pr")
    await store.reserveWrite("user-a", next)
    expect(h.count("write-day")).toBe(1)
  })

  test("a global write denial rolls back the user hourly and daily write counters", async () => {
    const h = databaseHarness()
    const store = h.store()
    const lease = await store.begin("user-a", "pr")
    const bucket = Math.floor(h.state.now.getTime() / 3_600_000)
    const key = `test-publish:write-hour:global:${bucket}`
    h.quotas().set(key, { key, count: PUBLIC_REVIEW_PUBLISH_LIMITS.writeGlobalHourly, expiresAt: new Date((bucket + 1) * 3_600_000) })
    await expect(store.reserveWrite("user-a", lease)).rejects.toMatchObject({ status: 429 })
    expect(h.count("write-hour")).toBe(PUBLIC_REVIEW_PUBLISH_LIMITS.writeGlobalHourly)
    expect(h.count("write-day")).toBe(0)
    expect(h.cache().get(lease.key)?.leaseToken).toBe(lease.token)
  })

  test("failed global quota consumes neither a partial user counter nor a lock", async () => {
    const h = databaseHarness()
    const now = h.state.now.getTime()
    const bucket = Math.floor(now / 3_600_000)
    const key = `test-publish:fetch-hour:global:${bucket}`
    h.quotas().set(key, { key, count: PUBLIC_REVIEW_PUBLISH_LIMITS.fetchGlobalHourly, expiresAt: new Date((bucket + 1) * 3_600_000) })
    await expect(h.store().begin("user-a", "pr")).rejects.toMatchObject({ status: 429 })
    expect(h.quotas().size).toBe(1)
    expect(h.cache().size).toBe(0)
  })

  test("transaction contention fails closed without waiting on an advisory lock", async () => {
    const h = databaseHarness()
    h.state.available = false
    await expect(h.store().begin("user-a", "pr")).rejects.toMatchObject({ status: 429 })
    expect(h.cache().size).toBe(0)
    expect(h.quotas().size).toBe(0)
  })

  test("database failure is sanitized and never returns a usable lease", async () => {
    const h = databaseHarness()
    h.state.failure = true
    await expect(h.store().begin("user-a", "pr")).rejects.toMatchObject({ status: 503, message: "Review publishing storage is unavailable. Please try again later." })
    expect(h.cache().size).toBe(0)
    expect(h.quotas().size).toBe(0)
  })
})
