import { Router } from "express"
import prisma from "../../lib/prisma"
import { getDodo } from "../../lib/dodo"
import { billing } from "../../lib/credit-meter"
import { getSubscriptionPlan } from "../../lib/subscription-check"

const router = Router()

function studioUrl(path: string): string {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"
  return `${clientUrl.replace(/\/$/, "")}${path}`
}

const PLAN_SELECT = {
  tier: true,
  name: true,
  requestLimit: true,
  contextLimit: true,
  modelAccess: true,
  creditAmountCents: true,
  monthlyCredits: true,
} as const

async function getActiveSubscription(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["active", "trialing"] },
    },
    include: { plan: { select: PLAN_SELECT } },
    orderBy: { createdAt: "desc" },
  })
  return subscription
}

async function getGrandfatheredFallback(userId: string) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      plan: { tier: "spark" },
      status: "active",
    },
    include: { plan: { select: PLAN_SELECT } },
  })
}

function isGrandfathered(sub: { metadata: unknown }): boolean {
  return (sub.metadata as Record<string, unknown> | null)?.grandfathered === true
}

// GET /api/billing/status?userId=... — subscription + credit balance + usage
router.get("/", async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined
    if (!userId) {
      res.status(400).json({ error: "userId is required" })
      return
    }

    await getSubscriptionPlan(userId)
    const subscription = await getActiveSubscription(userId)
    const productCreditBalance = await billing.getBalance(userId)

    // Monthly request usage (calendar month, matching request-counter)
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const requestsUsed = await prisma.usageEvent.count({
      where: { userId, createdAt: { gte: startOfMonth } },
    })

    if (!subscription) {
      res.json({ subscription: null, plan: null, creditBalance: null, productCreditBalance, requestsUsed })
      return
    }

    // Expired paid period → fall back to grandfathered Spark (never locked out)
    if (
      subscription.plan.tier !== "spark" &&
      !isGrandfathered(subscription) &&
      subscription.currentPeriodEnd &&
      new Date() > subscription.currentPeriodEnd
    ) {
      const fallback = await getGrandfatheredFallback(userId)
      if (fallback) {
        res.json({
          subscription: {
            id: fallback.id,
            status: fallback.status,
            metadata: fallback.metadata,
          },
          plan: fallback.plan,
          creditBalance: null,
          productCreditBalance,
          requestsUsed,
        })
        return
      }
      res.json({ subscription: null, plan: null, creditBalance: null, productCreditBalance, requestsUsed })
      return
    }

    res.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        metadata: subscription.metadata,
        isGrandfathered: isGrandfathered(subscription),
      },
      plan: subscription.plan,
      creditBalance: null,
      productCreditBalance,
      requestsUsed,
    })
  } catch (error) {
    console.error("[billing/status] Failed to fetch subscription status:", error)
    res.status(503).json({ error: "Billing is temporarily unavailable" })
  }
})

// POST /api/billing/status — { action: "portal" } → Dodo customer portal URL
router.post("/", async (req, res) => {
  try {
    const userId = req.body.userId as string | undefined
    if (!userId) {
      res.status(400).json({ error: "userId is required" })
      return
    }

    const { action } = req.body
    if (action !== "portal") {
      res.status(400).json({ error: "Unknown action" })
      return
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.dodoCustomerId) {
      res.status(404).json({ error: "No Dodo customer linked to this account" })
      return
    }

    const dodo = getDodo()
    if (!dodo) {
      res.status(503).json({ error: "Payments are not configured yet" })
      return
    }

    const session = await dodo.customers.customerPortal.create(user.dodoCustomerId, {
      return_url:
        process.env.DODO_RETURN_URL ?? studioUrl("/studio?portal=true"),
    })

    res.json({ url: session.link })
  } catch (error) {
    console.error("[billing/status] Portal creation failed:", error)
    res.status(500).json({ error: "Failed to open billing portal" })
  }
})

// DELETE /api/billing/status — cancel subscription (keep access until period end)
router.delete("/", async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined
    if (!userId) {
      res.status(400).json({ error: "userId is required" })
      return
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["active", "trialing"] },
        plan: { tier: { not: "spark" } },
      },
      orderBy: { createdAt: "desc" },
    })

    if (!subscription) {
      res.json({ ok: true, message: "No active paid subscription to cancel" })
      return
    }

    // Cancel with Dodo if we have a real subscription id + key configured
    const dodo = getDodo()
    if (dodo && !subscription.dodoSubscriptionId.startsWith("grandfathered-")) {
      try {
        await dodo.subscriptions.update(subscription.dodoSubscriptionId, {
          cancel_at_next_billing_date: true,
          cancel_reason: "cancelled_by_customer",
        })
      } catch (err) {
        console.error("[billing/status] Dodo cancel failed:", err)
        // Continue — still mark locally so the user is never stuck
      }
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    })

    res.json({ ok: true, message: "Subscription cancelled — access remains until end of period" })
  } catch (error) {
    console.error("[billing/status] Cancel failed:", error)
    res.status(500).json({ error: "Failed to cancel subscription" })
  }
})

export default router
