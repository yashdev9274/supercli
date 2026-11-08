import { describe, expect, it } from "bun:test"
import { computeTokenMicrocredits } from "../credit-meter"
import { MODEL_PRICING } from "../pricing"

describe("inference credit conversion", () => {
  it("preserves tiny fractional calls without a flat floor", () => {
    expect(computeTokenMicrocredits("deepseek-v4-flash", { inputTokens: 1, outputTokens: 0 })).toBe(60)
  })

  it("charges cached input only once at the cached rate", () => {
    const rates = MODEL_PRICING["gemini-2.5-flash"]!
    const expectedUsd = (100 * rates.inputPrice + 50 * rates.cachedPrice + 10 * rates.outputPrice) / 1_000_000
    expect(computeTokenMicrocredits("gemini-2.5-flash", { inputTokens: 150, cachedInputTokens: 50, outputTokens: 10 })).toBe(Math.ceil(expectedUsd * 200 * 1_000_000))
    expect(computeTokenMicrocredits("deepseek-v4-flash", { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 })).toBe(1_200_000)
  })

  it("rejects unknown rates and invalid cache counts", () => {
    expect(() => computeTokenMicrocredits("not-a-model", { inputTokens: 1, outputTokens: 1 })).toThrow("No billing rate")
    expect(() => computeTokenMicrocredits("deepseek-v4-flash", { inputTokens: 1, outputTokens: 1, cachedInputTokens: 2 })).toThrow("subset")
    expect(() => computeTokenMicrocredits("deepseek-v4-flash", { inputTokens: -1, outputTokens: 1 })).toThrow("Invalid")
  })
})
