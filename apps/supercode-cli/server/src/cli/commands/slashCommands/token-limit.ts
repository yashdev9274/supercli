import chalk from "chalk"
import prisma from "src/lib/prisma"
import {
  theme,
  heavyDivider,
  sectionHeader,
  formatTokenCount,
  progressBar,
} from "src/cli/utils/tui.ts"
import { getDailyOpusCount, OPUS_DAILY_LIMIT } from "src/lib/token-budget"
import { computeCost, getProviderDisplayNameFromRaw, getProviderColor } from "src/lib/pricing"

function todayStart(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

const W = 72

function line(text = ""): void {
  console.log(`  ${text}`)
}

function rightPad(text: string, width: number): string {
  const visible = text.replace(/\x1b\[[0-9;]*m/g, "")
  return text + " ".repeat(Math.max(0, width - visible.length))
}

function sep(): string {
  return chalk.hex(theme.greenDim)("┈".repeat(W - 2))
}

function dim(text: string): string {
  return chalk.hex(theme.muted)(text)
}

export async function tokenLimitCommand(): Promise<void> {
  const today = todayStart()

  console.log()
  console.log(heavyDivider())
  console.log()
  console.log(sectionHeader("Token Limits", { accent: "green" }))
  console.log(dim(`   ${new Date().toISOString().slice(0, 10)} · limits reset at midnight UTC`))
  console.log()

  // ── Query today's usage ──────────────────────────────────────────────────
  const usage = await prisma.usageEvent.groupBy({
    by: ["provider", "model"],
    where: {
      createdAt: { gte: today },
    },
    _sum: {
      totalTokens: true,
      inputTokens: true,
      outputTokens: true,
      cachedInputTokens: true,
    },
    _count: { id: true },
  })

  if (usage.length === 0) {
    console.log(`  ${dim("No usage recorded today.")}`)
    console.log()
    console.log(heavyDivider())
    console.log()
    return
  }

  // ── Group by provider ────────────────────────────────────────────────────
  const groups = new Map<string, typeof usage>()
  for (const row of usage) {
    const key = row.provider
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  const costLabel = chalk.hex(theme.greenGlow)("Cost")
  const tokLabel = chalk.hex(theme.green)("Tokens")
  const qryLabel = chalk.hex(theme.green)("Qrys")

  let grandTotalTokens = 0
  let grandTotalQueries = 0
  let grandTotalCost = 0

  // ── Per-provider sections ────────────────────────────────────────────────
  for (const [providerKey, rows] of groups) {
    const providerName = getProviderDisplayNameFromRaw(providerKey)
    const providerColor = getProviderColor(providerKey)

    line(chalk.hex(providerColor).bold(providerName))

    for (const row of rows) {
      const tokens = row._sum.totalTokens ?? 0
      const calls = row._count.id
      const inputTokens = row._sum.inputTokens ?? 0
      const outputTokens = row._sum.outputTokens ?? 0
      const cachedTokens = row._sum.cachedInputTokens ?? 0
      const cost = computeCost(row.model, inputTokens, outputTokens, cachedTokens)

      grandTotalTokens += tokens
      grandTotalQueries += calls
      grandTotalCost += cost

      const modelLabel = row.model.length > 34 ? row.model.slice(0, 31) + "..." : row.model

      // Opus-specific: show remaining quota
      const isOpus = row.model === "anthropic/claude-opus-4-8"
      let opusInfo = ""
      if (isOpus) {
        const opusCount = await getDailyOpusCount()
        const remaining = OPUS_DAILY_LIMIT - opusCount
        const color = remaining <= 5 ? theme.red : remaining <= 10 ? theme.amber : theme.green
        opusInfo = `  ${chalk.hex(color)(`${remaining}/${OPUS_DAILY_LIMIT} left`)}`
      }

      line(
        `  ${chalk.hex(theme.greenGlow)(rightPad(modelLabel, 34))}` +
        ` ${rightPad(`${formatTokenCount(tokens).padStart(7)} ${tokLabel}`, 16)}` +
        ` ${rightPad(`${String(calls).padStart(3)} ${qryLabel}`, 11)}` +
        ` ${rightPad(`$${cost.toFixed(2)}`, 8)}` +
        `${opusInfo}`,
      )
    }

    // Provider-level cost subtotal
    if (rows.length > 1) {
      const subtotal = rows.reduce((acc, r) => {
        const i = r._sum.inputTokens ?? 0
        const o = r._sum.outputTokens ?? 0
        const c = r._sum.cachedInputTokens ?? 0
        return acc + computeCost(r.model, i, o, c)
      }, 0)
      line(`  ${dim(sep())}`)
      line(`  ${dim("Subtotal cost")} ${chalk.hex(theme.greenGlow)(`$${subtotal.toFixed(2)}`)}`)
    }

    console.log()
  }

  // ── Summary section ──────────────────────────────────────────────────────
  console.log(heavyDivider())
  console.log()

  const avgCostPerQuery = grandTotalQueries > 0 ? grandTotalCost / grandTotalQueries : 0
  const budgetPct = Math.min(100, Math.round((grandTotalTokens / 128_000) * 100))

  line(chalk.hex(theme.green)("Today's Summary"))
  line()
  line(`  ${chalk.hex(theme.greenGlow)("Total tokens")}  ${formatTokenCount(grandTotalTokens).padStart(8)}  ${progressBar(grandTotalTokens, 128_000, 16)}  ${dim("of 128K budget")}`)
  line(`  ${chalk.hex(theme.greenGlow)("Total queries")} ${String(grandTotalQueries).padStart(8)}  ${progressBar(grandTotalQueries, 50, 16)}  ${dim("of 50 queries")}`)
  line(`  ${chalk.hex(theme.greenGlow)("Total cost")}   ${`$${grandTotalCost.toFixed(2)}`.padStart(8)}  ${dim(`avg $${avgCostPerQuery.toFixed(3)}/query`)}`)
  line()

  // ── Opus-specific section ───────────────────────────────────────────────
  const opusCount = await getDailyOpusCount()
  const opusRemaining = OPUS_DAILY_LIMIT - opusCount
  const opusColor = opusRemaining <= 5 ? theme.red : opusRemaining <= 10 ? theme.amber : theme.green

  line(chalk.hex(theme.green)(`Opus 4.8 Limit`))
  line()
  line(`  ${chalk.hex(opusColor)(`${opusCount}/${OPUS_DAILY_LIMIT}`)} ${dim("calls today")}  ${progressBar(opusCount, OPUS_DAILY_LIMIT, 16)}`)
  line(`  ${dim("Pricing:")} ${chalk.hex(theme.muted)("$5.00/M input · $25.00/M output · $0.50/M cached")}`)
  line(`  ${dim("Context:")} ${chalk.hex(theme.muted)("1M tokens · 128K max output")}`)
  line()

  console.log(heavyDivider())
  console.log()
}
