import { Router } from "express"
import prisma from "../../lib/prisma"
import { getDodo, getDodoEnvironment } from "../../lib/dodo"

const router = Router()

function studioUrl(path: string): string {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"
  return `${clientUrl.replace(/\/$/, "")}${path}`
}

router.post("/", async (req, res) => {
  try {
    const userId = req.body.userId as string | undefined
    const planId = req.body.planId as string | undefined
    const variant = req.body.variant as string | undefined

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    if (!planId) {
      res.status(400).json({ error: "planId is required" })
      return
    }

    const plan = await prisma.plan.findUnique({
      where: { id: planId, active: true },
    })

    if (!plan) {
      res.status(404).json({ error: "Plan not found" })
      return
    }

    // Resolve Dodo product — Spark IN/INT may share one product until separate SKUs exist
    let dodoProductId = plan.dodoProductId
    if (!dodoProductId && plan.tier === "spark-premium") {
      const fallback = await prisma.plan.findFirst({
        where: {
          tier: "spark-premium",
          interval: plan.interval ?? "month",
          dodoProductId: { not: null },
          active: true,
        },
      })
      dodoProductId = fallback?.dodoProductId ?? null
    }

    if (!dodoProductId) {
      res.status(400).json({ error: "This plan cannot be purchased" })
      return
    }

    const dodo = getDodo()
    if (!dodo) {
      console.error("[billing/checkout] DODO_PAYMENTS_API_KEY not configured")
      res.status(503).json({ error: "Payments are not configured yet" })
      return
    }

    // Create or reuse a Dodo customer for this user
    let dodoCustomerId: string | null = null
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (user?.dodoCustomerId) {
      dodoCustomerId = user.dodoCustomerId
    }

    const resolvedVariant = variant ?? plan.variant

    const customer: Record<string, unknown> = dodoCustomerId
      ? { customer_id: dodoCustomerId }
      : { email: user?.email ?? `${userId}@supercode.local`, name: user?.name ?? "Supercode User" }

    const checkoutSession = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: dodoProductId, quantity: 1 }],
      customer: customer as never,
      metadata: {
        userId,
        planId: plan.id,
        tier: plan.tier,
        variant: resolvedVariant ?? "global",
      },
      return_url:
        process.env.DODO_RETURN_URL ?? studioUrl("/studio?success=true"),
      cancel_url:
        process.env.DODO_CANCEL_URL ?? studioUrl("/studio?cancelled=true"),
    })

    res.json({
      checkout_url: checkoutSession.checkout_url,
      session_id: checkoutSession.session_id,
    })
  } catch (error) {
    console.error("[billing/checkout] Checkout creation failed:", error)
    const message = error instanceof Error ? error.message : String(error)
    const mode = getDodoEnvironment()
    const looksMissing =
      /not found|404|invalid product|product_id/i.test(message)
    if (looksMissing) {
      res.status(400).json({
        error:
          `Dodo product not found in ${mode}. Re-seed plans with DODO_MODE=${mode === "test_mode" ? "test" : "live"} so dodoProductId matches this mode.`,
      })
      return
    }
    res.status(500).json({ error: "Failed to create checkout session" })
  }
})

export default router
