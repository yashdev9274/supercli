// apps/supercode-cli/server/src/lib/__tests__/subscription-check.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test"
import { Prisma } from "../../generated"

// Generic mock for prisma.subscription.findFirst. Typed loosely so both
// resolved values and rejected errors are accepted by TS.
type FindFirstFn = (args: unknown) => Promise<unknown>
const findFirstMock = mock<FindFirstFn>(async (_args: unknown) => null)

;(mock as any).module("../prisma", () => ({
  default: {
    subscription: { findFirst: findFirstMock },
  },
}))

const { getSubscriptionPlan } = await import("../subscription-check")

beforeEach(() => {
  findFirstMock.mockReset()
})

describe("getSubscriptionPlan — fail-open on transient DB errors", () => {
  it("returns null when no subscription row exists", async () => {
    findFirstMock.mockResolvedValueOnce(null)
    const plan = await getSubscriptionPlan("user-new")
    expect(plan).toBeNull()
  })

  it("fails open to Spark (Grandfathered) on PrismaClientKnownRequestError", async () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "DB connection error",
      { code: "P1001", clientVersion: "7.8.0" },
    )
    findFirstMock.mockRejectedValueOnce(err)

    const plan = await getSubscriptionPlan("user-grandfathered")
    expect(plan).not.toBeNull()
    expect(plan!.tier).toBe("spark")
    expect(plan!.isGrandfathered).toBe(true)
    expect(plan!.requestLimit).toBe(10000)
    expect(plan!.contextLimit).toBe(16000)
    expect(plan!.modelAccess).toBe("open")
  })

  it("fails open on ECONNREFUSED driver-level error", async () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })
    findFirstMock.mockRejectedValueOnce(err)

    const plan = await getSubscriptionPlan("user-grandfathered")
    expect(plan).not.toBeNull()
    expect(plan!.tier).toBe("spark")
    expect(plan!.isGrandfathered).toBe(true)
  })

  it("fails open on PrismaClientInitializationError", async () => {
    const err = new Prisma.PrismaClientInitializationError(
      "Database unreachable",
      "7.8.0",
    )
    findFirstMock.mockRejectedValueOnce(err)

    const plan = await getSubscriptionPlan("user-grandfathered")
    expect(plan).not.toBeNull()
    expect(plan!.tier).toBe("spark")
    expect(plan!.isGrandfathered).toBe(true)
  })

  it("returns null for unknown (non-infra) errors to surface real bugs", async () => {
    findFirstMock.mockRejectedValueOnce(new Error("Unexpected bug — not infra"))

    const plan = await getSubscriptionPlan("user-x")
    expect(plan).toBeNull()
  })

  it("returns the real plan when subscription + plan are present", async () => {
    const row = {
      plan: {
        tier: "spark-premium",
        name: "Spark Premium",
        requestLimit: 15000,
        contextLimit: 32000,
        modelAccess: "open",
        creditAmountCents: 1000,
      },
      currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      metadata: null,
    }
    findFirstMock.mockResolvedValueOnce(row)

    const plan = await getSubscriptionPlan("user-paid")
    expect(plan).not.toBeNull()
    expect(plan!.tier).toBe("spark-premium")
    expect(plan!.requestLimit).toBe(15000)
    expect(plan!.isGrandfathered).toBe(false)
  })

  it("marks grandfathered users correctly from metadata", async () => {
    const row = {
      plan: {
        tier: "spark",
        name: "Spark (Grandfathered)",
        requestLimit: 10000,
        contextLimit: 16000,
        modelAccess: "open",
        creditAmountCents: 500,
      },
      currentPeriodEnd: null,
      metadata: { grandfathered: true },
    }
    findFirstMock.mockResolvedValueOnce(row)

    const plan = await getSubscriptionPlan("user-grandfathered")
    expect(plan).not.toBeNull()
    expect(plan!.tier).toBe("spark")
    expect(plan!.isGrandfathered).toBe(true)
  })
})
