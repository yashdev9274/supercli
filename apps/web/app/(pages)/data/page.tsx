"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { motion, useReducedMotion, type Variants } from "framer-motion"

type Range = "7d" | "30d" | "90d" | "all"

type AnalyticsData = {
  updatedAt: string
  range: Range
  summary: { totalTokens: number; totalCost: number; totalRequests: number }
  topModels: {
    model: string
    provider: string
    providerDisplayName: string
    tokens: number
    cost: number
    requests: number
    sessionCost: number
    tokensPerSession: number
    trend: number | null
  }[]
  modelSessionCost: {
    model: string
    sessionCost: number
    tokensPerSession: number
    requests: number
    cost: number
    tokens: number
  }[]
  modelTokenCost: {
    model: string
    inputPer1M: number
    outputPer1M: number
    cachedPer1M: number
  }[]
  usageOverTime: { date: string; provider: string; tokens: number }[]
  marketShare: {
    provider: string
    providerDisplayName: string
    tokens: number
    percentage: number
  }[]
  cacheRatioByModel: {
    model: string
    ratio: number
    cached: number
    total: number
  }[]
  cacheRatio: {
    overall: number
    cached: number
    total: number
    byProvider: { provider: string; ratio: number }[]
  }
  modelColors: Record<string, string>
  providerColors: Record<string, string>
}

const RANGES: { key: Range; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "all", label: "All" },
]

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function formatTokens(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B"
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return String(n)
}

const easing = [0.23, 1, 0.32, 1] as const

export default function DataPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>("7d")
  const [loading, setLoading] = useState(true)
  const prefersReducedMotion = useReducedMotion()
  const reduce = prefersReducedMotion ?? false

  const pageVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.06, delayChildren: 0.1 },
      },
    }),
    [],
  )

  const sectionVariant = useMemo(
    () => ({
      hidden: { opacity: 0, ...(reduce ? {} : { y: 12 }) },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.3, ease: easing },
      },
    }),
    [reduce],
  )

  const cardVariant = useMemo(
    () => ({
      hidden: { opacity: 0, ...(reduce ? {} : { y: 8 }) },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.25, ease: easing },
      },
    }),
    [reduce],
  )

  const headerVariant = useMemo(
    () => ({
      hidden: { opacity: 0, ...(reduce ? {} : { y: -8 }) },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.3, ease: easing },
      },
    }),
    [reduce],
  )

  const fetchData = useCallback((r: Range) => {
    setLoading(true)
    setError(null)
    fetch(`/api/data/analytics?range=${r}`)
      .then((r2) => r2.json())
      .then((d) => {
        if (d?.error) setError(d.error)
        else if (d?.summary) setData(d)
        else setError("Unexpected response")
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(range)
  }, [range, fetchData])

  if (error)
    return <div className="p-8 text-center text-zinc-500">{error}</div>
  if (loading || !data) return <Loading />

  const s = data.summary
  const usageDaily = aggregateByDate(data.usageOverTime ?? [])
  const avgCostPerReq =
    s.totalRequests > 0 ? s.totalCost / s.totalRequests : 0
  const avgTokensPerReq =
    s.totalRequests > 0 ? Math.round(s.totalTokens / s.totalRequests) : 0
  const timeAgo = formatTimeAgo(data.updatedAt)

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <motion.div
          variants={headerVariant}
          initial="hidden"
          animate="visible"
        >
          <h1 className="text-2xl font-semibold tracking-tight">
            Analytics
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Updated {timeAgo}
          </p>
        </motion.div>
        <motion.div
          variants={headerVariant}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.05 }}
          className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-0.5 text-sm"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-md transition duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-95 ${
                range === r.key
                  ? "bg-zinc-800 text-zinc-100 font-medium shadow-sm"
                  : "text-zinc-500 hoverable:hover:text-zinc-300"
              }`}
            >
              {r.label}
            </button>
          ))}
        </motion.div>
      </div>

      {/* Animated sections */}
      <motion.div
        key={range}
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Summary Cards */}
        <motion.div variants={cardVariant}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-800 rounded-xl overflow-hidden">
            <SummaryCard
              label="Total Cost"
              value={`$${s.totalCost.toFixed(2)}`}
              cardVariant={cardVariant}
            />
            <SummaryCard
              label="Total Tokens"
              value={formatTokens(s.totalTokens)}
              detail={s.totalTokens.toLocaleString()}
              mobileDetail={`${formatTokens(avgTokensPerReq)} / req`}
              cardVariant={cardVariant}
            />
            <SummaryCard
              label="Total Requests"
              value={s.totalRequests.toLocaleString()}
              cardVariant={cardVariant}
            />
            <SummaryCard
              label="Avg Cost / Req"
              value={`$${avgCostPerReq.toFixed(4)}`}
              cardVariant={cardVariant}
            />
          </div>
        </motion.div>

        

        {/* Top Models */}
        <ModelLeaderboardSection
          models={data.topModels ?? []}
          usageDaily={usageDaily}
          modelColors={data.modelColors ?? {}}
          providerColors={data.providerColors ?? {}}
          variant={sectionVariant}
        />

        {/* Session Cost */}
        <SessionCostSection
          models={data.modelSessionCost ?? []}
          variant={sectionVariant}
        />

        {/* Token Cost */}
        <TokenCostSection
          modelTokenCost={data.modelTokenCost ?? []}
          variant={sectionVariant}
        />

        {/* Cache Ratio */}
        <CacheRatioSection
          overall={data.cacheRatio?.overall ?? 0}
          cached={data.cacheRatio?.cached ?? 0}
          total={data.cacheRatio?.total ?? 0}
          byModel={data.cacheRatioByModel ?? []}
          modelColors={data.modelColors ?? {}}
          variant={sectionVariant}
        />

        {/* Usage Over Time */}
        {(usageDaily ?? []).length > 0 && (
          <motion.section variants={sectionVariant}>
            <SectionHeader id="usage">Usage Over Time</SectionHeader>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usageDaily}>
                    <defs>
                      <linearGradient
                        id="tokenGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#a78bfa"
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="100%"
                          stopColor="#a78bfa"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      stroke="#52525b"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#52525b"
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatTokens}
                      axisLine={false}
                      tickLine={false}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#18181b",
                        border: "1px solid #27272a",
                        borderRadius: 8,
                        fontSize: 12,
                        boxShadow:
                          "0 4px 12px rgba(0,0,0,0.4)",
                      }}
                      formatter={(v: number) => [
                        formatTokens(v),
                        "Tokens",
                      ]}
                      labelFormatter={(l) => `Date: ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="tokens"
                      stroke="#a78bfa"
                      strokeWidth={2}
                      fill="url(#tokenGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.section>
        )}

        {/* Market Share */}
        <MarketShareSection
          marketShare={data.marketShare ?? []}
          providerColors={data.providerColors ?? {}}
          variant={sectionVariant}
        />
      </motion.div>
    </div>
  )
}

