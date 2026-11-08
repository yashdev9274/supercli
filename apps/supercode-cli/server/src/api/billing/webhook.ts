import { Router } from "express"
import prisma from "../../lib/prisma"
import { getDodo } from "../../lib/dodo"
import { invalidateModelCache } from "../../lib/model-access"
import { billing } from "../../lib/credit-meter"
import type { Prisma } from "../../generated"

const router = Router()

// ── Event shapes (mirrors dodopayments SDK types) ──

interface DodoSubscriptionEvent {
  id: string
  type: string
  timestamp: string
  data: {
    subscription_id: string
    product_id: string
    status: string
    customer: { customer_id: string }
    metadata?: Record<string, unknown>
    previous_billing_date?: string
    next_billing_date?: string
    trial_period_days?: number
    cancel_at_next_billing_date?: boolean
    [key: string]: unknown
  }
}

interface DodoPaymentEvent {
  id: string
  type: string
  timestamp: string
  data: {
    payment_id: string
    subscription_id?: string
    customer: { customer_id: string }
    status: string
    amount: number
    currency: string
    metadata?: Record<string, unknown>
    [key: string]: unknown
  }
}

interface DodoRefundEvent {
  id: string
  type: string
  timestamp: string
  data: {
    refund_id: string
    payment_id: string
    status: string
    amount?: number
    currency?: string
    reason?: string
    customer?: { customer_id: string }
    metadata?: Record<string, unknown>
    [key: string]: unknown
  }
}

function toDate(iso?: string): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

async function ensureCredits(userId: string) {
  await billing.getBalance(userId)
}

async function handleSubscriptionActive(event: DodoSubscriptionEvent) {
  const { data } = event
  let userId = data.metadata?.userId as string | undefined
  const plan = await prisma.plan.findFirst({
    where: { dodoProductId: data.product_id },
  })

  if (!plan) {
    console.warn("[webhook] Missing plan for subscription.active", {
      productId: data.product_id,
    })
    return
  }

  // If checkout metadata didn't carry userId, recover from an existing local
  // subscription for this dodoSubscriptionId (idempotent resend / re-activation).
  if (!userId) {
    const existing = await prisma.subscription.findFirst({
      where: { dodoSubscriptionId: data.subscription_id },
      select: { userId: true },
    })
    if (existing) {
      userId = existing.userId
      console.log(`[webhook] Recovered userId ${userId} from existing subscription`)
    }
  }

  if (!userId) {
    console.warn("[webhook] Missing userId for subscription.active", {
      subscriptionId: data.subscription_id,
      productId: data.product_id,
    })
    return
  }

  // Cancel any grandfathered or other active/trialing subscriptions when the
  // user upgrades — a plan switch should never leave two active subs.
  await prisma.subscription.updateMany({
    where: {
      userId,
      status: { in: ["active", "trialing"] },
      dodoSubscriptionId: { not: data.subscription_id },
    },
    data: { status: "cancelled" },
  })

  const customerId = data.customer?.customer_id ?? null
  const periodStart = toDate(data.previous_billing_date)
  const periodEnd = toDate(data.next_billing_date)

  await prisma.subscription.upsert({
    where: { dodoSubscriptionId: data.subscription_id },
    update: {
      status: "active",
      planId: plan.id,
      dodoCustomerId: customerId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: data.cancel_at_next_billing_date ?? false,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
    },
    create: {
      userId,
      planId: plan.id,
      dodoSubscriptionId: data.subscription_id,
      dodoCustomerId: customerId,
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
    },
  })

  // Init / reset credit balance
  if (plan.creditAmountCents > 0) {
    await ensureCredits(userId)
  }

  // Link the Dodo customer to the user
  if (customerId) {
    await prisma.user.update({
      where: { id: userId },
      data: { dodoCustomerId: customerId },
    })
  }

  invalidateModelCache()
}

