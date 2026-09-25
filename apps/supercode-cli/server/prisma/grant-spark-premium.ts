// apps/supercode-cli/server/prisma/grant-spark-premium.ts
// Grant (or renew) Spark Premium for one or more users.
//
// Run:
//   bun run prisma/grant-spark-premium.ts yashdev.yvd@gmail.com
//   bun run prisma/grant-spark-premium.ts xSoo2kQhYFJqp5l1n608ooU328vM4Nq1
//   DAYS=60 bun run prisma/grant-spark-premium.ts user@example.com
import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated"

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_TERMINAL || process.env.DATABASE_URL,
})

const prisma = new PrismaClient({ adapter })

const days = Math.max(1, Number(process.env.DAYS || 30) || 30)

async function resolveUser(ref: string) {
  if (ref.includes("@")) {
    return prisma.user.findFirst({ where: { email: ref } })
  }
  return prisma.user.findUnique({ where: { id: ref } })
}

async function grant(ref: string) {
  const user = await resolveUser(ref)
  if (!user) {
    throw new Error(`User not found: ${ref}`)
  }

  const premium = await prisma.plan.findFirst({
    where: { tier: "spark-premium", active: true },
    orderBy: { sortOrder: "asc" },
  })
  if (!premium) {
    throw new Error("Spark Premium plan not found. Run: bun run prisma/seed.ts")
  }

  const now = new Date()
  const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  // Keep a single active paid row — cancel other active/trialing plans.
  await prisma.subscription.updateMany({
    where: {
      userId: user.id,
      status: { in: ["active", "trialing"] },
      NOT: { planId: premium.id },
    },
    data: { status: "cancelled" },
  })

  const existing = await prisma.subscription.findFirst({
    where: { userId: user.id, planId: premium.id },
    orderBy: { createdAt: "desc" },
  })

  const metadata = {
    ...(typeof existing?.metadata === "object" && existing.metadata
      ? (existing.metadata as Record<string, unknown>)
      : {}),
    tier: "spark-premium",
    planId: premium.id,
    userId: user.id,
    source: "manual-admin-grant",
    grantedAt: now.toISOString(),
  }

  const sub = existing
    ? await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          metadata,
        },
        include: { plan: true },
      })
    : await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: premium.id,
          dodoSubscriptionId: `manual-spark-premium-${user.id}-${Date.now()}`,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          metadata,
        },
        include: { plan: true },
      })

  const credits = await prisma.creditBalance.upsert({
    where: {
      userId_planId: { userId: user.id, planId: premium.id },
    },
    update: {
      balanceCents: premium.creditAmountCents,
      totalCredits: premium.creditAmountCents,
      resetAt: periodEnd,
    },
    create: {
      userId: user.id,
      planId: premium.id,
      balanceCents: premium.creditAmountCents,
      totalCredits: premium.creditAmountCents,
      resetAt: periodEnd,
    },
  })

  console.log(
    JSON.stringify(
      {
        email: user.email,
        userId: user.id,
        subscriptionId: sub.id,
        tier: sub.plan.tier,
        plan: sub.plan.name,
        status: sub.status,
        periodEnd: sub.currentPeriodEnd,
        credits: credits.balanceCents,
      },
      null,
      2,
    ),
  )
}

async function main() {
  const refs = process.argv.slice(2).filter(Boolean)
  if (refs.length === 0) {
    console.error(
      "Usage: bun run prisma/grant-spark-premium.ts <email-or-userId> [...more]",
    )
    process.exit(1)
  }

  console.log(`Granting Spark Premium for ${days} day(s)...`)
  for (const ref of refs) {
    await grant(ref)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