/* ─── Sections ─── */

function AnimatedSection({
  variant,
  children,
}: {
  variant: Variants
  children: React.ReactNode
}) {
  return (
    <motion.section variants={variant}>
      {children}
    </motion.section>
  )
}

function MarketShareSection({
  marketShare,
  providerColors,
  variant,
}: {
  marketShare: AnalyticsData["marketShare"]
  providerColors: Record<string, string>
  variant: Variants
}) {
  if (marketShare.length === 0) return null

  return (
    <AnimatedSection variant={variant}>
      <SectionHeader id="market-share">Market Share</SectionHeader>
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="h-56 w-56 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={marketShare}
                  dataKey="tokens"
                  nameKey="providerDisplayName"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {marketShare.map((entry) => (
                    <Cell
                      key={entry.provider}
                      fill={
                        providerColors[entry.provider] || "#6366f1"
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    fontSize: 12,
                    boxShadow:
                      "0 4px 12px rgba(0,0,0,0.4)",
                  }}
                  formatter={(value: number, name: string) => [
                    formatTokens(value),
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-3 min-w-0 self-center">
            {marketShare.map((entry) => (
              <div key={entry.provider}>
                <div className="flex justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          providerColors[entry.provider] ||
                          "#6366f1",
                      }}
                    />
                    <span className="text-zinc-400">
                      {entry.providerDisplayName}
                    </span>
                  </div>
                  <span className="text-zinc-300 font-mono tabular-nums">
                    {entry.percentage}%
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      transform: `scaleX(${Math.min(entry.percentage, 100) / 100})`,
                      transformOrigin: "left",
                      backgroundColor:
                        providerColors[entry.provider] ||
                        "#6366f1",
                      transition: "transform 250ms cubic-bezier(0.23, 1, 0.32, 1)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AnimatedSection>
  )
}

function ModelLeaderboardSection({
  models,
  usageDaily,
  modelColors,
  variant,
}: {
  models: AnalyticsData["topModels"]
  usageDaily: { date: string; tokens: number }[]
  modelColors: Record<string, string>
  providerColors: Record<string, string>
  variant: Variants
}) {
  if (models.length === 0) return null

  return (
    <AnimatedSection variant={variant}>
      <SectionHeader id="top-models">Top Models</SectionHeader>

      {usageDaily.length > 1 && (
        <div className="mb-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageDaily}>
                <defs>
                  <linearGradient
                    id="usageFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#a78bfa"
                      stopOpacity={0.15}
                    />
                    <stop
                      offset="100%"
                      stopColor="#a78bfa"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="#52525b"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  stroke="#52525b"
                  tick={{ fontSize: 10 }}
                  tickFormatter={formatTokens}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    fontSize: 12,
                    boxShadow:
                      "0 4px 12px rgba(0,0,0,0.4)",
                  }}
                  formatter={(v: number) => [
                    formatTokens(v),
                    "Tokens",
                  ]}
                  labelFormatter={(l) => `Date: ${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="#a78bfa"
                  strokeWidth={1.5}
                  fill="url(#usageFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-600 uppercase tracking-wider border-b border-zinc-800">
              <th className="text-left py-3 pl-4 pr-2 w-8">
                #
              </th>
              <th className="text-left py-3 pr-3">Model</th>
              <th className="text-right py-3 px-2">Tokens</th>
              <th className="text-right py-3 px-2">Trend</th>
              <th className="text-right py-3 px-2">Cost</th>
              <th className="text-right py-3 pr-4 pl-2 hidden sm:table-cell">
                Avg/Req
              </th>
            </tr>
          </thead>
          <tbody>
            {models.slice(0, 20).map((m, i) => {
              const color =
                modelColors[m.model] || "#6366f1"
              return (
                <tr
                  key={m.model}
                  className="border-b border-zinc-800/40 hoverable:hover:bg-zinc-800/20"
                >
                  <td className="py-3 pl-4 pr-2 text-zinc-500 font-mono text-xs">
                    {i + 1}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: color,
                        }}
                      />
                      <span className="font-medium text-zinc-200">
                        {m.model}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-medium bg-zinc-800/60 px-1.5 py-0.5 rounded">
                        {m.providerDisplayName}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-right text-zinc-300 font-mono text-xs tabular-nums">
                    {formatTokens(m.tokens)}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {m.trend !== null ? (
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          m.trend >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {m.trend >= 0 ? "+" : ""}
                        {m.trend}%
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right text-zinc-300 font-mono text-xs tabular-nums">
                    ${m.cost.toFixed(2)}
                  </td>
                  <td className="py-3 pr-4 pl-2 text-right text-zinc-500 font-mono text-xs tabular-nums hidden sm:table-cell">
                    ${m.sessionCost.toFixed(4)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </AnimatedSection>
  )
}

function SessionCostSection({
  models,
  variant,
}: {
  models: AnalyticsData["modelSessionCost"]
  variant: Variants
}) {
  if (models.length === 0) return null

  return (
    <AnimatedSection variant={variant}>
      <SectionHeader id="session-cost">
        Session Cost
      </SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-4">
            Cost per Request
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={models.slice(0, 10)}
                layout="vertical"
                margin={{
                  left: 0,
                  right: 8,
                  top: 4,
                  bottom: 4,
                }}
              >
                <XAxis
                  type="number"
                  stroke="#52525b"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${v.toFixed(3)}`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="model"
                  stroke="#52525b"
                  tick={{ fontSize: 11 }}
                  width={90}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    fontSize: 12,
                    boxShadow:
                      "0 4px 12px rgba(0,0,0,0.4)",
                  }}
                  formatter={(v: number) => [
                    `$${v.toFixed(4)}`,
                    undefined,
                  ]}
                />
                <Bar
                  dataKey="sessionCost"
                  radius={[0, 4, 4, 0]}
                  fill="#a78bfa"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-4">
            Tokens per Request
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={models.slice(0, 10)}
                layout="vertical"
                margin={{
                  left: 0,
                  right: 8,
                  top: 4,
                  bottom: 4,
                }}
              >
                <XAxis
                  type="number"
                  stroke="#52525b"
                  tick={{ fontSize: 11 }}
                  tickFormatter={formatTokens}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="model"
                  stroke="#52525b"
                  tick={{ fontSize: 11 }}
                  width={90}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    fontSize: 12,
                    boxShadow:
                      "0 4px 12px rgba(0,0,0,0.4)",
                  }}
                  formatter={(v: number) => [
                    formatTokens(v),
                    undefined,
                  ]}
                />
                <Bar
                  dataKey="tokensPerSession"
                  radius={[0, 4, 4, 0]}
                  fill="#34d399"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AnimatedSection>
  )
}

function TokenCostSection({
  modelTokenCost,
  variant,
}: {
  modelTokenCost: AnalyticsData["modelTokenCost"]
  variant: Variants
}) {
  if (modelTokenCost.length === 0) return null
  const chartData = modelTokenCost.slice(0, 10)

  return (
    <AnimatedSection variant={variant}>
      <SectionHeader id="token-cost">
        Token Cost (per 1M)
      </SectionHeader>
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 0, right: 8, top: 4, bottom: 4 }}
            >
              <XAxis
                type="number"
                stroke="#52525b"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${v.toFixed(1)}`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="model"
                stroke="#52525b"
                tick={{ fontSize: 11 }}
                width={100}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  fontSize: 12,
                  boxShadow:
                    "0 4px 12px rgba(0,0,0,0.4)",
                }}
              />
              <Bar
                dataKey="cachedPer1M"
                name="Cached"
                stackId="a"
                radius={[0, 0, 0, 0]}
                fill="#4ade80"
              />
              <Bar
                dataKey="inputPer1M"
                name="Input"
                stackId="a"
                radius={[0, 0, 0, 0]}
                fill="#a78bfa"
              />
              <Bar
                dataKey="outputPer1M"
                name="Output"
                stackId="a"
                radius={[0, 4, 4, 0]}
                fill="#f472b6"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#4ade80]" />
            Cached Input
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#a78bfa]" />
            Input
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#f472b6]" />
            Output
          </div>
        </div>
      </div>
    </AnimatedSection>
  )
}

function CacheRatioSection({
  overall,
  cached,
  total,
  byModel,
  modelColors,
  variant,
}: {
  overall: number
  cached: number
  total: number
  byModel: {
    model: string
    ratio: number
    cached: number
    total: number
  }[]
  modelColors: Record<string, string>
  variant: Variants
}) {
  if (byModel.length === 0) return null

  return (
    <AnimatedSection variant={variant}>
      <SectionHeader id="cache-ratio">Cache Ratio</SectionHeader>
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
        <div className="flex items-baseline gap-3 mb-6">
          <div className="text-4xl font-semibold text-zinc-200 tabular-nums">
            {overall}%
          </div>
          <div className="text-sm text-zinc-500">
            {cached.toLocaleString()} cached /{" "}
            {total.toLocaleString()} total tokens
          </div>
        </div>
        <div className="space-y-3">
          {byModel.slice(0, 15).map((m) => (
            <div key={m.model}>
              <div className="flex justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        modelColors[m.model] || "#6366f1",
                    }}
                  />
                  <span className="text-zinc-400">
                    {m.model}
                  </span>
                </div>
                <span className="text-zinc-300 font-mono tabular-nums">
                  {m.ratio}%
                </span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    transform: `scaleX(${Math.min(m.ratio, 100) / 100})`,
                    transformOrigin: "left",
                    backgroundColor:
                      modelColors[m.model] || "#6366f1",
                    transition: "transform 250ms cubic-bezier(0.23, 1, 0.32, 1)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  )
}

/* ─── Shared Components ─── */

function SectionHeader({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  return (
    <h2
      id={id}
      className="text-lg font-semibold text-zinc-200 mb-4 scroll-mt-24"
    >
      {children}
    </h2>
  )
}

function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-12">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-28 bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-24 bg-zinc-800/50 rounded animate-pulse" />
        </div>
        <div className="h-9 w-44 bg-zinc-800 rounded-lg animate-pulse" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-800 rounded-xl overflow-hidden">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-zinc-900 p-4 space-y-2">
            <div className="h-3 w-20 bg-zinc-800 rounded animate-pulse" />
            <div className="h-6 w-28 bg-zinc-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <div className="h-5 w-36 bg-zinc-800 rounded animate-pulse" />
        <div className="h-72 bg-zinc-900/50 border border-zinc-800 rounded-xl animate-pulse" />
      </div>
      <div className="space-y-4">
        <div className="h-5 w-28 bg-zinc-800 rounded animate-pulse" />
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-12 bg-zinc-900/50 border-b border-zinc-800/40 flex items-center px-4 gap-3"
            >
              <div className="h-3 w-4 bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 w-48 bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 w-16 bg-zinc-800 rounded animate-pulse ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  mobileDetail,
  cardVariant,
}: {
  label: string
  value: string
  detail?: string
  mobileDetail?: string
  cardVariant: Variants
}) {
  return (
    <motion.div variants={cardVariant} className="bg-zinc-900 p-4 hoverable:hover:bg-zinc-800/30 transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-xl font-semibold mt-1 text-zinc-200 tabular-nums">
        {value}
      </p>
      {detail && (
        <p className="text-xs text-zinc-600 mt-0.5">{detail}</p>
      )}
      {mobileDetail && (
        <p className="text-xs text-zinc-600 mt-0.5 md:hidden">
          {mobileDetail}
        </p>
      )}
    </motion.div>
  )
}

function aggregateByDate(
  rows: { date: string | Date; tokens: number }[],
) {
  const map = new Map<string, number>()
  for (const r of rows) {
    const dateStr =
      r.date instanceof Date
        ? r.date.toISOString().slice(0, 10)
        : String(r.date).slice(0, 10)
    map.set(dateStr, (map.get(dateStr) ?? 0) + r.tokens)
  }
  return Array.from(map.entries())
    .map(([date, tokens]) => ({ date, tokens }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
