import { describe, expect, it } from "bun:test"
import {
  computeCost,
  getProviderColor,
  getProviderDisplayNameFromRaw,
  lookupPricing,
} from "../pricing"

describe("lookupPricing", () => {
  it("finds exact catalog entries", () => {
    expect(lookupPricing("deepseek-v4-flash")).toEqual({
      inputPrice: 0.15,
      outputPrice: 0.6,
      cachedPrice: 0,
    })
    expect(lookupPricing("anthropic/claude-sonnet-4.6")).toEqual({
      inputPrice: 3.0,
      outputPrice: 15.0,
      cachedPrice: 0.3,
    })
  })

  it("matches provider-prefixed aliases by substring", () => {
    expect(lookupPricing("anthropic/claude-sonnet-4.6:beta")?.inputPrice).toBe(3.0)
    expect(lookupPricing("openai/gpt-5.5-mini")?.inputPrice).toBe(5.0)
    expect(lookupPricing("deepseek/deepseek-v4-flash")?.outputPrice).toBe(0.6)
  })

  it("returns null for unknown models", () => {
    expect(lookupPricing("totally/unknown-model")).toBeNull()
  })
})

describe("computeCost", () => {
  it("bills per-million-token prices", () => {
    // deepseek-v4-flash: 1M input + 500K output
    expect(computeCost("deepseek-v4-flash", 1_000_000, 500_000, 0)).toBeCloseTo(
      0.15 + 0.6 * 0.5,
      6,
    )
  })

  it("bills cached input at the cached rate, not the full input rate", () => {
    // gemini-2.5-pro: 1M cached @ 0.3125; the same tokens as fresh input would cost 1.25
    expect(computeCost("gemini-2.5-pro", 0, 0, 1_000_000)).toBeCloseTo(0.3125, 6)
    expect(computeCost("gemini-2.5-pro", 1_000_000, 0, 1_000_000)).toBeCloseTo(
      1.25 + 0.3125,
      6,
    )
  })

  it("free models cost zero", () => {
    expect(computeCost("openai/gpt-oss-120b:free", 5_000_000, 5_000_000, 5_000_000)).toBe(0)
    expect(computeCost("stealth/ox-alpha", 1_000_000, 1_000_000, 1_000_000)).toBe(0)
  })

  it("unknown models cost zero (fail-open, never blocks)", () => {
    expect(computeCost("mystery/model", 1_000_000, 1_000_000, 0)).toBe(0)
  })
})

describe("provider labels", () => {
  it("maps known raw provider ids to display names", () => {
    expect(getProviderDisplayNameFromRaw("openrouter")).toBe("OpenRouter")
    expect(getProviderDisplayNameFromRaw("mergedev")).toBe("Merge Dev")
    expect(getProviderDisplayNameFromRaw("orcarouter")).toBe("OrcaRouter")
    expect(getProviderDisplayNameFromRaw("unknown-provider")).toBe("unknown-provider")
  })

  it("falls back to the neutral color for unknown providers", () => {
    expect(getProviderColor("minimax")).toBe("#06b6d4")
    expect(getProviderColor("unknown-provider")).toBe("#6b7280")
  })
})
