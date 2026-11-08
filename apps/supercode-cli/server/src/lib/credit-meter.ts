import {
  createBillingService,
  providerCostToMicrocredits,
  calcMcpMicrocredits,
} from "@super/billing"
import prisma from "./prisma"
import { lookupPricing } from "./pricing"

export { calcSandboxMicrocredits, calcMcpMicrocredits, providerCostToMicrocredits } from "@super/billing"
export const billing = createBillingService(prisma)

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
}

function count(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid token count")
  return value
}

export function computeTokenMicrocredits(model: string, usage: TokenUsage): number {
  const rates = lookupPricing(model)
  if (!rates) throw Object.assign(new Error(`No billing rate for model ${model}`), { statusCode: 503 })
  const input = count(usage.inputTokens)
  const output = count(usage.outputTokens)
  const cached = count(usage.cachedInputTokens ?? 0)
  if (cached > input) throw new Error("Cached input must be a subset of input tokens")
  return providerCostToMicrocredits(((input - cached) * rates.inputPrice + output * rates.outputPrice + cached * rates.cachedPrice) / 1_000_000)
}

export async function reserveInference(userId: string, model: string, opts: { inputTokens: number; maxOutputTokens: number; key?: string }) {
  return billing.reserve({
    userId,
    key: opts.key ?? crypto.randomUUID(),
    kind: "inference",
    amountMicrocredits: computeTokenMicrocredits(model, { inputTokens: opts.inputTokens, outputTokens: opts.maxOutputTokens }),
    metadata: { model, inputTokens: opts.inputTokens, maxOutputTokens: opts.maxOutputTokens },
  })
}

export async function settleInference(reservationId: string, model: string, usage: TokenUsage) {
  return billing.settle({ reservationId, actualMicrocredits: computeTokenMicrocredits(model, usage), metadata: { model, ...usage } })
}

export async function settleInferenceUnknown(reservation: { id: string; reservedMicrocredits: number }) {
  return billing.settle({ reservationId: reservation.id, actualMicrocredits: reservation.reservedMicrocredits, metadata: { usageUnavailable: true } })
}

export async function reserveTool(userId: string, toolName: string, key: string = crypto.randomUUID()) {
  return billing.reserve({ userId, key, kind: "mcp", amountMicrocredits: calcMcpMicrocredits(toolName), metadata: { toolName } })
}

export async function settleTool(reservationId: string, toolName: string) {
  return billing.settle({ reservationId, actualMicrocredits: calcMcpMicrocredits(toolName), metadata: { toolName } })
}

export async function withToolCredits<T>(userId: string, toolName: string, dispatch: () => Promise<T>, key?: string): Promise<T> {
  const reservation = await reserveTool(userId, toolName, key)
  if (reservation.replayed) throw Object.assign(new Error("Tool execution already reserved"), { statusCode: 409 })
  try {
    return await dispatch()
  } finally {
    await settleTool(reservation.id, toolName)
  }
}

export async function getCreditBalance(userId: string) {
  return billing.getBalance(userId)
}
