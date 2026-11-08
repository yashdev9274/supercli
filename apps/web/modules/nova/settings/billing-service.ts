import { headers } from "next/headers"

import { auth } from "@super/auth/server"

import { ensureHarnessToken } from "@/modules/nova/harness/auth"
import { terminalHarnessUrl } from "@/modules/nova/harness/client"

export type BillingPlanName = "Free" | "Spark" | "Pro" | "Ultra"

export type BillingInfo = {
  planName: BillingPlanName | null
  planTier: string | null
  planDisplayPrice: string | null
  renewsAt: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  balanceUsd: number | null
  totalCreditsUsd: number | null
  spentThisPeriodUsd: number | null
  balanceCredits: number | null
  totalCredits: number | null
  spentThisPeriodCredits: number | null
  resetAt: string | null
  requestsUsed: number | null
  requestLimit: number | null
  isGrandfathered: boolean
  source: "harness" | "none"
}

// Mirror apps/supercode-cli/server/prisma/seed.ts plan names:
//   spark            → "Free"
//   spark-premium    → "Spark"
//   pro              → "Pro"
//   ultra            → "Ultra"
const HARNESS_TIER_TO_NAME: Record<string, BillingPlanName> = {
  spark: "Free",
  "spark-premium": "Spark",
  pro: "Pro",
  ultra: "Ultra",
}

const HARNESS_TIER_TO_PRICE: Record<string, { price: string; credits: string }> = {
  spark: { price: "$0/mo", credits: "1,000 monthly credits" },
  "spark-premium": { price: "$5/mo", credits: "$5 credits" },
  pro: { price: "$20/mo", credits: "$25 credits" },
  ultra: { price: "$100/mo", credits: "$110 credits" },
}

function mapPlanName(tier: string | null | undefined): BillingPlanName | null {
  if (!tier) return null
  return HARNESS_TIER_TO_NAME[tier] ?? null
}

function mapDisplayPrice(tier: string | null | undefined): string | null {
  if (!tier) return null
  return HARNESS_TIER_TO_PRICE[tier]?.price ?? null
}

export async function getBillingInfo(input: {
  userId: string
  email: string
  name?: string | null
  image?: string | null
}): Promise<BillingInfo> {
  let harnessToken: string | null = null
  try {
    const harness = await ensureHarnessToken({
      email: input.email,
      name: input.name,
      image: input.image,
      background: true,
    })
    harnessToken = harness.token
  } catch {
    harnessToken = null
  }
  if (!harnessToken) {
    return emptyBilling()
  }

  try {
    const meResponse = await fetch(`${terminalHarnessUrl()}/api/user/me`, {
      headers: {
        Authorization: `Bearer ${harnessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
    if (!meResponse.ok) return emptyBilling()
    const me = (await meResponse.json()) as { id?: string }
    if (!me.id) return emptyBilling()

    const statusResponse = await fetch(
      `${terminalHarnessUrl()}/api/billing/status?userId=${encodeURIComponent(me.id)}`,
      {
        headers: {
          Authorization: `Bearer ${harnessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    )
    if (!statusResponse.ok) return emptyBilling()

    const status = (await statusResponse.json()) as {
      subscription?: {
        currentPeriodStart?: string | null
        currentPeriodEnd?: string | null
        cancelAtPeriodEnd?: boolean
        metadata?: Record<string, unknown> | null
        isGrandfathered?: boolean
      } | null
      plan?: { tier?: string; name?: string; requestLimit?: number | null } | null
      creditBalance?: {
        balanceCents?: number | null
        totalCredits?: number | null
        resetAt?: string | null
      } | null
      productCreditBalance?: {
        balanceCredits: number
        allowanceCredits: number
        resetAt: string
      } | null
      requestsUsed?: number
      requestLimit?: number | null
    }

    const tier = status.plan?.tier ?? null
    const planName = mapPlanName(tier)
    const balanceUsd =
      typeof status.creditBalance?.balanceCents === "number"
        ? Math.round(status.creditBalance.balanceCents) / 100
        : null
    const totalCreditsUsd =
      typeof status.creditBalance?.totalCredits === "number"
        ? Math.round(status.creditBalance.totalCredits) / 100
        : null
    const spentUsd =
      balanceUsd != null && totalCreditsUsd != null
        ? Math.max(0, Math.round((totalCreditsUsd - balanceUsd) * 100) / 100)
        : null

    return {
      planName,
      planTier: tier,
      planDisplayPrice: mapDisplayPrice(tier),
      renewsAt: status.subscription?.currentPeriodEnd ?? null,
      currentPeriodStart: status.subscription?.currentPeriodStart ?? null,
      currentPeriodEnd: status.subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: Boolean(status.subscription?.cancelAtPeriodEnd),
      balanceUsd,
      totalCreditsUsd,
      spentThisPeriodUsd: spentUsd,
      balanceCredits: status.productCreditBalance?.balanceCredits ?? null,
      totalCredits: status.productCreditBalance?.allowanceCredits ?? null,
      spentThisPeriodCredits: status.productCreditBalance
        ? Math.max(0, status.productCreditBalance.allowanceCredits - status.productCreditBalance.balanceCredits)
        : null,
      resetAt: status.productCreditBalance?.resetAt ?? status.creditBalance?.resetAt ?? null,
      requestsUsed: status.requestsUsed ?? null,
      requestLimit: status.plan?.requestLimit ?? null,
      isGrandfathered: Boolean(status.subscription?.isGrandfathered),
      source: "harness",
    }
  } catch (error) {
    console.error("[billing] Failed to fetch harness billing status", error)
    return emptyBilling()
  }
}

function emptyBilling(): BillingInfo {
  return {
    planName: null,
    planTier: null,
    planDisplayPrice: null,
    renewsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    balanceUsd: 0,
    totalCreditsUsd: 0,
    spentThisPeriodUsd: 0,
    balanceCredits: null,
    totalCredits: null,
    spentThisPeriodCredits: null,
    resetAt: null,
    requestsUsed: null,
    requestLimit: null,
    isGrandfathered: false,
    source: "none",
  }
}

export async function requireSessionUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id || !session.user.email) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 })
  }
  return session.user.id
}
