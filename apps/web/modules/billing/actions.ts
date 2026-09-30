"use server"

import { auth } from "@/lib/auth"
import prisma from "@super/db"
import { headers } from "next/headers"

import {
  MONTHLY_REVIEW_CREDITS,
  remainingReviewCredits,
  reviewCreditPeriodBounds,
} from "@/modules/billing/review-credits"
import {
  getGithubTokenForUser,
  getPullRequestAuthor,
  type PullRequestAuthor,
} from "@/modules/github/lib/github"

export type BillingRange = "14d" | "30d" | "90d"

export type BillingAnalytics = {
  scopeName: string
  range: BillingRange
  period: {
    allocation: number
    used: number
    remaining: number
    renewsAt: string
  }
  dailyUsage: Array<{ date: string; label: string; credits: number }>
  categories: Array<{
    name: string
    color: string
    reviews: number
    credits: number
  }>
  developers: Array<{
    id: string
    name: string
    login: string
    avatarUrl: string | null
    reviews: number
    credits: number
  }>
}

const RANGE_DAYS: Record<BillingRange, number> = {
  "14d": 14,
  "30d": 30,
  "90d": 90,
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function rangeStart(range: BillingRange, now: Date): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - RANGE_DAYS[range] + 1)
  return start
}

async function requireSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user
}

