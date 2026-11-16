import { describe, expect, it } from "bun:test"

import { creditPercentage, creditsLabel, studioBillingHeaders } from "./studio-billing"

describe("Studio billing authentication", () => {
  it("authenticates billing requests with the current session token", () => {
    expect(studioBillingHeaders("test-session-token")).toEqual({
      Authorization: "Bearer test-session-token",
    })
  })

  it("rejects missing sessions instead of sending unauthenticated requests", () => {
    expect(() => studioBillingHeaders(undefined)).toThrow("Please sign in again")
    expect(() => studioBillingHeaders("")).toThrow("Please sign in again")
  })
})

describe("Studio billing display", () => {
  it("uses the subscription region for Pro credits, not the upgrade region", () => {
    expect(creditsLabel({ tier: "pro", variant: "in", creditAmountCents: 2000 })).toBe("$20 / mo")
    expect(creditsLabel({ tier: "pro", variant: "int", creditAmountCents: 2500 })).toBe("$25 / mo")
  })

  it("matches the Free, Spark, and Ultra allowances", () => {
    expect(creditsLabel({ tier: "free", creditAmountCents: 1000 })).toBe("Fixed DeepSeek")
    expect(creditsLabel({ tier: "spark", creditAmountCents: 500 })).toBe("$5 / mo")
    expect(creditsLabel({ tier: "ultra", creditAmountCents: 11000 })).toBe("$110 / mo")
    expect(creditsLabel(null)).toBe("—")
  })

  it("calculates remaining usage from product credits without dollar conversion", () => {
    expect(creditPercentage({ balanceCredits: 750, allowanceCredits: 1000, resetAt: null })).toBe(75)
    expect(creditPercentage({ balanceCredits: 0, allowanceCredits: 0, resetAt: null })).toBe(0)
    expect(creditPercentage({ balanceCredits: -1, allowanceCredits: 1000, resetAt: null })).toBe(0)
    expect(creditPercentage({ balanceCredits: 1200, allowanceCredits: 1000, resetAt: null })).toBe(100)
  })
})
