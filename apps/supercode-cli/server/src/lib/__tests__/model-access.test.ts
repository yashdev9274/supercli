import { beforeEach, describe, expect, it, mock } from "bun:test"

const findManyMock = mock(async () => [] as Array<{ slug: string; minTier: string }>)

mock.module("../prisma", () => ({
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

describe("isModelAllowedForTier — Free DeepSeek and Spark Premium hosted models", () => {
  it("denies stealth/ox-alpha for Free when DB has no rows", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("stealth/ox-alpha", "spark")
    expect(ok).toBe(false)
  })

  it("denies ox-alpha bare slug for Free", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("ox-alpha", "spark")
    expect(ok).toBe(false)
  })

  it("allows hosted open models for Spark Premium when DB has no rows", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("stealth/ox-alpha", "spark-premium")
    expect(ok).toBe(true)
  })

  it("respects a Spark Premium DB row", async () => {
    findManyMock.mockResolvedValueOnce([
      { slug: "stealth/ox-alpha", minTier: "spark-premium" },
    ])
    const free = await isModelAllowedForTier("stealth/ox-alpha", "spark")
    expect(free).toBe(false)

    invalidateModelCache()
    findManyMock.mockResolvedValueOnce([
      { slug: "stealth/ox-alpha", minTier: "spark-premium" },
    ])
    const premium = await isModelAllowedForTier("stealth/ox-alpha", "spark-premium")
    expect(premium).toBe(true)
  })

  it("denies pro models for spark", async () => {
    findManyMock.mockResolvedValueOnce([
      { slug: "anthropic/claude-sonnet-4.6", minTier: "pro" },
    ])
    const ok = await isModelAllowedForTier("anthropic/claude-sonnet-4.6", "spark")
    expect(ok).toBe(false)
  })

  it("allows only the Free DeepSeek Flash model for spark", async () => {
    findManyMock.mockResolvedValueOnce([])
    const flash = await isModelAllowedForTier("deepseek-v4-flash", "spark")
    expect(flash).toBe(true)

    invalidateModelCache()
    findManyMock.mockResolvedValueOnce([])
    const reasoner = await isModelAllowedForTier("deepseek/deepseek-reasoner", "spark")
    expect(reasoner).toBe(false)
  })

  it("keeps hosted open models behind Spark Premium when DB throws", async () => {
    findManyMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const free = await isModelAllowedForTier("stealth/ox-alpha", "spark")
    expect(free).toBe(false)

    invalidateModelCache()
    findManyMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const premium = await isModelAllowedForTier("stealth/ox-alpha", "spark-premium")
    expect(premium).toBe(true)
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