export async function getBillingAnalytics(
  range: BillingRange = "30d",
): Promise<BillingAnalytics> {
  const sessionUser = await requireSessionUser()
  const now = new Date()
  const bounds = reviewCreditPeriodBounds(now)
  const start = rangeStart(range, now)

  const currentUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      image: true,
      organizationId: true,
      organization: { select: { name: true } },
      accounts: {
        where: { providerId: "github" },
        select: { accountId: true },
        take: 1,
      },
    },
  })
  if (!currentUser) throw new Error("User not found")

  let scopedUsers = [currentUser.id]
  let scopeName = currentUser.name
  if (currentUser.organizationId) {
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        organizationId: currentUser.organizationId,
        userId: currentUser.id,
        status: "active",
      },
      select: { id: true },
    })
    if (membership) {
      const members = await prisma.organizationMembership.findMany({
        where: {
          organizationId: currentUser.organizationId,
          status: "active",
        },
        select: { userId: true },
      })
      scopedUsers = [...new Set(members.map((member) => member.userId))]
      scopeName = currentUser.organization?.name ?? "Current team"
    }
  }

  type CreditPeriodSnapshot = {
    allocation: number
    usedCredits: number
    periodEnd: Date
  }
  type CreditEntrySnapshot = {
    userId: string
    kind: string
    quantity: number
    createdAt: Date
    reviewRunId: string
    reviewRun: {
      prNumber: number
      repository: {
        owner: string
        name: string
      }
    }
  }

  let personalPeriod: CreditPeriodSnapshot | null = null
  let entries: CreditEntrySnapshot[] = []

  // A running dev server can retain the pre-generation Prisma singleton. The
  // dashboard remains read-only and renders an empty ledger until it restarts.
  if (prisma.reviewCreditPeriod && prisma.reviewCreditEntry) {
    try {
      const creditData = await Promise.all([
        prisma.reviewCreditPeriod.findUnique({
          where: {
            userId_periodStart: {
              userId: currentUser.id,
              periodStart: bounds.start,
            },
          },
          select: {
            allocation: true,
            usedCredits: true,
            periodEnd: true,
          },
        }),
        prisma.reviewCreditEntry.findMany({
          where: {
            userId: { in: scopedUsers },
            createdAt: { gte: start, lt: new Date(now.getTime() + 1) },
            kind: { in: ["reservation", "refund"] },
          },
          select: {
            userId: true,
            kind: true,
            quantity: true,
            createdAt: true,
            reviewRunId: true,
            reviewRun: {
              select: {
                prNumber: true,
                repository: {
                  select: {
                    owner: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
      ])
      personalPeriod = creditData[0]
      entries = creditData[1]
    } catch (error) {
      console.warn("Review credit persistence is not available yet", error)
    }
  }

  const daily = new Map<string, number>()
  for (let offset = 0; offset < RANGE_DAYS[range]; offset += 1) {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + offset)
    daily.set(utcDay(date), 0)
  }

  const uniqueRuns = new Map<
    string,
    {
      userId: string
      owner: string
      repo: string
      prNumber: number
    }
  >()
  for (const entry of entries) {
    uniqueRuns.set(entry.reviewRunId, {
      userId: entry.userId,
      owner: entry.reviewRun.repository.owner,
      repo: entry.reviewRun.repository.name,
      prNumber: entry.reviewRun.prNumber,
    })
  }

  const tokenPromises = new Map<string, Promise<string>>()
  const authorResults = await Promise.all(
    [...uniqueRuns.entries()].map(async ([reviewRunId, run]) => {
      try {
        let tokenPromise = tokenPromises.get(run.userId)
        if (!tokenPromise) {
          tokenPromise = getGithubTokenForUser(run.userId)
          tokenPromises.set(run.userId, tokenPromise)
        }
        const token = await tokenPromise
        const author = await getPullRequestAuthor(
          token,
          run.owner,
          run.repo,
          run.prNumber,
        )
        return [reviewRunId, author] as const
      } catch (error) {
        console.warn(
          `Unable to resolve PR author for ${run.owner}/${run.repo}#${run.prNumber}`,
          error,
        )
        return [reviewRunId, null] as const
      }
    }),
  )
  const authorByRun = new Map<string, PullRequestAuthor | null>(authorResults)
  const developersById = new Map<
    string,
    PullRequestAuthor & { credits: number; reviewRuns: Set<string> }
  >()
  let codeReviewCredits = 0
  const codeReviewRuns = new Set<string>()

  for (const entry of entries) {
    const day = utcDay(entry.createdAt)
    daily.set(day, (daily.get(day) ?? 0) + entry.quantity)

    const author = authorByRun.get(entry.reviewRunId)
    if (author) {
      const developer = developersById.get(author.id) ?? {
        ...author,
        credits: 0,
        reviewRuns: new Set<string>(),
      }
      developer.credits += entry.quantity
      if (entry.kind === "reservation") {
        developer.reviewRuns.add(entry.reviewRunId)
      }
      developersById.set(author.id, developer)
    }

    codeReviewCredits += entry.quantity
    if (entry.kind === "reservation") codeReviewRuns.add(entry.reviewRunId)
  }

  const period = personalPeriod ?? {
    allocation: MONTHLY_REVIEW_CREDITS,
    usedCredits: 0,
    periodEnd: bounds.end,
  }

  return {
    scopeName,
    range,
    period: {
      allocation: period.allocation,
      used: period.usedCredits,
      remaining: remainingReviewCredits(period.allocation, period.usedCredits),
      renewsAt: period.periodEnd.toISOString(),
    },
    dailyUsage: [...daily.entries()].map(([date, credits]) => ({
      date,
      label: dateLabel(new Date(`${date}T00:00:00.000Z`)),
      credits: Math.max(0, credits),
    })),
    categories: [
      {
        name: "Code Review",
        color: "#36e3a2",
        reviews: codeReviewRuns.size,
        credits: Math.max(0, codeReviewCredits),
      },
      { name: "TREX", color: "#7657ff", reviews: 0, credits: 0 },
      { name: "CLI", color: "#efb7ed", reviews: 0, credits: 0 },
    ],
    developers: [...developersById.values()]
      .map((developer) => ({
        id: developer.id,
        name: developer.name,
        login: developer.login,
        avatarUrl: developer.avatarUrl,
        reviews: developer.reviewRuns.size,
        credits: Math.max(0, developer.credits),
      }))
      .sort((left, right) => right.credits - left.credits),
  }
}
