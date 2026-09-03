import { beforeEach, describe, expect, it, mock } from "bun:test"

const findManyMock = mock(async () => [] as Array<{ slug: string; minTier: string }>)

;(mock as any).module("../prisma", () => ({
  default: {
    model: {
      findMany: findManyMock,
    },
  },
}))

const { isModelAllowedForTier, invalidateModelCache, getUpgradeSuggestion } =
  await import("../model-access")

beforeEach(() => {
  findManyMock.mockReset()
  invalidateModelCache()
})

describe("isModelAllowedForTier — open models on Spark", () => {
  it("allows stealth/ox-alpha for spark even when DB has no rows", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("stealth/ox-alpha", "spark")
    expect(ok).toBe(true)
  })

  it("allows ox-alpha bare slug for spark grandfathered", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("ox-alpha", "spark")
    expect(ok).toBe(true)
  })

  it("allows stealth/ox-alpha when DB row exists with minTier spark", async () => {
    findManyMock.mockResolvedValueOnce([
      { slug: "stealth/ox-alpha", minTier: "spark" },
    ])
    const ok = await isModelAllowedForTier("stealth/ox-alpha", "spark")
    expect(ok).toBe(true)
  })

  it("denies pro models for spark", async () => {
    findManyMock.mockResolvedValueOnce([
      { slug: "anthropic/claude-sonnet-4.6", minTier: "pro" },
    ])
    const ok = await isModelAllowedForTier("anthropic/claude-sonnet-4.6", "spark")
    expect(ok).toBe(false)
  })

  it("allows deepseek open models for spark via static catalog", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("deepseek-v4-flash", "spark")
    expect(ok).toBe(true)
  })

  it("fails open for known open models when DB throws", async () => {
    findManyMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const ok = await isModelAllowedForTier("stealth/ox-alpha", "spark")
    expect(ok).toBe(true)
  })

  it("still denies unknown premium-looking slugs when missing", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("anthropic/claude-opus-secret", "spark")
    expect(ok).toBe(false)
  })
})

describe("getUpgradeSuggestion", () => {
  it("points spark users at Spark Premium", () => {
    expect(getUpgradeSuggestion("spark")).toContain("Spark Premium")
  })
})
