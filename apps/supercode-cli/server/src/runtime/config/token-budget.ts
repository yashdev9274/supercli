import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import os from "node:os"
import { randomUUID } from "node:crypto"
import prisma from "src/lib/prisma"
export const DAILY_BUDGET_TOKENS = Number(process.env.SUPERCODE_DAILY_TOKEN_BUDGET) || 1_000_000
export const DAILY_QUERY_LIMIT = 20
export const OPUS_DAILY_LIMIT = 20

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

const DEVICE_ID_PATH = join(os.homedir(), ".config", "supercode", "device-id")
const OPUS_USAGE_PATH = join(os.homedir(), ".config", "supercode", "opus-usage.json")
const PROXY_USAGE_PATH = join(os.homedir(), ".config", "supercode", "proxy-usage.json")

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

export async function getDailyTokenUsage(userId?: string): Promise<number> {
  let dbUsage = 0
  try {
    const where: Record<string, unknown> = { createdAt: { gte: todayStart() } }
    if (userId) where.userId = userId
    const result = await prisma.usageEvent.aggregate({
      _sum: { totalTokens: true },
      where: where as any,
    })
    dbUsage = result._sum.totalTokens ?? 0
  } catch {}
  const proxyUsage = userId ? await getProxyUsageForUser(userId) : 0
  return dbUsage + proxyUsage
}

export async function getUserDailyUsage(userId: string): Promise<{ used: number; limit: number; remaining: number; resetAt: string }> {
  const used = await getDailyTokenUsage(userId)
  const resetAt = new Date(todayStart().getTime() + 86_400_000).toISOString()
  return {
    used,
    limit: DAILY_BUDGET_TOKENS,
    remaining: Math.max(0, DAILY_BUDGET_TOKENS - used),
    resetAt,
  }
}

export async function checkDailyTokenBudget(userId?: string): Promise<void> {
  const used = await getDailyTokenUsage(userId)
  if (used >= DAILY_BUDGET_TOKENS) {
    throw new Error(
      `You've hit your daily limit of ${formatTokens(DAILY_BUDGET_TOKENS)} tokens. Wait 24hrs for it to reset.`
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

type ProxyUsageEvent = {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  totalTokens: number
  userId: string
  timestamp: number
}

export async function appendProxyUsage(event: ProxyUsageEvent): Promise<void> {
  try {
    let events: ProxyUsageEvent[] = []
    try {
      events = JSON.parse(await readFile(PROXY_USAGE_PATH, "utf-8"))
    } catch {}
    events.push(event)
    // prune events older than 48h to keep file small
    const cutoff = Date.now() - 86_400_000 * 2
    events = events.filter((e) => e.timestamp > cutoff)
    await mkdir(join(os.homedir(), ".config", "supercode"), { recursive: true })
    await writeFile(PROXY_USAGE_PATH, JSON.stringify(events), "utf-8")
  } catch {}
}

export async function getProxyUsageForUser(userId: string): Promise<number> {
  try {
    const events: ProxyUsageEvent[] = JSON.parse(await readFile(PROXY_USAGE_PATH, "utf-8"))
    const today = todayStart().getTime()
    return events
      .filter((e) => e.userId === userId && e.timestamp >= today)
      .reduce((sum, e) => sum + e.totalTokens, 0)
  } catch {
    return 0
  }
}


