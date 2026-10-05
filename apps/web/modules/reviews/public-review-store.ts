import { randomUUID } from "node:crypto"

import prisma from "@super/db"
import type { Prisma } from "@super/db/src/generated"

import { PublicReviewError } from "./public-review-errors"

export const PUBLIC_REVIEW_QUOTAS = {
  fetchGlobalHourly: 10,
  fetchClientHourly: 10,
  aiGlobalHourly: 10,
  aiGlobalDaily: 20,
  aiClientDaily: 10,
  concurrency: 2,
  cacheEntries: 256,
  cacheTtlMs: 24 * 60 * 60 * 1000,
  leaseMs: 5 * 60 * 1000,
  failedCooldownMs: 60 * 1000,
} as const

export type CachedPublicReview = { markdown: string; updatedAt: Date }
export type PublicReviewReservation =
  | { cached: CachedPublicReview; leaseToken?: never }
  | { cached?: never; leaseToken: string }

export type PublicReviewStore = {
  reserveFetch: (subject: string) => Promise<void>
  read: (key: string, inputHash: string) => Promise<CachedPublicReview | null>
  reserveGeneration: (key: string, inputHash: string, subject: string) => Promise<PublicReviewReservation>
  complete: (key: string, leaseToken: string, markdown: string) => Promise<CachedPublicReview>
  fail: (key: string, leaseToken: string) => Promise<void>
}

type StoreDatabase = Pick<typeof prisma, "$transaction">

function configuredLimit(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === "") return fallback
  const value = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new PublicReviewError("Public review limits are not configured correctly. Please try again later.", 503)
  }
  return value
}

export function publicReviewQuotaLimits() {
  return {
    fetchGlobalHourly: configuredLimit("PUBLIC_REVIEW_FETCH_GLOBAL_HOURLY", PUBLIC_REVIEW_QUOTAS.fetchGlobalHourly, 60),
    fetchClientHourly: configuredLimit("PUBLIC_REVIEW_FETCH_CLIENT_HOURLY", PUBLIC_REVIEW_QUOTAS.fetchClientHourly, 60),
    aiGlobalHourly: configuredLimit("PUBLIC_REVIEW_AI_GLOBAL_HOURLY", PUBLIC_REVIEW_QUOTAS.aiGlobalHourly, 100),
    aiGlobalDaily: configuredLimit("PUBLIC_REVIEW_AI_GLOBAL_DAILY", PUBLIC_REVIEW_QUOTAS.aiGlobalDaily, 1000),
    aiClientDaily: configuredLimit("PUBLIC_REVIEW_AI_CLIENT_DAILY", PUBLIC_REVIEW_QUOTAS.aiClientDaily, 100),
    concurrency: configuredLimit("PUBLIC_REVIEW_MAX_CONCURRENT", PUBLIC_REVIEW_QUOTAS.concurrency, 10),
  }
}

