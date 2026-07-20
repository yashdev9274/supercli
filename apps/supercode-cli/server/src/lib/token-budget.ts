import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import os from "node:os"
import { randomUUID } from "node:crypto"
import prisma from "./prisma"
export const DAILY_BUDGET_TOKENS = 128_000
export const DAILY_QUERY_LIMIT = 20
export const OPUS_DAILY_LIMIT = 20

const DEVICE_ID_PATH = join(os.homedir(), ".config", "supercode", "device-id")
const OPUS_USAGE_PATH = join(os.homedir(), ".config", "supercode", "opus-usage.json")

function todayString(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`
}

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

export async function getDailyTokenUsage(model?: string): Promise<number> {
  try {
    const where: Record<string, unknown> = { createdAt: { gte: todayStart() } }
    if (model) where.model = model
    const result = await prisma.usageEvent.aggregate({
      _sum: { totalTokens: true },
      where: where as any,
    })
    return result._sum.totalTokens ?? 0
  } catch {
    return 0
  }
}

export async function checkDailyTokenBudget(): Promise<void> {
  const used = await getDailyTokenUsage()
  if (used >= DAILY_BUDGET_TOKENS) {
    const maxMb = (DAILY_BUDGET_TOKENS / 1_000_000).toFixed(1)
    throw new Error(
      `Daily token budget reached (${(used / 1_000_000).toFixed(2)}M / ${maxMb}M tokens). Resets at midnight UTC.`
    )
  }
}

export async function getDailyOpusCount(): Promise<number> {
  try {
    const data = JSON.parse(await readFile(OPUS_USAGE_PATH, "utf-8"))
    return data.date === todayString() ? (data.count ?? 0) : 0
  } catch {
    return 0
  }
}

export async function incrementDailyOpusCount(): Promise<void> {
  const count = await getDailyOpusCount()
  await mkdir(join(os.homedir(), ".config", "supercode"), { recursive: true })
  await writeFile(OPUS_USAGE_PATH, JSON.stringify({ date: todayString(), count: count + 1 }))
}

export async function checkDailyOpusLimit(): Promise<void> {
  const count = await getDailyOpusCount()
  if (count >= OPUS_DAILY_LIMIT) {
    throw new Error(
      `Opus 4.8 daily limit reached (${count}/${OPUS_DAILY_LIMIT}). Resets at midnight UTC.`
    )
  }
}


