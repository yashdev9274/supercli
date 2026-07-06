import chalk from "chalk"
import prisma from "src/lib/prisma"
import { theme, sectionHeader, heavyDivider, formatTokenCount } from "src/cli/utils/tui.ts"
import { OPUS_MODEL_ID, DAILY_BUDGET_TOKENS, DAILY_QUERY_LIMIT, getDailyTokenUsage, getDailyQueryCount, getOrCreateDeviceId } from "src/lib/token-budget"

function todayStart(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export async function usageCommand(): Promise<void> {
  const today = todayStart()
  const tomorrow = new Date(today.getTime() + 86_400_000)

  const [total, deviceId] = await Promise.all([
    getDailyTokenUsage(OPUS_MODEL_ID),
    getOrCreateDeviceId(),
  ])
  const queryCount = await getDailyQueryCount(deviceId)

  const tokenRemaining = Math.max(0, DAILY_BUDGET_TOKENS - total)
  const tokenPct = Math.min(100, Math.round((total / DAILY_BUDGET_TOKENS) * 100))
  const queryRemaining = Math.max(0, DAILY_QUERY_LIMIT - queryCount)
  const queryPct = Math.min(100, Math.round((queryCount / DAILY_QUERY_LIMIT) * 100))

  const todayLabel = today.toLocaleDateString()
  const w = Math.min(process.stdout.columns ?? 80, 72)

  console.log()
  console.log(heavyDivider())
  console.log()
  console.log(sectionHeader("Daily Limits — Claude Opus 4.8", { accent: "green" }))

  const barWidth = w - 20

  console.log(`  ${chalk.hex(theme.greenGlow).bold("Token Budget")}`)
  console.log(`  ${chalk.hex(theme.muted)(todayLabel)}`)
  const tokenBar = chalk.hex(tokenPct >= 80 ? theme.red : theme.green)("█".repeat(Math.round((tokenPct / 100) * barWidth))) +
    chalk.hex(theme.greenDim)("█".repeat(Math.max(0, barWidth - Math.round((tokenPct / 100) * barWidth))))
  console.log(`  ${tokenBar} ${chalk.hex(theme.muted)(`${tokenPct}%`)}`)
  console.log(`  ${chalk.hex(theme.greenMute)("Used")}      ${formatTokenCount(total).padStart(8)} ${chalk.hex(theme.dim)(`/ ${formatTokenCount(DAILY_BUDGET_TOKENS)}`)}`)
  console.log(`  ${chalk.hex(theme.greenMute)("Remaining")} ${formatTokenCount(tokenRemaining).padStart(8)}`)
  console.log()

  console.log(`  ${chalk.hex(theme.greenGlow).bold("Query Limit")}`)
  const queryBar = chalk.hex(queryPct >= 80 ? theme.red : theme.green)("█".repeat(Math.round((queryPct / 100) * barWidth))) +
    chalk.hex(theme.greenDim)("█".repeat(Math.max(0, barWidth - Math.round((queryPct / 100) * barWidth))))
  console.log(`  ${queryBar} ${chalk.hex(theme.muted)(`${queryPct}%`)}`)
  console.log(`  ${chalk.hex(theme.greenMute)("Used")}      ${String(queryCount).padStart(8)} ${chalk.hex(theme.dim)(`/ ${DAILY_QUERY_LIMIT}`)}`)
  console.log(`  ${chalk.hex(theme.greenMute)("Remaining")} ${String(queryRemaining).padStart(8)}`)
  console.log(`  ${chalk.hex(theme.greenMute)("Resets")}    ${tomorrow.toLocaleDateString()}`)

  if (tokenPct >= 80 || queryPct >= 80) {
    console.log()
    const warnings: string[] = []
    if (tokenPct >= 80) warnings.push("Token budget nearly exhausted")
    if (queryPct >= 80) warnings.push("Query limit nearly exhausted")
    console.log(`  ${chalk.hex(theme.red)(`⚠  ${warnings.join(" — ")}`)}`)
    console.log(`  ${chalk.hex(theme.red)("Requests will be blocked once either limit is depleted.")}`)
  }

  const allOpusUsage = await prisma.usageEvent.groupBy({
    by: ["model"],
    where: {
      model: OPUS_MODEL_ID,
      createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
    },
    _sum: { totalTokens: true },
    _count: { id: true },
  })

  if (allOpusUsage.length > 0) {
    console.log()
    console.log(sectionHeader("30-Day History", { accent: "green" }))
    for (const row of allOpusUsage) {
      const tokens = row._sum.totalTokens ?? 0
      const calls = row._count.id
      console.log(`  ${chalk.hex(theme.greenGlow)("Opus 4.8".padEnd(30))} ${formatTokenCount(tokens).padStart(8)}  ${chalk.hex(theme.muted)(`${calls} calls`)}`)
    }
  }

  console.log()
  console.log(heavyDivider())
  console.log()
}
