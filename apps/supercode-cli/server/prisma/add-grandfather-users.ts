// apps/supercode-cli/server/prisma/add-grandfather-users.ts
// Run: bun run prisma/add-grandfather-users.ts
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated"

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_TERMINAL || process.env.DATABASE_URL,
})

const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Grandfathering existing users into Free...")

  const freePlan = await prisma.plan.findFirst({
    where: { tier: "free", active: true },
  })

  if (!freePlan) {
    console.error("Free plan not found. Run seed first.")
    process.exit(1)
  }

  const users = await prisma.user.findMany({
    where: {
      subscriptions: { none: {} },
    },
  })

  console.log(`Found ${users.length} users without subscriptions.`)

  let count = 0
  for (const user of users) {
    const dodoSubId = `grandfathered-${user.id}-${Date.now()}`

    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: freePlan.id,
        dodoSubscriptionId: dodoSubId,
        status: "active",
        metadata: { grandfathered: true },
      },
    })

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const freeCredits = freePlan.creditAmountCents
    await prisma.creditBalance.upsert({
      where: {
        userId_planId: { userId: user.id, planId: freePlan.id },
      },
      update: {
        balanceCents: freeCredits,
        totalCredits: freeCredits,
        resetAt: periodEnd,
      },
      create: {
        userId: user.id,
        planId: freePlan.id,
        balanceCents: freeCredits,
        totalCredits: freeCredits,
        resetAt: periodEnd,
      },
    })

    count++
  }

  console.log(`Grandfathered ${count} users into Free (10K req, 16K ctx).`)
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
