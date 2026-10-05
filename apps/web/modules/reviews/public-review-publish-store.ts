import { createHash, randomUUID } from "node:crypto"

import prisma from "@super/db"
import type { Prisma } from "@super/db/src/generated"

import { PublicReviewError } from "./public-review-errors"

export const PUBLIC_REVIEW_PUBLISH_LIMITS = {
  fetchUserHourly: 30,
  fetchGlobalHourly: 120,
  writeUserHourly: 10,
  writeUserDaily: 50,
  writeGlobalHourly: 100,
  userConcurrency: 2,
  globalConcurrency: 8,
  leaseMs: 120_000,
} as const

export type PublicReviewPublishLease = { key: string; token: string }
export type PublicReviewPublishStore = {
  begin: (userId: string, pr: string) => Promise<PublicReviewPublishLease>
  reserveWrite: (userId: string, lease: PublicReviewPublishLease) => Promise<void>
  assertLease: (lease: PublicReviewPublishLease) => Promise<void>
  release: (lease: PublicReviewPublishLease) => Promise<void>
}

export function createPublicReviewPublishStore(database: Pick<typeof prisma, "$transaction"> = prisma, namespace = "public-review-publish"): PublicReviewPublishStore {
  const prefix = `${namespace}:`
  const subject = (userId: string) => createHash("sha256").update(userId).digest("hex")
  const locked = async <T>(work: (tx: Prisma.TransactionClient, now: Date) => Promise<T>): Promise<T> => {
    try {
      return await database.$transaction(async (tx) => {
        const [clock] = await tx.$queryRaw<Array<{ now: Date; locked: boolean }>>`SELECT clock_timestamp() AS now, pg_try_advisory_xact_lock(730051201, hashtext(${namespace})) AS locked`
        if (!clock.locked) throw new PublicReviewError("Review publishing is busy. Please try again shortly.", 429, 2)
        await tx.publicReviewQuota.deleteMany({ where: { key: { startsWith: prefix }, expiresAt: { lte: clock.now } } })
        await tx.publicReviewCache.deleteMany({ where: { key: { startsWith: prefix }, expiresAt: { lte: clock.now } } })
        return work(tx, clock.now)
      }, { maxWait: 5000, timeout: 10_000 })
    } catch (error) {
      if (error instanceof PublicReviewError) throw error
      throw new PublicReviewError("Review publishing storage is unavailable. Please try again later.", 503)
    }
  }
  const consume = async (tx: Prisma.TransactionClient, now: Date, lane: string, user: string, period: number, limit: number) => {
    const bucket = Math.floor(now.getTime() / period)
    const key = `${prefix}${lane}:${user}:${bucket}`
    const expiresAt = new Date((bucket + 1) * period)
    const rows = await tx.$queryRaw<Array<{ count: number }>>`
      INSERT INTO public_review_quota (key, count, "expiresAt") VALUES (${key}, 1, ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET count = public_review_quota.count + 1
      WHERE public_review_quota.count < ${limit}
      RETURNING count
    `
    if (!rows.length) throw new PublicReviewError("Your review publishing allowance or the site's publishing limit has been reached. Please try again later.", 429, Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)))
  }
  const assertLease = async (tx: Prisma.TransactionClient, now: Date, lease: PublicReviewPublishLease) => {
    const row = await tx.publicReviewCache.findUnique({ where: { key: lease.key } })
    if (!row || row.leaseToken !== lease.token || !row.leaseUntil || row.leaseUntil <= now || row.expiresAt <= now) {
      throw new PublicReviewError("This publishing attempt expired. Please try again.", 409)
    }
  }
  return {
    begin: (userId, pr) => locked(async (tx, now) => {
      const user = subject(userId)
      const userPrefix = `${prefix}lock:${user}:`
      const key = `${userPrefix}${createHash("sha256").update(pr).digest("hex")}`
      const existing = await tx.publicReviewCache.findUnique({ where: { key } })
      if (existing?.leaseUntil && existing.leaseUntil > now) throw new PublicReviewError("You are already adding a review to this PR. Please try again shortly.", 409, 2)
      if (await tx.publicReviewCache.count({ where: { key: { startsWith: userPrefix }, leaseUntil: { gt: now } } }) >= PUBLIC_REVIEW_PUBLISH_LIMITS.userConcurrency || await tx.publicReviewCache.count({ where: { key: { startsWith: `${prefix}lock:` }, leaseUntil: { gt: now } } }) >= PUBLIC_REVIEW_PUBLISH_LIMITS.globalConcurrency) {
        throw new PublicReviewError("Too many reviews are being added. Please try again shortly.", 429, 2)
      }
      await consume(tx, now, "fetch-hour", user, 3_600_000, PUBLIC_REVIEW_PUBLISH_LIMITS.fetchUserHourly)
      await consume(tx, now, "fetch-hour", "global", 3_600_000, PUBLIC_REVIEW_PUBLISH_LIMITS.fetchGlobalHourly)
      const token = randomUUID()
      const expiresAt = new Date(now.getTime() + PUBLIC_REVIEW_PUBLISH_LIMITS.leaseMs)
      const data = { inputHash: "publish-lock-v1", status: "pending", leaseToken: token, leaseUntil: expiresAt, expiresAt, markdown: null }
      await tx.publicReviewCache.upsert({ where: { key }, create: { key, ...data }, update: data })
      return { key, token }
    }),
    reserveWrite: (userId, lease) => locked(async (tx, now) => {
      await assertLease(tx, now, lease)
      const user = subject(userId)
      await consume(tx, now, "write-hour", user, 3_600_000, PUBLIC_REVIEW_PUBLISH_LIMITS.writeUserHourly)
      await consume(tx, now, "write-day", user, 86_400_000, PUBLIC_REVIEW_PUBLISH_LIMITS.writeUserDaily)
      await consume(tx, now, "write-hour", "global", 3_600_000, PUBLIC_REVIEW_PUBLISH_LIMITS.writeGlobalHourly)
    }),
    assertLease: (lease) => locked((tx, now) => assertLease(tx, now, lease)),
    release: (lease) => locked(async (tx) => {
      await tx.publicReviewCache.deleteMany({ where: { key: lease.key, leaseToken: lease.token } })
    }),
  }
}
