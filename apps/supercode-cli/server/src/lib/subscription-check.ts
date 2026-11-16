import { FREE_MONTHLY_CREDITS } from "@super/billing"
import prisma from "./prisma"

export interface PlanInfo {
  tier: "free" | "spark" | "pro" | "ultra"
  name: string
  requestLimit: number
  contextLimit: number
  modelAccess: "open" | "premium" | "all"
  creditAmountCents: number
  monthlyCredits: number
  isGrandfathered: boolean
  currentPeriodEnd: Date | null
}

function planInfoFromRow(subscription: {
  plan: {
    tier: string
    name: string
    requestLimit: number
    contextLimit: number
    modelAccess: string
    creditAmountCents: number
    monthlyCredits: number
  }
  currentPeriodEnd: Date | null
  metadata: unknown
}): PlanInfo {
  return {
    tier: subscription.plan.tier as PlanInfo["tier"],
    name: subscription.plan.name,
    requestLimit: subscription.plan.requestLimit,
    contextLimit: subscription.plan.tier === "free" ? 16_000 : subscription.plan.contextLimit,
    modelAccess: subscription.plan.modelAccess as PlanInfo["modelAccess"],
    creditAmountCents: subscription.plan.creditAmountCents,
    monthlyCredits: subscription.plan.tier === "free" ? FREE_MONTHLY_CREDITS : subscription.plan.monthlyCredits,
    isGrandfathered: (subscription.metadata as Record<string, unknown> | null)?.grandfathered === true,
    currentPeriodEnd: subscription.currentPeriodEnd,
  }
}

export async function ensureFreeSubscription(userId: string): Promise<PlanInfo | null> {
  try {
    const existing = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["active", "trialing"] },
        plan: { tier: "free" },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    })
    if (existing?.plan) return planInfoFromRow(existing)

    const freePlan = await prisma.plan.findFirst({
      where: { tier: "free", active: true },
      orderBy: { sortOrder: "asc" },
    })
    if (!freePlan) return null

    const subscription = await prisma.subscription.upsert({
      where: { dodoSubscriptionId: `free-${userId}` },
      update: { planId: freePlan.id, status: "active", currentPeriodEnd: null },
      create: {
        userId,
        planId: freePlan.id,
        dodoSubscriptionId: `free-${userId}`,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
        metadata: { source: "auto-ensure-free" },
      },
      include: { plan: true },
    })
    return planInfoFromRow(subscription)
  } catch (error) {
    console.error("[subscription-check] Unable to provision Free:", error)
    return null
  }
}

export async function getActiveSubscription(userId: string) {
  const paid = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["active", "trialing"] },
      plan: { tier: { not: "free" } },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
    },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  })
  if (paid) return paid

  return prisma.subscription.findFirst({
    where: { userId, status: { in: ["active", "trialing"] }, plan: { tier: "free" } },
    include: { plan: true },
    orderBy: { createdAt: { sort: "desc" } },
  })
}

export async function getSubscriptionPlan(userId: string): Promise<PlanInfo | null> {
  try {
    const subscription = await getActiveSubscription(userId)
    if (!subscription?.plan) return ensureFreeSubscription(userId)

    return planInfoFromRow(subscription)
  } catch (error) {
    console.error("[subscription-check] Unable to verify subscription:", error)
    return null
  }
}
