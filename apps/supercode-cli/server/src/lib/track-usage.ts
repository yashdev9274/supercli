import prisma from "./prisma"

type UsageRecord = {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  totalTokens: number
  costUsd: number | null
  durationMs: number | null
  userId?: string
  conversationId?: string
}

export async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    await prisma.usageEvent.create({
      data: {
        provider: record.provider,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cachedInputTokens: record.cachedInputTokens,
        totalTokens: record.totalTokens,
        costUsd: record.costUsd,
        durationMs: record.durationMs,
        userId: record.userId,
        conversationId: record.conversationId,
      },
    })
  } catch (error) {
    console.error("[track-usage] Failed to record usage event:", error)
  }
}
