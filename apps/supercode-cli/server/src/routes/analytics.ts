import type { Express } from "express"
import type { PrismaClient } from "@super/db-terminal"
import { getProviderDisplayNameFromRaw, getProviderColor } from "../lib/pricing"

type Range = "7d" | "30d" | "90d" | "all"

function getRangeCondition(range: Range, alias?: string): { sql: string; params: (string | number)[] } {
  if (range === "all") return { sql: "TRUE", params: [] }
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7
  return {
    sql: `${alias ? `${alias}.` : ""}"createdAt" >= NOW() - INTERVAL '${days} days'`,
    params: [],
  }
}

function getPrevRangeCondition(range: Range, alias?: string): { sql: string; params: (string | number)[] } {
  if (range === "all") return { sql: "TRUE", params: [] }
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7
  return {
    sql: `${alias ? `${alias}.` : ""}"createdAt" >= NOW() - INTERVAL '${days * 2} days' AND ${alias ? `${alias}.` : ""}"createdAt" < NOW() - INTERVAL '${days} days'`,
    params: [],
  }
}

export function registerAnalyticsRoutes(app: Express, prisma: PrismaClient) {
  app.get("/api/data/analytics", async (req, res) => {
    try {
      const range = (req.query.range as Range) || "7d"
      if (!["7d", "30d", "90d", "all"].includes(range)) {
        res.status(400).json({ error: "Invalid range. Use 7d, 30d, 90d, or all" })
        return
      }

      const rangeCondition = getRangeCondition(range, "e")
      const prevRangeCondition = getPrevRangeCondition(range, "e")

      const [
        summaryRaw,
        topModelsRaw,
        modelDetailsRaw,
        modelBreakdownRaw,
        cacheRatioPerModelRaw,
        usageOverTimeRaw,
        marketShareRaw,
        costEfficiencyRaw,
        cacheRatioRaw,
        prevTokensRaw,
      ] = await Promise.all([
        prisma.$queryRawUnsafe<Array<{ totalTokens: bigint; totalCost: number | null; totalRequests: bigint }>>(
          `SELECT COALESCE(SUM(e."totalTokens"), 0) as "totalTokens", COALESCE(SUM(e."costUsd"), 0) as "totalCost", COUNT(*) as "totalRequests" FROM "usage_event" e WHERE ${rangeCondition.sql}`,
          ...rangeCondition.params,
        ),
        prisma.$queryRawUnsafe<Array<{ model: string; provider: string; tokens: bigint; cost: number | null; requests: bigint }>>(
          `SELECT e."model", e."provider", COALESCE(SUM(e."totalTokens"), 0) as "tokens", COALESCE(SUM(e."costUsd"), 0) as "cost", COUNT(*) as "requests" FROM "usage_event" e WHERE ${rangeCondition.sql} GROUP BY e."model", e."provider" ORDER BY tokens DESC LIMIT 50`,
          ...rangeCondition.params,
        ),
        prisma.$queryRawUnsafe<Array<{ model: string; cost: number | null; requests: bigint; tokens: bigint }>>(
          `SELECT e."model", COALESCE(SUM(e."costUsd"), 0) as "cost", COUNT(*) as "requests", COALESCE(SUM(e."totalTokens"), 0) as "tokens" FROM "usage_event" e WHERE ${rangeCondition.sql} GROUP BY e."model"`,
          ...rangeCondition.params,
        ),
        prisma.$queryRawUnsafe<Array<{
          model: string
          inputTokens: bigint
          outputTokens: bigint
          cachedInputTokens: bigint
          totalTokens: bigint
          costUsd: number | null
        }>>(
          `SELECT e."model",
            COALESCE(SUM(e."inputTokens"), 0) as "inputTokens",
            COALESCE(SUM(e."outputTokens"), 0) as "outputTokens",
            COALESCE(SUM(e."cachedInputTokens"), 0) as "cachedInputTokens",
            COALESCE(SUM(e."totalTokens"), 0) as "totalTokens",
            COALESCE(SUM(e."costUsd"), 0) as "costUsd"
          FROM "usage_event" e WHERE ${rangeCondition.sql} GROUP BY e."model"`,
          ...rangeCondition.params,
        ),
        prisma.$queryRawUnsafe<Array<{ model: string; cachedTokens: bigint; totalTokens: bigint }>>(
          `SELECT e."model",
            COALESCE(SUM(e."cachedInputTokens"), 0) as "cachedTokens",
            COALESCE(SUM(e."totalTokens"), 0) as "totalTokens"
          FROM "usage_event" e WHERE ${rangeCondition.sql} GROUP BY e."model"`,
          ...rangeCondition.params,
        ),
        prisma.$queryRawUnsafe<Array<{ date: Date; provider: string; tokens: bigint }>>(
          `SELECT DATE(e."createdAt") as "date", e."provider", COALESCE(SUM(e."totalTokens"), 0) as "tokens" FROM "usage_event" e WHERE ${rangeCondition.sql} GROUP BY DATE(e."createdAt"), e."provider" ORDER BY "date" ASC`,
          ...rangeCondition.params,
        ),
        prisma.$queryRawUnsafe<Array<{ provider: string; tokens: bigint }>>(
          `SELECT e."provider", COALESCE(SUM(e."totalTokens"), 0) as "tokens" FROM "usage_event" e WHERE ${rangeCondition.sql} GROUP BY e."provider" ORDER BY tokens DESC`,
          ...rangeCondition.params,
        ),
        prisma.$queryRawUnsafe<Array<{ model: string; provider: string; avgCostPer1K: number | null }>>(
          `SELECT e."model", e."provider", COALESCE(AVG((e."costUsd" / NULLIF(e."totalTokens"::numeric, 0)) * 1000), 0) as "avgCostPer1K" FROM "usage_event" e WHERE ${rangeCondition.sql} AND e."totalTokens" > 0 AND e."costUsd" IS NOT NULL GROUP BY e."model", e."provider" ORDER BY "avgCostPer1K" DESC`,
          ...rangeCondition.params,
        ),
        prisma.$queryRawUnsafe<Array<{ provider: string; cachedTokens: bigint; totalTokens: bigint }>>(
          `SELECT e."provider", COALESCE(SUM(e."cachedInputTokens"), 0) as "cachedTokens", COALESCE(SUM(e."totalTokens"), 0) as "totalTokens" FROM "usage_event" e WHERE ${rangeCondition.sql} GROUP BY e."provider"`,
          ...rangeCondition.params,
        ),
        prisma.$queryRawUnsafe<Array<{ model: string; prevTokens: bigint }>>(
          `SELECT e."model", COALESCE(SUM(e."totalTokens"), 0) as "prevTokens" FROM "usage_event" e WHERE ${prevRangeCondition.sql} GROUP BY e."model"`,
          ...rangeCondition.params,
        ),
      ])

      const summary = {
        totalTokens: Number(summaryRaw[0]?.totalTokens ?? 0),
        totalCost: Number(summaryRaw[0]?.totalCost ?? 0),
        totalRequests: Number(summaryRaw[0]?.totalRequests ?? 0),
      }

      const modelDetailsMap = new Map<string, { cost: number; requests: number; tokens: number }>()
      for (const row of modelDetailsRaw) {
        modelDetailsMap.set(row.model, { cost: Number(row.cost ?? 0), requests: Number(row.requests), tokens: Number(row.tokens) })
      }

      const modelBreakdownMap = new Map<string, { inputTokens: number; outputTokens: number; cachedInputTokens: number; totalTokens: number; costUsd: number }>()
      for (const row of modelBreakdownRaw) {
        modelBreakdownMap.set(row.model, {
          inputTokens: Number(row.inputTokens),
          outputTokens: Number(row.outputTokens),
          cachedInputTokens: Number(row.cachedInputTokens),
          totalTokens: Number(row.totalTokens),
          costUsd: Number(row.costUsd ?? 0),
        })
      }

      const cacheRatioPerModelMap = new Map<string, { cachedTokens: number; totalTokens: number }>()
      for (const row of cacheRatioPerModelRaw) {
        cacheRatioPerModelMap.set(row.model, { cachedTokens: Number(row.cachedTokens), totalTokens: Number(row.totalTokens) })
      }

      const prevTokensMap = new Map<string, number>()
      for (const row of prevTokensRaw) {
        prevTokensMap.set(row.model, Number(row.prevTokens))
      }

      const topModels = topModelsRaw.map((row) => {
        const prevTokens = prevTokensMap.get(row.model) ?? 0
        const currentTokens = Number(row.tokens)
        const trend = prevTokens > 0 ? ((currentTokens - prevTokens) / prevTokens) * 100 : null
        const cost = Number(row.cost ?? 0)
        const requests = Number(row.requests)
        return {
          model: row.model,
          provider: row.provider,
          providerDisplayName: getProviderDisplayNameFromRaw(row.provider),
          tokens: currentTokens,
          cost,
          requests,
          sessionCost: requests > 0 ? Math.round((cost / requests) * 10000) / 10000 : 0,
          tokensPerSession: requests > 0 ? Math.round(currentTokens / requests) : 0,
          trend: trend !== null ? Math.round(trend * 10) / 10 : null,
        }
      })

      const usageOverTime = usageOverTimeRaw.map((row) => ({
        date: row.date,
        provider: row.provider,
        providerDisplayName: getProviderDisplayNameFromRaw(row.provider),
        tokens: Number(row.tokens),
      }))

      const marketShare = marketShareRaw.map((row) => ({
        provider: row.provider,
        providerDisplayName: getProviderDisplayNameFromRaw(row.provider),
        tokens: Number(row.tokens),
        percentage: summary.totalTokens > 0 ? Math.round((Number(row.tokens) / summary.totalTokens) * 10000) / 100 : 0,
      }))

      const modelSessionCost = Array.from(modelDetailsMap.entries())
        .map(([model, d]) => ({
          model,
          sessionCost: d.requests > 0 ? Math.round((d.cost / d.requests) * 10000) / 10000 : 0,
          tokensPerSession: d.requests > 0 ? Math.round(d.tokens / d.requests) : 0,
          requests: d.requests,
          cost: d.cost,
          tokens: d.tokens,
        }))
        .sort((a, b) => b.sessionCost - a.sessionCost)

      const tokenCost = costEfficiencyRaw.map((row) => ({
        model: row.model,
        provider: row.provider,
        providerDisplayName: getProviderDisplayNameFromRaw(row.provider),
        avgCostPer1K: row.avgCostPer1K !== null ? Math.round(Number(row.avgCostPer1K) * 100000) / 100000 : null,
      }))

      const totalCached = cacheRatioRaw.reduce((sum, r) => sum + Number(r.cachedTokens), 0)
      const totalOverall = cacheRatioRaw.reduce((sum, r) => sum + Number(r.totalTokens), 0)
      const cacheRatio = {
        overall: totalOverall > 0 ? Math.round((totalCached / totalOverall) * 10000) / 100 : 0,
        cached: totalCached,
        total: totalOverall,
        byProvider: cacheRatioRaw.map((row) => ({
          provider: row.provider,
          providerDisplayName: getProviderDisplayNameFromRaw(row.provider),
          ratio: Number(row.totalTokens) > 0 ? Math.round((Number(row.cachedTokens) / Number(row.totalTokens)) * 10000) / 100 : 0,
          cached: Number(row.cachedTokens),
          total: Number(row.totalTokens),
        })),
      }

      const cacheRatioByModel = Array.from(cacheRatioPerModelMap.entries())
        .map(([model, d]) => ({
          model,
          ratio: d.totalTokens > 0 ? Math.round((d.cachedTokens / d.totalTokens) * 10000) / 100 : 0,
          cached: d.cachedTokens,
          total: d.totalTokens,
        }))
        .sort((a, b) => b.ratio - a.ratio)

      const modelTokenCost = Array.from(modelBreakdownMap.entries())
        .map(([model, d]) => {
          const paidInput = d.inputTokens - d.cachedInputTokens
          return {
            model,
            inputPer1M: paidInput > 0 ? Math.round(((d.costUsd * (paidInput / (paidInput + d.outputTokens))) / paidInput) * 1000000 * 100) / 100 : 0,
            outputPer1M: d.outputTokens > 0 ? Math.round(((d.costUsd * (d.outputTokens / (paidInput + d.outputTokens))) / d.outputTokens) * 1000000 * 100) / 100 : 0,
            cachedPer1M: d.cachedInputTokens > 0 ? Math.round(((d.costUsd * (d.cachedInputTokens / (d.inputTokens + d.outputTokens))) / d.cachedInputTokens) * 1000000 * 100) / 100 : 0,
          }
        })

      const modelColors: Record<string, string> = {}
      for (const m of topModels) {
        modelColors[m.model] = getProviderColor(m.provider)
      }

      const providerColors: Record<string, string> = {}
      for (const m of marketShare) {
        providerColors[m.provider] = getProviderColor(m.provider)
      }

      res.json({
        updatedAt: new Date().toISOString(),
        range,
        summary,
        topModels,
        usageOverTime,
        marketShare,
        tokenCost,
        cacheRatio,
        modelSessionCost,
        modelTokenCost,
        cacheRatioByModel,
        modelColors,
        providerColors,
      })
    } catch (error) {
      console.error("[analytics] Error:", error)
      res.status(500).json({ error: "Failed to fetch analytics data" })
    }
  })
}
