import { afterEach, expect, mock, spyOn, test } from "bun:test"

mock.module("next/headers", () => ({ headers: async () => new Headers() }))
mock.module("@super/auth/server", () => ({ auth: { api: { getSession: async () => null } } }))
mock.module("@/modules/nova/harness/auth", () => ({ ensureHarnessToken: async () => ({ token: "fixture" }) }))
mock.module("@/modules/nova/harness/client", () => ({ terminalHarnessUrl: () => "http://harness.invalid" }))

const { getBillingInfo } = await import("./billing-service")
afterEach(() => mock.restore())

test("billing displays product credits without treating 1000 credits as dollars", async () => {
  spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ id: "terminal-user" }))
    .mockResolvedValueOnce(Response.json({
      plan: { tier: "spark" },
      productCreditBalance: { balanceCredits: 999.6, allowanceCredits: 1000, resetAt: "2026-12-01T00:00:00.000Z" },
      creditBalance: { balanceCents: 500, totalCredits: 500 },
    }))
  const info = await getBillingInfo({ userId: "web-user", email: "user@example.com" })
  expect(info.balanceCredits).toBe(999.6)
  expect(info.totalCredits).toBe(1000)
  expect(info.spentThisPeriodCredits).toBeCloseTo(0.4)
  expect(info.resetAt).toBe("2026-12-01T00:00:00.000Z")
})

test("older harnesses do not mislabel dollar balances as product credits", async () => {
  spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ id: "terminal-user" }))
    .mockResolvedValueOnce(Response.json({ plan: { tier: "spark" }, creditBalance: { balanceCents: 100, totalCredits: 500 } }))
  const info = await getBillingInfo({ userId: "web-user", email: "user@example.com" })
  expect(info.balanceCredits).toBeNull()
  expect(info.totalCredits).toBeNull()
  expect(info.balanceUsd).toBe(1)
})
