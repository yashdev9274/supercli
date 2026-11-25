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

describe("isModelAllowedForTier — Free DeepSeek and Spark hosted models", () => {
  it("denies stealth/ox-alpha for Free when DB has no rows", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("stealth/ox-alpha", "free")
    expect(ok).toBe(false)
  })

  it("denies ox-alpha bare slug for Free", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("ox-alpha", "free")
    expect(ok).toBe(false)
  })

  it("allows hosted open models for Spark when DB has no rows", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("stealth/ox-alpha", "spark")
    expect(ok).toBe(true)
  })

  it("respects a Spark DB row", async () => {
    findManyMock.mockResolvedValueOnce([
      { slug: "stealth/ox-alpha", minTier: "spark" },
    ])
    const free = await isModelAllowedForTier("stealth/ox-alpha", "free")
    expect(free).toBe(false)

    invalidateModelCache()
    findManyMock.mockResolvedValueOnce([
      { slug: "stealth/ox-alpha", minTier: "spark" },
    ])
    const spark = await isModelAllowedForTier("stealth/ox-alpha", "spark")
    expect(spark).toBe(true)
  })

  it("denies pro models for Free", async () => {
    findManyMock.mockResolvedValueOnce([
      { slug: "anthropic/claude-sonnet-4.6", minTier: "pro" },
    ])
    const ok = await isModelAllowedForTier("anthropic/claude-sonnet-4.6", "free")
    expect(ok).toBe(false)
  })

  it("allows only the Free DeepSeek Flash model for Free", async () => {
    findManyMock.mockResolvedValueOnce([])
    const flash = await isModelAllowedForTier("deepseek-v4-flash", "free")
    expect(flash).toBe(true)

    invalidateModelCache()
    findManyMock.mockResolvedValueOnce([])
    const reasoner = await isModelAllowedForTier("deepseek/deepseek-reasoner", "free")
    expect(reasoner).toBe(false)
  })

  it("keeps hosted open models behind Spark when DB throws", async () => {
    findManyMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const free = await isModelAllowedForTier("stealth/ox-alpha", "free")
    expect(free).toBe(false)

    invalidateModelCache()
    findManyMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const spark = await isModelAllowedForTier("stealth/ox-alpha", "spark")
    expect(spark).toBe(true)
  })

  it("still denies unknown premium-looking slugs when missing", async () => {
    findManyMock.mockResolvedValueOnce([])
    const ok = await isModelAllowedForTier("anthropic/claude-opus-secret", "free")
    expect(ok).toBe(false)
  })
})

describe("getUpgradeSuggestion", () => {
  it("points Free users at Spark", () => {
    expect(getUpgradeSuggestion("free")).toContain("Spark")
  })
})