async function handleSubscriptionRenewed(event: DodoSubscriptionEvent) {
  const { data } = event
  const periodStart = toDate(data.previous_billing_date)
  const periodEnd = toDate(data.next_billing_date)

  await prisma.subscription.updateMany({
    where: { dodoSubscriptionId: data.subscription_id },
    data: {
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  })

  // Reset credits on renewal
  const sub = await prisma.subscription.findFirst({
    where: { dodoSubscriptionId: data.subscription_id },
    include: { plan: true },
  })

  if (sub && sub.plan.creditAmountCents > 0) {
    await ensureCredits(sub.userId)
  }
}

async function handleSubscriptionUpdated(event: DodoSubscriptionEvent) {
  const { data } = event
  const plan = data.product_id
    ? await prisma.plan.findFirst({ where: { dodoProductId: data.product_id } })
    : null

  const statusMap: Record<string, string> = {
    active: "active",
    on_hold: "paused",
    cancelled: "cancelled",
    expired: "expired",
    failed: "failed",
    pending: "pending",
  }

  const result = await prisma.subscription.updateMany({
    where: { dodoSubscriptionId: data.subscription_id },
    data: {
      status: statusMap[data.status] ?? data.status,
      planId: plan?.id,
      dodoCustomerId: data.customer?.customer_id ?? undefined,
      currentPeriodStart: toDate(data.previous_billing_date) ?? undefined,
      currentPeriodEnd: toDate(data.next_billing_date) ?? undefined,
      cancelAtPeriodEnd: data.cancel_at_next_billing_date ?? undefined,
    },
  })
  if (result.count === 0) {
    console.warn("[webhook] subscription.updated for unknown local subscription", {
      subscriptionId: data.subscription_id,
    })
  }
}

async function handleSubscriptionPlanChanged(event: DodoSubscriptionEvent) {
  const { data } = event
  const plan = await prisma.plan.findFirst({
    where: { dodoProductId: data.product_id },
  })

  if (plan) {
    await prisma.subscription.updateMany({
      where: { dodoSubscriptionId: data.subscription_id },
      data: { planId: plan.id },
    })
    invalidateModelCache()
  }
}

async function handleSubscriptionCancelled(event: DodoSubscriptionEvent) {
  const { data } = event
  await prisma.subscription.updateMany({
    where: { dodoSubscriptionId: data.subscription_id },
    data: { cancelAtPeriodEnd: true },
  })
}

async function handleSubscriptionOnHold(event: DodoSubscriptionEvent) {
  const { data } = event
  await prisma.subscription.updateMany({
    where: { dodoSubscriptionId: data.subscription_id },
    data: { status: "paused" },
  })
}

async function handleSubscriptionExpired(event: DodoSubscriptionEvent) {
  const { data } = event
  await prisma.subscription.updateMany({
    where: { dodoSubscriptionId: data.subscription_id },
    data: { status: "expired" },
  })
}

async function handleSubscriptionFailed(event: DodoSubscriptionEvent) {
  const { data } = event
  console.error("[webhook] Subscription failed:", {
    id: data.subscription_id,
    customerId: data.customer?.customer_id,
  })
}

async function handleRefundSucceeded(event: DodoRefundEvent) {
  const { data } = event
  console.log("[webhook] Refund succeeded:", {
    refundId: data.refund_id,
    paymentId: data.payment_id,
    amount: data.amount,
    currency: data.currency,
  })

  // Our /api/billing/refund attaches { userId, subscriptionId } to the refund metadata.
  // `subscriptionId` there is the DODO subscription id (dodoSubscriptionId), not the
  // local DB row id — so match on either field for robustness.
  const userId = data.metadata?.userId as string | undefined
  const dodoSubscriptionId = data.metadata?.subscriptionId as string | undefined

  if (userId && dodoSubscriptionId) {
    // Merge the refunded flag into the existing metadata (e.g. grandfathered: true)
    const existing = await prisma.subscription.findFirst({
      where: { userId, dodoSubscriptionId },
      select: { id: true, metadata: true },
    })
    if (!existing) {
      console.warn("[webhook] refund.succeeded for unknown subscription", {
        userId,
        dodoSubscriptionId,
      })
      return
    }
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        metadata: {
          ...((existing.metadata as Record<string, unknown>) ?? {}),
          refunded: true,
        } as Prisma.InputJsonValue,
      },
    })
    console.log(`[webhook] Marked subscription ${existing.id} as refunded`)
  } else {
    console.warn("[webhook] refund.succeeded without userId/subscriptionId metadata", {
      refundId: data.refund_id,
    })
  }
}

async function handleRefundFailed(event: DodoRefundEvent) {
  const { data } = event
  console.error("[webhook] Refund failed:", {
    refundId: data.refund_id,
    paymentId: data.payment_id,
    reason: data.reason,
    userId: data.metadata?.userId,
    subscriptionId: data.metadata?.subscriptionId,
  })
}

const EVENT_HANDLERS: Record<string, (event: any) => Promise<void>> = {
  "subscription.active": handleSubscriptionActive,
  "subscription.renewed": handleSubscriptionRenewed,
  "subscription.updated": handleSubscriptionUpdated,
  "subscription.plan_changed": handleSubscriptionPlanChanged,
  "subscription.cancelled": handleSubscriptionCancelled,
  "subscription.on_hold": handleSubscriptionOnHold,
  "subscription.expired": handleSubscriptionExpired,
  "subscription.failed": handleSubscriptionFailed,
  "payment.succeeded": async () => {},
  "payment.failed": async () => {},
  "refund.succeeded": handleRefundSucceeded,
  "refund.failed": handleRefundFailed,
}

router.post("/", async (req, res) => {
  try {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body)

    const dodo = getDodo({ webhookKey: true })
    if (!dodo) {
      console.error("[webhook] Dodo keys not configured — cannot verify webhook")
      res.status(503).json({ received: false })
      return
    }

    // Throws if signature verification fails
    const event = dodo.webhooks.unwrap(body, {
      headers: req.headers as Record<string, string>,
    }) as unknown as DodoSubscriptionEvent | DodoPaymentEvent

    console.log(`[webhook] Received event: ${event.type}`)

    const handler = EVENT_HANDLERS[event.type]
    if (handler) {
      await handler(event)
      console.log(`[webhook] Handled event: ${event.type}`)
    } else {
      console.log(`[webhook] Unhandled event type: ${event.type}`)
    }

    res.json({ received: true })
  } catch (error) {
    console.error("[webhook] Error processing webhook:", error)
    res.status(400).json({ received: false })
  }
})

export default router
