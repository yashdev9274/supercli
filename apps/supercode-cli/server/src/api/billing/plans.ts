import { Router } from "express"
import prisma from "../../lib/prisma"

const router = Router()

router.get("/", async (req, res) => {
  try {
    const where: Record<string, unknown> = { active: true }

    // All regional variants (Indian + International) and null-variant plans
    // (Spark Premium, Ultra) are always returned — the studio shows every plan.

    const plans = await prisma.plan.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        tier: true,
        name: true,
        description: true,
        variant: true,
        interval: true,
        priceCents: true,
        currency: true,
        requestLimit: true,
        contextLimit: true,
        modelAccess: true,
        creditAmountCents: true,
        monthlyCredits: true,
        dodoProductId: true,
        sortOrder: true,
      },
    })

    res.json({ plans })
  } catch (error) {
    console.error("[billing/plans] Failed to fetch plans:", error)
    res.status(500).json({ error: "Failed to fetch plans" })
  }
})

export default router
