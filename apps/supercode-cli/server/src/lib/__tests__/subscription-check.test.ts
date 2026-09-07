// apps/supercode-cli/server/src/lib/__tests__/subscription-check.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test"
import { Prisma } from "../../generated"

// Generic mocks for prisma.subscription / plan / creditBalance.
type FindFirstFn = (args: unknown) => Promise<unknown>
const findFirstMock = mock<FindFirstFn>(async (_args: unknown) => null)
const planFindFirstMock = mock<FindFirstFn>(async (_args: unknown) => null)
const subscriptionCreateMock = mock(async (_args: unknown) => ({}))
const creditUpsertMock = mock(async (_args: unknown) => ({}))

;(mock as any).module("../prisma", () => ({
  default: {
    subscription: {
      findFirst: findFirstMock,
      create: subscriptionCreateMock,
    },
    plan: {
      findFirst: planFindFirstMock,
    },
    creditBalance: {
      upsert: creditUpsertMock,
    },
  },
}))

const { getSubscriptionPlan } = await import("../subscription-check")

beforeEach(() => {
  findFirstMock.mockReset()
  planFindFirstMock.mockReset()
  subscriptionCreateMock.mockReset()
  creditUpsertMock.mockReset()
})

describe("getSubscriptionPlan — fail-open + auto Spark ensure", () => {
  it("auto-provisions Spark when no subscription row exists", async () => {
    // 1) primary active/trialing lookup → none
    findFirstMock.mockResolvedValueOnce(null)
    // 2) ensureSpark existing spark lookup → none
    findFirstMock.mockResolvedValueOnce(null)
    planFindFirstMock.mockResolvedValueOnce({
      id: "plan-spark",
      tier: "spark",
      name: "Spark (Grandfathered)",
      requestLimit: 10000,
      contextLimit: 16000,
      modelAccess: "open",
      creditAmountCents: 500,
    })
    subscriptionCreateMock.mockResolvedValueOnce({})
    creditUpsertMock.mockResolvedValueOnce({})

    const plan = await getSubscriptionPlan("user-new")
    expect(plan).not.toBeNull()
    expect(plan!.tier).toBe("spark")
    expect(plan!.isGrandfathered).toBe(true)
    expect(plan!.requestLimit).toBe(10000)
    expect(subscriptionCreateMock).toHaveBeenCalled()
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

  it("fails open to Spark for unknown errors (never hard-lock authenticated users)", async () => {
    findFirstMock.mockRejectedValueOnce(new Error("Unexpected bug — not infra"))

    const plan = await getSubscriptionPlan("user-x")
    expect(plan).not.toBeNull()
    expect(plan!.tier).toBe("spark")
    expect(plan!.isGrandfathered).toBe(true)
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
