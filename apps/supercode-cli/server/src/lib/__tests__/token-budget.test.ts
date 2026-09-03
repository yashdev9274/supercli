import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import os from "node:os"
import { mock as mockApi } from "bun:test"

const TEST_HOME = mkdtempSync("/tmp/supercode-token-budget-test-")
const CONFIG_DIR = join(TEST_HOME, ".config", "supercode")

type AggregateFn = (args: unknown) => Promise<unknown>
const aggregateMock = mockApi<AggregateFn>(async () => ({ _sum: { totalTokens: 0 } }))

;(mock as any).module("node:os", () => ({
  ...(os as Record<string, unknown>),
  default: { ...os, homedir: () => TEST_HOME },
  homedir: () => TEST_HOME,
}))

;(mock as any).module("../prisma", () => ({
  default: {
    usageEvent: { aggregate: aggregateMock },
  },
}))

const {
  DAILY_BUDGET_TOKENS,
  OPUS_DAILY_LIMIT,
  appendProxyUsage,
  checkDailyOpusLimit,
  checkDailyTokenBudget,
  getDailyOpusCount,
  getDailyTokenUsage,
  getOrCreateDeviceId,
  getProxyUsageForUser,
  getUserDailyUsage,
  incrementDailyOpusCount,
} = await import("../token-budget")

beforeAll(() => {
  rmSync(CONFIG_DIR, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(TEST_HOME, { recursive: true, force: true })
})

beforeEach(() => {
  aggregateMock.mockReset()
  rmSync(CONFIG_DIR, { recursive: true, force: true })
})

async function writeProxyEvents(events: unknown[]): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises")
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(join(CONFIG_DIR, "proxy-usage.json"), JSON.stringify(events))
}

describe("getOrCreateDeviceId", () => {
  it("creates and persists a device id", async () => {
    const first = await getOrCreateDeviceId()
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    const second = await getOrCreateDeviceId()
    expect(second).toBe(first)
  })
})

describe("daily token budget", () => {
  it("sums DB usage and proxy usage for a user", async () => {
    aggregateMock.mockResolvedValueOnce({ _sum: { totalTokens: 250_000 } })
    await writeProxyEvents([
      { userId: "u1", totalTokens: 50_000, timestamp: Date.now() },
    ])
    expect(await getDailyTokenUsage("u1")).toBe(300_000)
  })

  it("counts only DB usage when no user is given", async () => {
    aggregateMock.mockResolvedValueOnce({ _sum: { totalTokens: 9_000 } })
    await writeProxyEvents([
      { userId: "u1", totalTokens: 50_000, timestamp: Date.now() },
    ])
    expect(await getDailyTokenUsage()).toBe(9_000)
  })

  it("fails open to proxy usage when the DB errors", async () => {
    aggregateMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    await writeProxyEvents([
      { userId: "u1", totalTokens: 5_000, timestamp: Date.now() },
    ])
    expect(await getDailyTokenUsage("u1")).toBe(5_000)
  })

  it("blocks requests that reach the daily budget", async () => {
    aggregateMock.mockResolvedValueOnce({ _sum: { totalTokens: 1_200_000 } })
    await expect(checkDailyTokenBudget("u1")).rejects.toThrow(/daily limit/)
  })

  it("allows usage under the budget and reports remaining", async () => {
    aggregateMock.mockResolvedValue({ _sum: { totalTokens: 10_000 } })
    await expect(checkDailyTokenBudget("u1")).resolves.toBeUndefined()
    const usage = await getUserDailyUsage("u1")
    expect(usage.used).toBe(10_000)
    expect(usage.limit).toBe(DAILY_BUDGET_TOKENS)
    expect(usage.remaining).toBe(DAILY_BUDGET_TOKENS - 10_000)
  })
})

describe("daily opus limit", () => {
  it("starts at zero and increments", async () => {
    expect(await getDailyOpusCount()).toBe(0)
    await incrementDailyOpusCount()
    await incrementDailyOpusCount()
    expect(await getDailyOpusCount()).toBe(2)
  })

  it("blocks past the opus cap", async () => {
    const now = new Date()
    const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`
    const { mkdir, writeFile } = await import("node:fs/promises")
    await mkdir(CONFIG_DIR, { recursive: true })
    await writeFile(join(CONFIG_DIR, "opus-usage.json"), JSON.stringify({ date: today, count: 20 }))
    await expect(checkDailyOpusLimit()).rejects.toThrow(/Opus 4.8 daily limit/)
  })

  it("resets the count when the calendar date changes", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises")
    await mkdir(CONFIG_DIR, { recursive: true })
    await writeFile(
      join(CONFIG_DIR, "opus-usage.json"),
      JSON.stringify({ date: "2000-01-01", count: 20 }),
    )
    expect(await getDailyOpusCount()).toBe(0)
    expect(OPUS_DAILY_LIMIT).toBe(20)
  })
})

describe("proxy usage tracking", () => {
  it("sums only today's events for the matching user", async () => {
    const now = Date.now()
    await writeProxyEvents([
      { userId: "u1", totalTokens: 100, timestamp: now },
      { userId: "u1", totalTokens: 200, timestamp: now - 86_400_000 }, // yesterday
      { userId: "u2", totalTokens: 500, timestamp: now },
    ])
    expect(await getProxyUsageForUser("u1")).toBe(100)
    expect(await getProxyUsageForUser("u2")).toBe(500)
    expect(await getProxyUsageForUser("missing")).toBe(0)
  })

  it("appends events and prunes entries older than 48h", async () => {
    const now = Date.now()
    await writeProxyEvents([
      { userId: "u1", totalTokens: 9000, timestamp: now - 86_400_000 * 3 },
    ])
    await appendProxyUsage({ userId: "u1", totalTokens: 10, timestamp: now } as never)
    expect(await getProxyUsageForUser("u1")).toBe(10)
    const { readFile } = await import("node:fs/promises")
    const persisted = JSON.parse(await readFile(join(CONFIG_DIR, "proxy-usage.json"), "utf-8"))
    expect(persisted).toHaveLength(1)
  })

  it("returns zero when no proxy usage file exists", async () => {
    expect(await getProxyUsageForUser("u1")).toBe(0)
  })
})
