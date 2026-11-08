import terminalPrisma from "@super/db-terminal"
import prisma from "@super/db"
import { calcSandboxMicrocredits, createBillingService } from "@super/billing"

import { VM_MS } from "./policy"

const billing = createBillingService(terminalPrisma)
const MAX_SECONDS = (VM_MS + 120_000) / 1000
const MAX_RESOURCES = { vcpus: 16, memoryMb: 65_536 }

async function terminalUserId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!user?.email) throw new Error("Cloud billing requires a verified account")
  const terminalUser = await terminalPrisma.user.findFirst({
    where: { email: { equals: user.email, mode: "insensitive" } },
    select: { id: true },
  })
  if (!terminalUser) throw new Error("Sign in to the CLI harness before using a cloud workspace")
  return terminalUser.id
}

export async function reserveSandboxCredits(userId: string, runId: string, provider: "e2b" | "vercel") {
  const resources = provider === "vercel" ? { vcpus: 2, memoryMb: 4096 } : MAX_RESOURCES
  const reservation = await billing.reserve({
    userId: await terminalUserId(userId),
    key: `sandbox:${runId}`,
    kind: "sandbox_wall_time",
    amountMicrocredits: calcSandboxMicrocredits(resources, MAX_SECONDS, provider),
    metadata: { provider, ...resources, maxSeconds: MAX_SECONDS },
  })
  if (reservation.replayed) throw new Error("This cloud execution has already reserved credits; wait for recovery")
  return {
    async settle(actual: { vcpus: number; memoryMb: number; seconds: number }) {
      if (!Number.isFinite(actual.vcpus) || !Number.isFinite(actual.memoryMb) || !Number.isFinite(actual.seconds)) {
        throw new Error("Cloud provider returned invalid usage")
      }
      if (actual.vcpus > resources.vcpus || actual.memoryMb > resources.memoryMb) {
        throw new Error("Cloud machine exceeds the prepaid resource limit")
      }
      await billing.settle({
        reservationId: reservation.id,
        actualMicrocredits: calcSandboxMicrocredits({ vcpus: Math.max(0, actual.vcpus), memoryMb: Math.max(0, actual.memoryMb) }, Math.min(MAX_SECONDS, Math.max(0, actual.seconds)), provider),
        metadata: actual,
      })
    },
    async cancel() {
      await billing.settle({ reservationId: reservation.id, actualMicrocredits: 0 })
    },
  }
}

export async function recoverSandboxCredits(userId: string, runId: string): Promise<void> {
  const reservation = await billing.getReservation({ userId: await terminalUserId(userId), key: `sandbox:${runId}` })
  if (!reservation || reservation.status !== "reserved") return
  await billing.settle({
    reservationId: reservation.id,
    actualMicrocredits: reservation.reservedMicrocredits,
    metadata: { recovered: true, reason: "Provider usage unavailable after interrupted cloud execution" },
  })
}
