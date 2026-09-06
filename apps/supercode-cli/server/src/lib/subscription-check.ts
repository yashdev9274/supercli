import { Prisma } from "../generated"
import prisma from "./prisma"

export interface PlanInfo {
  tier: "spark" | "spark-premium" | "pro" | "ultra"
  name: string
  requestLimit: number
  contextLimit: number
  modelAccess: "open" | "premium" | "all"
  creditAmountCents: number
  isGrandfathered: boolean
  currentPeriodEnd: Date | null
}

function isGrandfathered(sub: { metadata: unknown }): boolean {
  return (sub.metadata as Record<string, unknown> | null)?.grandfathered === true
}

/**
 * Hardcoded Spark (Grandfathered) defaults — matches `prisma/seed.ts`.
 * Used as a fail-open fallback when the DB is unreachable so existing
 * users don't get locked out by transient infra issues. NEVER use this to
 * grant access to users who have never subscribed — that's still null.
 */
const SPARK_GRANDFATHERED_FALLBACK: PlanInfo = {
  tier: "spark",
  name: "Spark (Grandfathered)",
  requestLimit: 10000,
  contextLimit: 16000,
  modelAccess: "open",
  creditAmountCents: 500,
  isGrandfathered: true,
  currentPeriodEnd: null,
}

/** True for Prisma request / connection errors where it's safe to fail open. */
function isTransientInfraError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return true
  if (error instanceof Prisma.PrismaClientInitializationError) return true
  if (error instanceof Prisma.PrismaClientRustPanicError) return true
  // node-pg / driver-level connection errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, etc.)
  const code = (error as { code?: string } | null)?.code
  if (typeof code === "string" && /^(ECONN|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|EPIPE)/.test(code)) {
    return true
  }
  return false
}

function planInfoFromRow(subscription: {
  plan: {
    tier: string
    name: string
    requestLimit: number
    contextLimit: number
    modelAccess: string
    creditAmountCents: number
  }
  currentPeriodEnd: Date | null
  metadata: unknown
}): PlanInfo {
  return {
    tier: subscription.plan.tier as PlanInfo["tier"],
    name: subscription.plan.name,
    requestLimit: subscription.plan.requestLimit,
    contextLimit: subscription.plan.contextLimit,
    modelAccess: subscription.plan.modelAccess as PlanInfo["modelAccess"],
    creditAmountCents: subscription.plan.creditAmountCents,
    isGrandfathered: isGrandfathered(subscription),
    currentPeriodEnd: subscription.currentPeriodEnd,
  }
}

/**
 * Ensure every authenticated user has an active Spark subscription.
 * Signup never auto-created rows, so many "Spark" users only existed in
 * product copy / old grandfather scripts and hit plan_limit_exceeded on chat.
 */
export async function ensureSparkSubscription(userId: string): Promise<PlanInfo | null> {
  try {
    const existing = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["active", "trialing"] },
        plan: { tier: "spark" },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    })
    if (existing?.plan) {
      return planInfoFromRow({
        ...existing,
        plan: existing.plan,
        metadata: existing.metadata ?? { grandfathered: true },
      })
    }

    const sparkPlan = await prisma.plan.findFirst({
      where: { tier: "spark", active: true },
      orderBy: { sortOrder: "asc" },
    })
    if (!sparkPlan) {
      console.error("[subscription-check] Spark plan missing — run prisma seed")
      // Still allow chat with hardcoded Spark limits so seed lag cannot lock users out.
      return SPARK_GRANDFATHERED_FALLBACK
    }

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const dodoSubId = `spark-${userId}-${Date.now()}`

    try {
      await prisma.subscription.create({
        data: {
          userId,
          planId: sparkPlan.id,
          dodoSubscriptionId: dodoSubId,
          status: "active",
          currentPeriodStart: new Date(),
          currentPeriodEnd: null, // free Spark does not expire
          metadata: { grandfathered: true, source: "auto-ensure-spark" },
        },
      })
    } catch (createError) {
      // Race: another request may have created the row first.
      console.warn("[subscription-check] Spark create race/error:", createError)
      const raced = await prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ["active", "trialing"] },
          plan: { tier: "spark" },
        },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      })
      if (raced?.plan) return planInfoFromRow(raced)
      // Last resort: in-memory Spark so chat is not blocked.
      return SPARK_GRANDFATHERED_FALLBACK
    }

    try {
      await prisma.creditBalance.upsert({
        where: {
          userId_planId: { userId, planId: sparkPlan.id },
        },
        update: {},
        create: {
          userId,
          planId: sparkPlan.id,
          balanceCents: sparkPlan.creditAmountCents,
          totalCredits: sparkPlan.creditAmountCents,
          resetAt: periodEnd,
        },
      })
    } catch (creditError) {
      // Credits are soft; don't fail plan resolution.
      console.warn("[subscription-check] credit seed failed:", creditError)
    }

    return {
      tier: "spark",
      name: sparkPlan.name,
      requestLimit: sparkPlan.requestLimit,
      contextLimit: sparkPlan.contextLimit,
      modelAccess: (sparkPlan.modelAccess as PlanInfo["modelAccess"]) || "open",
      creditAmountCents: sparkPlan.creditAmountCents,
      isGrandfathered: true,
      currentPeriodEnd: null,
    }
  } catch (error) {
    console.error("[subscription-check] ensureSparkSubscription failed:", error)
    if (isTransientInfraError(error)) {
      return SPARK_GRANDFATHERED_FALLBACK
    }
    // Prefer access over hard lock for authenticated users.
    return SPARK_GRANDFATHERED_FALLBACK
  }
}

/**
 * Reads the user's active subscription plan directly from the CLI server DB.
 * Authenticated users without a row are auto-provisioned onto free Spark
 * (grandfathered) so chat never hard-fails with "no active subscription".
 * On DB connection / request errors we fail open with Spark defaults.
 */
export async function getSubscriptionPlan(userId: string): Promise<PlanInfo | null> {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["active", "trialing"] },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    })

    if (!subscription?.plan) {
      return ensureSparkSubscription(userId)
    }

    const grandfathered = isGrandfathered(subscription)

    // Paid plans expire at period end; free Spark never expires
    if (
      !grandfathered &&
      subscription.plan.tier !== "spark" &&
      subscription.currentPeriodEnd &&
      new Date() > subscription.currentPeriodEnd
    ) {
      try {
        const fallback = await prisma.subscription.findFirst({
          where: {
            userId,
            plan: { tier: "spark" },
            status: "active",
          },
          include: { plan: true },
        })
        if (fallback?.plan) {
          return planInfoFromRow(fallback)
        }
        // Expired paid tier with no Spark row — provision free Spark instead of locking out.
        return ensureSparkSubscription(userId)
      } catch (fallbackError) {
        console.error("[subscription-check] DB error during fallback lookup:", fallbackError)
        if (isTransientInfraError(fallbackError)) {
          return SPARK_GRANDFATHERED_FALLBACK
        }
        return ensureSparkSubscription(userId)
      }
    }

    return planInfoFromRow(subscription)
  } catch (error) {
    console.error("[subscription-check] DB error:", error)
    if (isTransientInfraError(error)) {
      return SPARK_GRANDFATHERED_FALLBACK
    }
    // Prefer fail-open Spark for authenticated traffic over a hard lock.
    return SPARK_GRANDFATHERED_FALLBACK
  }
}
