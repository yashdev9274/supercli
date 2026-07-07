import chalk from "chalk"
import prisma from "src/lib/prisma"
import { theme, sectionHeader, heavyDivider, formatTokenCount } from "src/cli/utils/tui.ts"
import { getOrCreateDeviceId } from "src/lib/token-budget"

function todayStart(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export async function usageCommand(): Promise<void> {
  const today = todayStart()
  const tomorrow = new Date(today.getTime() + 86_400_000)

  const w = Math.min(process.stdout.columns ?? 80, 72)

  console.log()
  console.log(heavyDivider())
  console.log()
  console.log(sectionHeader("Usage History", { accent: "green" }))

  const allUsage = await prisma.usageEvent.groupBy({
    by: ["model"],
    where: {
      createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
    },
    _sum: { totalTokens: true },
    _count: { id: true },
  })

  if (allUsage.length > 0) {
    for (const row of allUsage) {
      const tokens = row._sum.totalTokens ?? 0
      const calls = row._count.id
      const modelLabel = row.model.length > 30 ? row.model.slice(0, 27) + "..." : row.model
      console.log(`  ${chalk.hex(theme.greenGlow)(modelLabel.padEnd(32))} ${formatTokenCount(tokens).padStart(8)}  ${chalk.hex(theme.muted)(`${calls} calls`)}`)
    }
  } else {
    console.log(`  ${chalk.hex(theme.muted)("No usage recorded in the last 30 days.")}`)
  }

  console.log()
  console.log(heavyDivider())
  console.log()
}
