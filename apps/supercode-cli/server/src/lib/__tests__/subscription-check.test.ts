import { beforeEach, describe, expect, it, mock } from "bun:test"
import { Prisma } from "../../generated"

const findFirstMock = mock<(args: unknown) => Promise<unknown>>(async () => null)
const planFindFirstMock = mock<(args: unknown) => Promise<unknown>>(async () => null)
const subscriptionUpsertMock = mock<(args: unknown) => Promise<unknown>>(async () => null)
const creditUpsertMock = mock(async (_args: unknown) => ({}))
const requestLimitMock = mock(async (_userId: string, _limit: number) => ({ allowed: true, message: "" }))
const modelAllowedMock = mock(async (_model: string, _tier: string) => true)

mock.module("../prisma", () => ({
  default: {
    subscription: { findFirst: findFirstMock, upsert: subscriptionUpsertMock },
    plan: { findFirst: planFindFirstMock },
    creditBalance: { upsert: creditUpsertMock },
  },
}))
mock.module("../request-counter", () => ({ checkRequestLimit: requestLimitMock }))
mock.module("../model-access", () => ({
  isModelAllowedForTier: modelAllowedMock,
  getUpgradeSuggestion: () => "Upgrade your plan.",
}))

const { ensureFreeSubscription, getSubscriptionPlan } = await import("../subscription-check")
const { checkPlanGate } = await import("../plan-gate")

const freePlan = {
  id: "plan-spark",
  tier: "free",
  name: "Free",
  requestLimit: 10000,
  contextLimit: 1_048_576,
  modelAccess: "open",
  creditAmountCents: 500,
  monthlyCredits: 9999,
}
const freeSubscription = { plan: freePlan, currentPeriodEnd: null, metadata: null }

beforeEach(() => {
  findFirstMock.mockReset()
  findFirstMock.mockResolvedValue(null)
  planFindFirstMock.mockReset()
  planFindFirstMock.mockResolvedValue(null)
  subscriptionUpsertMock.mockReset()
  creditUpsertMock.mockReset()
  requestLimitMock.mockReset()
  requestLimitMock.mockResolvedValue({ allowed: true, message: "" })
  modelAllowedMock.mockReset()
  modelAllowedMock.mockResolvedValue(true)
})

describe("subscription verification and free provisioning", () => {
  it("provisions deterministic free subscriptions without refilling legacy balances", async () => {
    planFindFirstMock.mockResolvedValue(freePlan)
    subscriptionUpsertMock.mockResolvedValue(freeSubscription)
    for (let attempt = 0; attempt < 2; attempt++) {
      const plan = await getSubscriptionPlan("user-new")
      expect(plan?.tier).toBe("free")
      expect(plan?.monthlyCredits).toBe(1000)
      expect(plan?.contextLimit).toBe(16000)
      expect(plan?.isGrandfathered).toBe(false)
    }
    expect(subscriptionUpsertMock).toHaveBeenCalledTimes(2)
    expect(subscriptionUpsertMock.mock.calls[0]?.[0]).toMatchObject({
      where: { dodoSubscriptionId: "free-user-new" },
      create: { userId: "user-new", dodoSubscriptionId: "free-user-new", status: "active" },
    })
    expect(subscriptionUpsertMock.mock.calls[1]?.[0]).toMatchObject({
      where: { dodoSubscriptionId: "free-user-new" },
    })
    expect(creditUpsertMock).not.toHaveBeenCalled()
  })

  for (const error of [
    new Prisma.PrismaClientKnownRequestError("DB unavailable", { code: "P1001", clientVersion: "7.8.0" }),
    new Prisma.PrismaClientInitializationError("DB unavailable", "7.8.0"),
    Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" }),
    new Error("Unexpected failure"),
  ]) {
    it(`does not grant access when subscription lookup fails: ${error.name}`, async () => {
      findFirstMock.mockRejectedValueOnce(error)
      expect(await getSubscriptionPlan("user-unverified")).toBeNull()
      expect(subscriptionUpsertMock).not.toHaveBeenCalled()
      expect(planFindFirstMock).not.toHaveBeenCalled()
    })
  }

  it("does not grant access when the free plan is missing or provisioning fails", async () => {
    expect(await getSubscriptionPlan("user-new")).toBeNull()
    planFindFirstMock.mockResolvedValue(freePlan)
    subscriptionUpsertMock.mockRejectedValueOnce(new Error("Write failed"))
    expect(await getSubscriptionPlan("user-new")).toBeNull()
    findFirstMock.mockRejectedValueOnce(new Error("Lookup failed"))
    expect(await ensureFreeSubscription("user-new")).toBeNull()
  })

  it("normalizes old grandfathered Free rows to the same free allowance and context", async () => {
    findFirstMock.mockResolvedValue({ ...freeSubscription, metadata: { grandfathered: true } })
    const plan = await getSubscriptionPlan("user-grandfathered")
    expect(plan?.isGrandfathered).toBe(true)
    expect(plan?.monthlyCredits).toBe(1000)
    expect(plan?.contextLimit).toBe(16000)
    expect(plan?.creditAmountCents).toBe(500)
    expect(subscriptionUpsertMock).not.toHaveBeenCalled()
    expect(creditUpsertMock).not.toHaveBeenCalled()
  })

  it("returns active paid limits and falls back to verified free after paid expiration", async () => {
    const paid = {
      plan: { ...freePlan, tier: "pro", name: "Pro", contextLimit: 128000, creditAmountCents: 2000, monthlyCredits: 2500 },
      currentPeriodEnd: new Date(Date.now() + 86400000),
      metadata: null,
    }
    findFirstMock.mockResolvedValueOnce(paid)
    expect(await getSubscriptionPlan("user-paid")).toMatchObject({ tier: "pro", contextLimit: 128000, monthlyCredits: 2500, creditAmountCents: 2000 })
    findFirstMock.mockResolvedValueOnce({ ...paid, currentPeriodEnd: new Date(0) })
    findFirstMock.mockResolvedValueOnce(freeSubscription)
    expect(await getSubscriptionPlan("user-paid")).toMatchObject({ tier: "free", contextLimit: 16000 })
  })
})

