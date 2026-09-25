import prisma from "src/lib/prisma"

export async function getMonthlyRequestCount(userId: string): Promise<number> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  try {
    const result = await prisma.usageEvent.aggregate({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
      },
      _count: { id: true },
    })

    return result._count.id
  } catch (error) {
    console.error("[request-counter] Failed to count requests:", error)
    return 0
  }
}

/**
 * Checks whether the user is under their plan's monthly request cap
 * (10K grandfathered, 15K Premium, 25K Pro, 110K Ultra).
 */
export async function checkRequestLimit(
  userId: string,
  requestLimit: number,
): Promise<{
  allowed: boolean
  used: number
  limit: number
  message?: string
}> {
  const used = await getMonthlyRequestCount(userId)

  if (used >= requestLimit) {
    return {
      allowed: false,
      used,
      limit: requestLimit,
      message: `You've used ${used.toLocaleString()} of ${requestLimit.toLocaleString()} monthly requests. Run /upgrade.`,
    }
  }

  return { allowed: true, used, limit: requestLimit }
}
