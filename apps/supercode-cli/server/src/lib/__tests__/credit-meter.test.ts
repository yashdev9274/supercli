import { beforeEach, describe, expect, it, mock } from "bun:test"

type FindFirstFn = (args: unknown) => Promise<unknown>
type UpdateFn = (args: unknown) => Promise<unknown>

const findFirstMock = mock<FindFirstFn>(async () => null)
const updateMock = mock<UpdateFn>(async () => ({}))

;(mock as any).module("../prisma", () => ({
  default: {
    creditBalance: {
      findFirst: findFirstMock,
      update: updateMock,
    },
  },
}))

const { deductCredits, getCreditBalance, getCreditCost } = await import("../credit-meter")

beforeEach(() => {
  findFirstMock.mockReset()
  updateMock.mockReset()
})

describe("getCreditCost", () => {
  it("applies deal multipliers to base costs", () => {
    expect(getCreditCost("deepseek-v4-flash")).toBe(0.25) // 1.0 / 4x
    expect(getCreditCost("mimo-v2.5")).toBe(0.05) // 5.0 / 100x
    expect(getCreditCost("gemini-2.5-flash")).toBe(0.5)
  })

  it("rounds fractional costs to cents", () => {
    expect(getCreditCost("MiniMax-M3")).toBeCloseTo(0.56, 2) // 1.5 / 2.7
  })

  it("defaults unknown models to one cent", () => {
    expect(getCreditCost("mystery-model")).toBe(1.0)
  })
})

describe("deductCredits", () => {
  it("deducts nothing when there is no balance row", async () => {
    findFirstMock.mockResolvedValueOnce(null)
    const out = await deductCredits("user-1", "deepseek-v4-flash")
    expect(out).toEqual({ deducted: false, remainingCents: 0 })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("fails soft when the balance cannot cover the cost", async () => {
    findFirstMock.mockResolvedValueOnce({
      userId: "user-1",
      planId: "plan-1",
      balanceCents: 0.1,
    })
    const out = await deductCredits("user-1", "deepseek-v4-flash")
    expect(out).toEqual({ deducted: false, remainingCents: 0.1 })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("decrements the balance by the model cost when covered", async () => {
    findFirstMock.mockResolvedValueOnce({
      userId: "user-1",
      planId: "plan-1",
      balanceCents: 10,
    })
    const out = await deductCredits("user-1", "deepseek-v4-flash")
    expect(out).toEqual({ deducted: true, remainingCents: 9.75 })
    expect(updateMock).toHaveBeenCalledWith({
      where: { userId_planId: { userId: "user-1", planId: "plan-1" } },
      data: { balanceCents: { decrement: 0.25 } },
    })
  })

  it("fails open to quota when the DB throws", async () => {
    findFirstMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const out = await deductCredits("user-1", "deepseek-v4-flash")
    expect(out).toEqual({ deducted: false, remainingCents: 0 })
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe("getCreditBalance", () => {
  it("returns the row when present", async () => {
    findFirstMock.mockResolvedValueOnce({
      balanceCents: 42,
      totalCredits: 100,
      resetAt: new Date("2026-09-01T00:00:00Z"),
    })
    const out = await getCreditBalance("user-1")
    expect(out?.balanceCents).toBe(42)
    expect(out?.totalCredits).toBe(100)
  })

  it("returns null when absent or on error", async () => {
    findFirstMock.mockResolvedValueOnce(null)
    expect(await getCreditBalance("user-1")).toBeNull()
    findFirstMock.mockRejectedValueOnce(new Error("boom"))
    expect(await getCreditBalance("user-1")).toBeNull()
  })
})
