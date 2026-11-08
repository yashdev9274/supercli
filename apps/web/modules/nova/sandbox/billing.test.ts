import { beforeEach, expect, mock, test } from "bun:test"

const reserve = mock(async (_input: unknown) => ({ id: "reservation", replayed: false }))
const settle = mock(async (_input: unknown) => ({}))
const getReservation = mock(async (_input: unknown) => null as null | { id: string; status: string; reservedMicrocredits: number })
const findTerminalUser = mock(async (_input: unknown) => ({ id: "terminal-user" }) as { id: string } | null)
mock.module("@super/db", () => ({ default: { user: { findUnique: async () => ({ email: "user@example.com" }) } } }))
mock.module("@super/db-terminal", () => ({ default: { user: { findFirst: findTerminalUser } } }))
mock.module("@super/billing", () => ({
  createBillingService: () => ({ reserve, settle, getReservation }),
  calcSandboxMicrocredits: (resources: { vcpus: number; memoryMb: number }, seconds: number) => Math.ceil((resources.vcpus * 0.000014 + resources.memoryMb / 1024 * 0.0000045) * seconds * 200_000_000),
}))

const { reserveSandboxCredits, recoverSandboxCredits } = await import("./billing")

beforeEach(() => {
  reserve.mockClear()
  settle.mockClear()
  getReservation.mockClear()
  findTerminalUser.mockClear()
})

test("cloud usage reserves against the terminal identity rather than the dashboard ID", async () => {
  const credits = await reserveSandboxCredits("dashboard-user", "run", "e2b")
  expect(findTerminalUser).toHaveBeenCalledWith({ where: { email: { equals: "user@example.com", mode: "insensitive" } }, select: { id: true } })
  expect(reserve.mock.calls[0]?.[0]).toMatchObject({ userId: "terminal-user", key: "sandbox:run", kind: "sandbox_wall_time" })
  await credits.settle({ vcpus: 1, memoryMb: 4096, seconds: 60 })
  expect(settle.mock.calls[0]?.[0]).toMatchObject({ reservationId: "reservation", actualMicrocredits: 384_000 })
})

test("a failure before provider dispatch refunds the reservation", async () => {
  const credits = await reserveSandboxCredits("dashboard-user", "run", "e2b")
  await credits.cancel()
  expect(settle).toHaveBeenCalledWith({ reservationId: "reservation", actualMicrocredits: 0 })
})

test("a reservation replay does not permit a second cloud execution", async () => {
  reserve.mockResolvedValueOnce({ id: "reservation", replayed: true })
  await expect(reserveSandboxCredits("dashboard-user", "run", "e2b")).rejects.toThrow("already reserved")
})

test("missing terminal identity blocks cloud execution", async () => {
  findTerminalUser.mockResolvedValueOnce(null)
  await expect(reserveSandboxCredits("dashboard-user", "run", "e2b")).rejects.toThrow("Sign in")
  expect(reserve).not.toHaveBeenCalled()
})

test("unknown interrupted runtime consumes its reserved bound once", async () => {
  getReservation.mockResolvedValueOnce({ id: "reservation", status: "reserved", reservedMicrocredits: 123 })
  await recoverSandboxCredits("dashboard-user", "run")
  expect(settle.mock.calls[0]?.[0]).toMatchObject({ reservationId: "reservation", actualMicrocredits: 123 })
  getReservation.mockResolvedValueOnce({ id: "reservation", status: "settled", reservedMicrocredits: 123 })
  await recoverSandboxCredits("dashboard-user", "run")
  expect(settle).toHaveBeenCalledTimes(1)
})
