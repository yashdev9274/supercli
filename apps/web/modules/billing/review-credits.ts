import prisma from "@super/db"

export const MONTHLY_REVIEW_CREDITS = 20
const MAX_TRANSACTION_ATTEMPTS = 3

export type ReviewCreditPeriodBounds = {
  start: Date
  end: Date
}

export type ReviewCreditAdmission = {
  reviewRunId: string
  headSha: string
  status: "reserved" | "reused"
  remainingCredits: number
}

export class CreditLimitExceededError extends Error {
  readonly code = "REVIEW_CREDITS_EXHAUSTED" as const

  constructor(
    readonly allocation = MONTHLY_REVIEW_CREDITS,
    readonly renewsAt?: Date,
  ) {
    super(
      renewsAt
        ? `Monthly review credits exhausted. Your ${allocation} credits renew on ${renewsAt.toISOString().slice(0, 10)} UTC.`
        : `Monthly review credits exhausted. Your plan includes ${allocation} reviews per month.`,
    )
    this.name = "CreditLimitExceededError"
  }
}

export class ReviewCreditIneligibleError extends Error {
  readonly code = "REVIEW_CREDITS_INELIGIBLE" as const

  constructor() {
    super("A connected GitHub account is required to use PR review credits.")
    this.name = "ReviewCreditIneligibleError"
  }
}

export function reviewCreditPeriodBounds(now = new Date()): ReviewCreditPeriodBounds {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

export function remainingReviewCredits(allocation: number, usedCredits: number): number {
  return Math.max(0, allocation - usedCredits)
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "P2002" ||
      (error as { code?: string }).code === "P2034")
  )
}

async function withTransactionRetry<T>(work: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await work()
    } catch (error) {
      lastError = error
      if (!isRetryableTransactionError(error) || attempt === MAX_TRANSACTION_ATTEMPTS - 1) {
        throw error
      }
    }
  }
  throw lastError
}

export async function reserveReviewCredit(input: {
  userId: string
  repositoryId: string
  prNumber: number
  headSha: string
  source: string
  rerun?: boolean
  now?: Date
}): Promise<ReviewCreditAdmission> {
  const githubAccount = await prisma.account.findFirst({
    where: { userId: input.userId, providerId: "github" },
    select: { id: true },
  })
  if (!githubAccount) throw new ReviewCreditIneligibleError()

  const now = input.now ?? new Date()
  const bounds = reviewCreditPeriodBounds(now)

  return withTransactionRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const period = await tx.reviewCreditPeriod.upsert({
          where: {
            userId_periodStart: {
              userId: input.userId,
              periodStart: bounds.start,
            },
          },
          update: { periodEnd: bounds.end },
          create: {
            userId: input.userId,
            periodStart: bounds.start,
            periodEnd: bounds.end,
            allocation: MONTHLY_REVIEW_CREDITS,
          },
        })

        const run = await tx.reviewRun.upsert({
          where: {
            userId_repositoryId_prNumber_headSha: {
              userId: input.userId,
              repositoryId: input.repositoryId,
              prNumber: input.prNumber,
              headSha: input.headSha,
            },
          },
          update: {},
          create: {
            userId: input.userId,
            repositoryId: input.repositoryId,
            prNumber: input.prNumber,
            headSha: input.headSha,
            source: input.source,
          },
        })

        if (["reserved", "running"].includes(run.status) || (run.status === "completed" && !input.rerun)) {
          return {
            reviewRunId: run.id,
            headSha: run.headSha,
            status: "reused" as const,
            remainingCredits: remainingReviewCredits(period.allocation, period.usedCredits),
          }
        }

        const claimed = await tx.reviewCreditPeriod.updateMany({
          where: {
            id: period.id,
            usedCredits: { lt: MONTHLY_REVIEW_CREDITS },
          },
          data: { usedCredits: { increment: 1 } },
        })
        if (claimed.count !== 1) {
          throw new CreditLimitExceededError(period.allocation, period.periodEnd)
        }

        const attempt = run.attempt + 1
        await tx.reviewRun.update({
          where: { id: run.id },
          data: {
            source: input.source,
            status: "reserved",
            attempt,
            failure: null,
            reservedAt: now,
            refundedAt: null,
            startedAt: null,
            completedAt: null,
          },
        })
        await tx.reviewCreditEntry.create({
          data: {
            userId: input.userId,
            periodId: period.id,
            reviewRunId: run.id,
            kind: "reservation",
            quantity: 1,
            idempotencyKey: `review-run:${run.id}:reservation:${attempt}`,
            source: input.source,
          },
        })

        return {
          reviewRunId: run.id,
          headSha: run.headSha,
          status: "reserved" as const,
          remainingCredits: remainingReviewCredits(period.allocation, period.usedCredits + 1),
        }
      },
      { isolationLevel: "Serializable" },
    ),
  )
}