export function createPublicReviewStore(database: StoreDatabase = prisma, namespace = "public-review"): PublicReviewStore {
  const prefix = `${namespace}:`
  const locked = async <T>(work: (tx: Prisma.TransactionClient, now: Date) => Promise<T>, waitForLock = true): Promise<T> => {
    return database.$transaction(async (tx) => {
      if (waitForLock) await tx.$executeRaw`SELECT pg_advisory_xact_lock(730051200, hashtext(${namespace}))`
      const [clock] = await tx.$queryRaw<Array<{ now: Date; locked: boolean }>>`SELECT clock_timestamp() AS now, pg_try_advisory_xact_lock(730051200, hashtext(${namespace})) AS locked`
      if (!clock.locked) throw new PublicReviewError("Public reviews are busy. Please try again shortly.", 429, 2)
      const now = clock.now
      await tx.publicReviewQuota.deleteMany({ where: { key: { startsWith: prefix }, expiresAt: { lte: now } } })
      await tx.publicReviewCache.deleteMany({ where: { key: { startsWith: prefix }, expiresAt: { lte: now } } })
      return work(tx, now)
    }, { maxWait: 5000, timeout: 10_000 })
  }

  const consume = async (tx: Prisma.TransactionClient, now: Date, name: string, subject: string, periodMs: number, limit: number): Promise<void> => {
    const bucket = Math.floor(now.getTime() / periodMs)
    const key = `${prefix}${name}:${subject}:${bucket}`
    const expiresAt = new Date((bucket + 1) * periodMs)
    const denied = () => {
      const message = name === "fetch"
        ? subject === "global"
          ? `The site's hourly GitHub-loading limit (${limit} requests) has been reached. Try again after the hour resets.`
          : `The hourly PR-loading limit (${limit} requests) has been reached. Previews and cached views also count. Try again after the hour resets.`
        : name === "ai-hour"
          ? `The site's hourly public review budget (${limit} new reviews) has been reached. Try again after the hour resets.`
          : subject === "global"
            ? `The site's daily public review budget (${limit} new reviews) has been reached. Try again after midnight UTC.`
            : `The daily allowance of ${limit} free new PR reviews has been used. Try again after midnight UTC.`
      throw new PublicReviewError(message, 429, Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)))
    }
    if (limit === 0) denied()
    const rows = await tx.$queryRaw<Array<{ count: number }>>`
      INSERT INTO public_review_quota (key, count, "expiresAt") VALUES (${key}, 1, ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET count = public_review_quota.count + 1
      WHERE public_review_quota.count < ${limit}
      RETURNING count
    `
    if (!rows.length) denied()
  }

  return {
    reserveFetch: (subject) => locked(async (tx, now) => {
      const limits = publicReviewQuotaLimits()
      await consume(tx, now, "fetch", "global", 60 * 60 * 1000, limits.fetchGlobalHourly)
      await consume(tx, now, "fetch", subject, 60 * 60 * 1000, limits.fetchClientHourly)
    }, false),
    read: (key, inputHash) => locked(async (tx) => {
      const row = await tx.publicReviewCache.findUnique({ where: { key: prefix + key } })
      return row?.status === "completed" && row.inputHash === inputHash && row.markdown
        ? { markdown: row.markdown, updatedAt: row.updatedAt }
        : null
    }),
    reserveGeneration: (key, inputHash, subject) => locked(async (tx, now) => {
      key = prefix + key
      const limits = publicReviewQuotaLimits()
      const row = await tx.publicReviewCache.findUnique({ where: { key } })
      if (row?.status === "completed" && row.inputHash === inputHash && row.markdown) {
        return { cached: { markdown: row.markdown, updatedAt: row.updatedAt } }
      }
      if (row?.leaseUntil && row.leaseUntil > now && row.status !== "completed") {
        const retryAfter = Math.max(1, Math.ceil((row.leaseUntil.getTime() - now.getTime()) / 1000))
        throw new PublicReviewError(row.status === "pending" ? "A review of this pull request is already in progress. Please try again shortly." : "The previous review attempt failed. Please try again shortly.", row.status === "pending" ? 409 : 503, retryAfter)
      }
      const running = await tx.publicReviewCache.count({ where: { key: { startsWith: prefix }, status: "pending", leaseUntil: { gt: now } } })
      if (running >= limits.concurrency) throw new PublicReviewError("Public reviews are busy. Please try again shortly.", 429, 60)
      if (!row && await tx.publicReviewCache.count({ where: { key: { startsWith: prefix } } }) >= PUBLIC_REVIEW_QUOTAS.cacheEntries) {
        throw new PublicReviewError("Public review storage is full. Please try again later.", 503, 3600)
      }
      await consume(tx, now, "ai-day", subject, 24 * 60 * 60 * 1000, limits.aiClientDaily)
      await consume(tx, now, "ai-hour", "global", 60 * 60 * 1000, limits.aiGlobalHourly)
      await consume(tx, now, "ai-day", "global", 24 * 60 * 60 * 1000, limits.aiGlobalDaily)
      const leaseToken = randomUUID()
      const data = {
        inputHash,
        status: "pending",
        leaseToken,
        leaseUntil: new Date(now.getTime() + PUBLIC_REVIEW_QUOTAS.leaseMs),
        expiresAt: new Date(now.getTime() + PUBLIC_REVIEW_QUOTAS.cacheTtlMs),
        markdown: null,
      }
      await tx.publicReviewCache.upsert({ where: { key }, create: { key, ...data }, update: data })
      return { leaseToken }
    }, false),
    complete: (key, leaseToken, markdown) => locked(async (tx, now) => {
      const result = await tx.publicReviewCache.updateMany({
        where: { key: prefix + key, leaseToken, status: "pending", leaseUntil: { gt: now } },
        data: {
          status: "completed",
          markdown,
          leaseToken: null,
          leaseUntil: null,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + PUBLIC_REVIEW_QUOTAS.cacheTtlMs),
        },
      })
      if (!result.count) throw new PublicReviewError("This review attempt expired. Please try again.", 409)
      return { markdown, updatedAt: now }
    }),
    fail: (key, leaseToken) => locked(async (tx, now) => {
      await tx.publicReviewCache.updateMany({
        where: { key: prefix + key, leaseToken, status: "pending" },
        data: { status: "failed", leaseToken: null, leaseUntil: new Date(now.getTime() + PUBLIC_REVIEW_QUOTAS.failedCooldownMs), markdown: null },
      })
    }),
  }
}
