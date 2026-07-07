import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import os from "node:os"
import { randomUUID } from "node:crypto"
import prisma from "./prisma"

export const OPUS_MODEL_ID = "azure/claude-opus-4-8"
export const DAILY_BUDGET_TOKENS = 128_000
export const DAILY_QUERY_LIMIT = 20

const DEVICE_ID_PATH = join(os.homedir(), ".config", "supercode", "device-id")

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await readFile(DEVICE_ID_PATH, "utf-8")
    const trimmed = existing.trim()
    if (trimmed.length > 0) return trimmed
  } catch {}

  const uuid = randomUUID()
  await mkdir(join(os.homedir(), ".config", "supercode"), { recursive: true })
  await writeFile(DEVICE_ID_PATH, uuid, "utf-8")
  return uuid
}

function todayStart(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export async function getDailyTokenUsage(model: string): Promise<number> {
  const result = await prisma.usageEvent.aggregate({
    _sum: { totalTokens: true },
    where: {
      model,
      createdAt: { gte: todayStart() },
    },
  })
  return result._sum.totalTokens ?? 0
}

export async function getDailyQueryCount(userId: string): Promise<number> {
  return prisma.usageEvent.count({
    where: {
      model: OPUS_MODEL_ID,
      userId,
      createdAt: { gte: todayStart() },
    },
  })
}

export async function checkQueryLimit(userId: string): Promise<{
  allowed: boolean
  used: number
  remaining: number
  resetTime: string
}> {
  const used = await getDailyQueryCount(userId)
  const remaining = Math.max(0, DAILY_QUERY_LIMIT - used)
  const tomorrow = new Date(todayStart().getTime() + 86_400_000)
  return {
    allowed: remaining > 0,
    used,
    remaining,
    resetTime: tomorrow.toISOString(),
  }
}

export async function checkDailyBudget(): Promise<{
  allowed: boolean
  used: number
  remaining: number
  resetTime: string
}> {
  const used = await getDailyTokenUsage(OPUS_MODEL_ID)
  const remaining = Math.max(0, DAILY_BUDGET_TOKENS - used)
  const tomorrow = new Date(todayStart().getTime() + 86_400_000)
  return {
    allowed: remaining > 0,
    used,
    remaining,
    resetTime: tomorrow.toISOString(),
  }
}
