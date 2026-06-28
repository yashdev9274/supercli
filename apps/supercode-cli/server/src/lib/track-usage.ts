import { PrismaClient } from "../generated"

type UsageRecord = {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  totalTokens: number
  costUsd: number | null
  durationMs: number | null
}

let prisma: PrismaClient | null = null

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient()
  }
  return prisma
}

export async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    await getPrisma().usageEvent.create({
      data: {
        provider: record.provider,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cachedInputTokens: record.cachedInputTokens,
        totalTokens: record.totalTokens,
        costUsd: record.costUsd,
        durationMs: record.durationMs,
      },
    })
  } catch (error) {
    console.error("[track-usage] Failed to record usage event:", error)
  }
}