export async function markReviewCreditRunning(reviewRunId: string): Promise<void> {
  await prisma.reviewRun.updateMany({
    where: { id: reviewRunId, status: "reserved" },
    data: { status: "running", startedAt: new Date() },
  })
}

export async function settleReviewCredit(input: {
  reviewRunId: string
  reviewId: string
}): Promise<void> {
  await withTransactionRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const run = await tx.reviewRun.findUnique({ where: { id: input.reviewRunId } })
        if (!run || run.status === "completed") return
        if (run.status === "refunded") {
          throw new Error("Cannot settle a refunded review credit")
        }

        await tx.reviewRun.update({
          where: { id: run.id },
          data: {
            reviewId: input.reviewId,
            status: "completed",
            completedAt: new Date(),
            failure: null,
          },
        })
        const reservation = await tx.reviewCreditEntry.findFirst({
          where: { reviewRunId: run.id, kind: "reservation" },
          orderBy: { createdAt: "desc" },
        })
        if (!reservation) throw new Error("Review credit reservation not found")
        await tx.reviewCreditEntry.upsert({
          where: { idempotencyKey: `review-run:${run.id}:settlement:${run.attempt}` },
          update: {},
          create: {
            userId: run.userId,
            periodId: reservation.periodId,
            reviewRunId: run.id,
            kind: "settlement",
            quantity: 0,
            idempotencyKey: `review-run:${run.id}:settlement:${run.attempt}`,
            source: run.source,
          },
        })
      },
      { isolationLevel: "Serializable" },
    ),
  )
}

export async function refundReviewCredit(
  reviewRunId: string | undefined,
  failure: string,
): Promise<void> {
  if (!reviewRunId) return

  await withTransactionRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const run = await tx.reviewRun.findUnique({ where: { id: reviewRunId } })
        if (!run || run.status === "completed" || run.status === "refunded") return

        const reservation = await tx.reviewCreditEntry.findFirst({
          where: { reviewRunId: run.id, kind: "reservation" },
          orderBy: { createdAt: "desc" },
        })
        if (!reservation) return

        const refundKey = `review-run:${run.id}:refund:${run.attempt}`
        const existingRefund = await tx.reviewCreditEntry.findUnique({
          where: { idempotencyKey: refundKey },
          select: { id: true },
        })
        if (existingRefund) return

        await tx.reviewCreditPeriod.updateMany({
          where: { id: reservation.periodId, usedCredits: { gt: 0 } },
          data: { usedCredits: { decrement: 1 } },
        })
        await tx.reviewCreditEntry.create({
          data: {
            userId: run.userId,
            periodId: reservation.periodId,
            reviewRunId: run.id,
            kind: "refund",
            quantity: -1,
            idempotencyKey: refundKey,
            source: run.source,
          },
        })
        await tx.reviewRun.update({
          where: { id: run.id },
          data: {
            status: "refunded",
            failure: failure.slice(0, 4_000),
            refundedAt: new Date(),
          },
        })
      },
      { isolationLevel: "Serializable" },
    ),
  )
}