describe("plan gate", () => {
  it("fails closed when the subscription cannot be verified", async () => {
    expect((await checkPlanGate("user-new", "deepseek-v4-flash")).allowed).toBe(false)
    expect(requestLimitMock).not.toHaveBeenCalled()
  })

  it("keeps request and model gates and never deducts credits", async () => {
    findFirstMock.mockResolvedValue(freeSubscription)
    expect(await checkPlanGate("user-free", "deepseek-v4-flash", { totalTokens: 16000 })).toMatchObject({
      allowed: true,
      plan: { contextLimit: 16000, monthlyCredits: 1000 },
    })
    expect(creditUpsertMock).not.toHaveBeenCalled()
    requestLimitMock.mockResolvedValueOnce({ allowed: false, message: "Request cap reached" })
    expect((await checkPlanGate("user-free", "deepseek-v4-flash")).allowed).toBe(false)
    modelAllowedMock.mockResolvedValueOnce(false)
    expect((await checkPlanGate("user-free", "restricted-model")).allowed).toBe(false)
  })

  for (const model of ["deepseek-v4-flash", "deepseek/deepseek-v4-flash"]) {
    it(`allows native 1M context only for ${model}`, async () => {
      findFirstMock.mockResolvedValue(freeSubscription)
      expect((await checkPlanGate("user-free", model, { totalTokens: 1_048_576, nativeDeepSeek: true })).allowed).toBe(true)
      expect((await checkPlanGate("user-free", model, { totalTokens: 1_048_577, nativeDeepSeek: true })).allowed).toBe(false)
      expect((await checkPlanGate("user-free", model, { totalTokens: 16001 })).allowed).toBe(false)
      expect((await checkPlanGate("user-free", model, { totalTokens: 16001, nativeDeepSeek: false })).allowed).toBe(false)
    })
  }

  for (const model of ["deepseek-v4-pro", "deepseek/deepseek-v4-pro", "deepseek-v4-flash-extra", "other-model"]) {
    it(`does not widen context for ${model}`, async () => {
      findFirstMock.mockResolvedValue(freeSubscription)
      expect((await checkPlanGate("user-free", model, { totalTokens: 16001, nativeDeepSeek: true })).allowed).toBe(false)
    })
  }

  for (const totalTokens of [NaN, Infinity, -1]) {
    it(`rejects invalid context counts: ${totalTokens}`, async () => {
      findFirstMock.mockResolvedValue(freeSubscription)
      expect((await checkPlanGate("user-free", "deepseek-v4-flash", { totalTokens })).allowed).toBe(false)
    })
  }
})
