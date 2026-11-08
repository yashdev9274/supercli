import { Router } from "express"
import prisma from "../../lib/prisma"
import { getDodo } from "../../lib/dodo"
import { billing } from "../../lib/credit-meter"

const router = Router()

router.post("/", async (req, res) => {
  try {
    const userId = req.body.userId as string | undefined
    if (!userId) {
      res.status(400).json({ error: "userId is required" })
      return
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: "active",
        plan: { tier: "spark-premium" },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    })

    if (!subscription) {
      res.json({ eligible: false, reason: "No active Spark Premium subscription found." })
      return
    }

    // Credits consumed this period
    const creditBalance = await billing.getBalance(userId)
    const creditsConsumed = Math.max(0, creditBalance.allowanceCredits - creditBalance.balanceCredits)

    // Queries used this period
    const startOfPeriod = subscription.currentPeriodStart ?? new Date()
    const queriesUsed = await prisma.usageEvent.count({
      where: {
        userId,
        createdAt: { gte: startOfPeriod },
      },
    })

    const creditsUnderLimit = creditsConsumed < 500 // < $5 consumed
    const queriesUnderLimit = queriesUsed < 7500 // < 50% of 15K

    const eligible = creditsUnderLimit && queriesUnderLimit

    if (!eligible) {
      res.json({
        eligible: false,
        reason: creditsUnderLimit
          ? `Exceeded query limit (${queriesUsed}/7500 used).`
          : `Exceeded credit consumption (${creditsConsumed.toFixed(2)}/500 product credits used).`,
        creditsUsed: creditsConsumed,
        queriesUsed,
      })
      return
    }

    // Cancel the subscription + refund the $1 via Dodo (if key + payment available)
    let refunded = false

    const dodo = getDodo()
    if (dodo && !subscription.dodoSubscriptionId.startsWith("grandfathered-")) {
      try {
        // Find the payment for this subscription so we can refund it
        const payments = await dodo.payments.list({
          subscription_id: subscription.dodoSubscriptionId,
          status: "succeeded",
        })
        const first = payments.items?.[0] ?? (payments as unknown as { data?: Array<{ payment_id: string }> }).data?.[0]
        if (first) {
          const paymentId =
            (first as { payment_id?: string }).payment_id ??
            (first as unknown as { id?: string }).id
          if (paymentId) {
            await dodo.refunds.create({
              payment_id: paymentId,
              reason: "Spark Premium $1 refund — under $5 credits and 7.5K queries",
              metadata: { userId, subscriptionId: subscription.dodoSubscriptionId },
            })
            refunded = true
          }
        }
      } catch (err) {
        console.error("[billing/refund] Dodo refund failed:", err)
      }
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "cancelled", cancelAtPeriodEnd: true },
    })

    // Fall back to grandfathered Spark if the user has one — reuse an existing
    // active Spark sub instead of duplicating it.
    const grandfatheredPlan = await prisma.plan.findFirst({
      where: { tier: "spark", active: true },
    })
    if (grandfatheredPlan) {
      const existingSpark = await prisma.subscription.findFirst({
        where: { userId, planId: grandfatheredPlan.id, status: "active" },
      })
      if (!existingSpark) {
        await prisma.subscription.create({
          data: {
            userId,
            planId: grandfatheredPlan.id,
            dodoSubscriptionId: `grandfathered-${userId}-${Date.now()}`,
            status: "active",
            metadata: { grandfathered: true, refunded: true },
          },
        })
      }
    }

    res.json({
      eligible: true,
      refunded,
      creditsUsed: creditsConsumed,
      queriesUsed,
      message: refunded
        ? "Refund processed — you've been moved back to the free Spark plan."
        : "Refund not processed — payments are not configured yet. Your subscription is cancelled and you're back on the free Spark plan.",
    })
  } catch (error) {
    console.error("[billing/refund] Refund processing failed:", error)
    res.status(500).json({ error: "Failed to process refund" })
  }
})

export default router
