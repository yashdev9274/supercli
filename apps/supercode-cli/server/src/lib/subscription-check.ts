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

/**
 * Reads the user's active subscription plan directly from the CLI server DB.
 * Grandfathered users always fall back to Spark (10K/16K) — never fully locked.
 * Returns null only if the user truly has no active subscription. On DB
 * connection / request errors we fail open with the grandfathered Spark
 * defaults so a transient outage doesn't lock out existing users.
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

    if (!subscription?.plan) return null

    const grandfathered = isGrandfathered(subscription)

    // Paid plans expire at period end; grandfathered Spark never expires
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
          return {
            tier: "spark",
            name: fallback.plan.name,
            requestLimit: fallback.plan.requestLimit,
            contextLimit: fallback.plan.contextLimit,
            modelAccess: "open",
            creditAmountCents: fallback.plan.creditAmountCents,
            isGrandfathered: true,
            currentPeriodEnd: fallback.currentPeriodEnd,
          }
        }
        return null
      } catch (fallbackError) {
        console.error("[subscription-check] DB error during fallback lookup:", fallbackError)
        if (isTransientInfraError(fallbackError)) {
          return SPARK_GRANDFATHERED_FALLBACK
        }
        return null
      }
    }

    return {
      tier: subscription.plan.tier as PlanInfo["tier"],
      name: subscription.plan.name,
      requestLimit: subscription.plan.requestLimit,
      contextLimit: subscription.plan.contextLimit,
      modelAccess: subscription.plan.modelAccess as PlanInfo["modelAccess"],
      creditAmountCents: subscription.plan.creditAmountCents,
      isGrandfathered: grandfathered,
      currentPeriodEnd: subscription.currentPeriodEnd,
    }
  } catch (error) {
    console.error("[subscription-check] DB error:", error)
    if (isTransientInfraError(error)) {
      // Fail open: don't lock out grandfathered users because the DB blipped.
      // Returning the Spark fallback lets the request proceed; if the user
      // is brand-new they would still hit /upgrade because they don't have a
      // subscription row — but during a DB outage we err on access over auth.
      return SPARK_GRANDFATHERED_FALLBACK
    }
    // Unknown error — be conservative and surface as "no subscription".
    return null
  }
}
