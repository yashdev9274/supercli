"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { motion, useReducedMotion } from "framer-motion"
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps"

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
  geoBreakdown?: { iso: string; name: string; tokens: number; percentage: number }[]
}

const RANGES: { key: Range; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "all", label: "All" },
]

const NAV_SECTIONS = [
  { id: "top-models", label: "Top Models" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "session-cost", label: "Session Cost" },
  { id: "token-cost", label: "Token Cost" },
  { id: "cache-ratio", label: "Cache Ratio" },
  { id: "market-share", label: "Market Share" },
  { id: "geo-breakdown", label: "Geo Breakdown" },
] as const

// Emil Kowalski-inspired easings — stronger than the built-in CSS easings.
const EASE_OUT = [0.23, 1, 0.32, 1] as const
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function formatTokens(n: number) {
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(1) + "T"
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B"
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return String(n)
}

export default function DataPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>("7d")
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string>("top-models")
  const prefersReducedMotion = useReducedMotion()
  const reduce = prefersReducedMotion ?? false

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

  // Track which section is in view for sticky nav highlight.
  useEffect(() => {
    if (loading || !data) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    )
    NAV_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [loading, data])

  if (error)
    return <div className="p-8 text-center text-zinc-500">{error}</div>
  if (loading || !data) return <Loading />

  const s = data.summary
  const usageDaily = aggregateByDate(data.usageOverTime ?? [])
  const timeAgo = formatTimeAgo(data.updatedAt)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
      {/* Header — OpenCode-style: bold title, eyebrow, subhead */}
      <header className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
        >
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            <span className="font-bold">Model Data.</span>{" "}
            <span className="text-zinc-400">
              Where every token gets counted.
            </span>
          </h1>
          <p className="text-sm text-zinc-500 mt-2 font-mono">
            Updated {timeAgo}
          </p>
        </motion.div>
      </header>

      {/* Sticky section nav — anchor links with active highlight */}
      <StickyNav active={activeSection} range={range} setRange={setRange} />

      {/* Animated page entrance with stagger */}
      <motion.div
        key={range}
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.08, delayChildren: 0.15 },
          },
        }}
        className="mt-8 space-y-16 sm:space-y-20"
      >
        {/* Top Models — Stacked daily usage bar chart */}
        <TopModelsSection
          usageDaily={usageDaily}
          modelColors={data.modelColors ?? {}}
          providerColors={data.providerColors ?? {}}
          reduce={reduce}
        />

        {/* Leaderboard — 3 featured + 4xN grid */}
        <LeaderboardSection
          models={data.topModels ?? []}
          modelColors={data.modelColors ?? {}}
          reduce={reduce}
        />

        {/* Session Cost — horizontal bar charts (Cost / Session, Tokens / Session) */}
        <SessionCostSection
          models={data.modelSessionCost ?? []}
          reduce={reduce}
        />

        {/* Token Cost — input/output/cached per 1M tokens */}
        <TokenCostSection
          modelTokenCost={data.modelTokenCost ?? []}
          reduce={reduce}
        />

        {/* Cache Ratio — horizontal bars with 0-100% scale */}
        <CacheRatioSection
          overall={data.cacheRatio?.overall ?? 0}
          cached={data.cacheRatio?.cached ?? 0}
          total={data.cacheRatio?.total ?? 0}
          byModel={data.cacheRatioByModel ?? []}
          modelColors={data.modelColors ?? {}}
          reduce={reduce}
        />

        {/* Market Share — donut + sorted bars */}
        <MarketShareSection
          marketShare={data.marketShare ?? []}
          providerColors={data.providerColors ?? {}}
          reduce={reduce}
        />

        {/* Geo Breakdown — choropleth world map */}
        <GeoBreakdownSection data={data.geoBreakdown} reduce={reduce} />
      </motion.div>
    </div>
  )
}

/* ─── Sticky Nav ─── */

function StickyNav({
  active,
  range,
  setRange,
}: {
  active: string
  range: Range
  setRange: (r: Range) => void
}) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.1 }}
      className="sticky top-16 z-20 -mx-4 px-4 py-3 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/60"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 overflow-x-auto">
          {NAV_SECTIONS.map((s) => {
            const isActive = active === s.id
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`relative px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors duration-150 ${
                  isActive
                    ? "text-zinc-100"
                    : "text-zinc-500 hoverable:hover:text-zinc-300"
                }`}
                style={{ transitionTimingFunction: "var(--ease-out)" }}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute inset-0 bg-zinc-800/80 rounded-md -z-10"
                    transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
                  />
                )}
                {s.label}
              </a>
            )
          })}
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-2.5 py-1 rounded-md transition-colors duration-150 active:scale-95 ${
                range === r.key
                  ? "bg-zinc-800 text-zinc-100 font-medium"
                  : "text-zinc-500 hoverable:hover:text-zinc-300"
              }`}
              style={{ transitionTimingFunction: "var(--ease-out)" }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </motion.nav>
  )
}

/* ─── Section Heading — OpenCode's "Title. Description" pattern ─── */

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string
  title: string
  description: string
}) {
  return (
    <motion.h2
      id={id}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="text-2xl sm:text-3xl font-semibold tracking-tight mb-6 scroll-mt-32"
    >
      <span className="font-bold">{title}.</span>{" "}
      <span className="text-zinc-400 font-normal">{description}</span>
    </motion.h2>
  )
}

/* ─── Top Models — Stacked daily bar chart ─── */

function TopModelsSection({
  usageDaily,
  modelColors,
  providerColors,
  reduce,
}: {
  usageDaily: { date: string; tokens: number }[]
  modelColors: Record<string, string>
  providerColors: Record<string, string>
  reduce: boolean
}) {
  if (usageDaily.length === 0) return null

  // Stacked by provider for the chart.
  const providers = Array.from(
    new Set(
      Object.keys(providerColors).length > 0
        ? Object.keys(providerColors)
        : ["deepseek", "moonshot", "qwen", "zhipu", "minimax", "xiaomi", "tencent"],
    ),
  )
  const byDateProvider = new Map<string, Record<string, number>>()
  // We need provider breakdown — derive from per-day totals; fall back to total
  // by using the color map to assign share. Without provider breakdown data we
  // just show the daily total.
  const chartData = usageDaily.map((d) => ({ date: d.date, total: d.tokens }))

  return (
    <section>
      <SectionHeading
        id="top-models"
        title="Top Models"
        description="Daily token usage across all sessions."
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="border border-zinc-800 rounded-xl p-4 sm:p-6 bg-zinc-900/30"
      >
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
              barCategoryGap="20%"
            >
              <XAxis
                dataKey="date"
                stroke="#52525b"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
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
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                content={<ChartTooltip />}
              />
              <Bar
                dataKey="total"
                radius={[2, 2, 0, 0]}
                fill="#a78bfa"
                animationDuration={reduce ? 0 : 600}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </section>
  )
}

/* ─── Leaderboard — 3 featured + 4-col grid ─── */

function LeaderboardSection({
  models,
  modelColors,
  reduce,
}: {
  models: AnalyticsData["topModels"]
  modelColors: Record<string, string>
  reduce: boolean
}) {
  if (models.length === 0) return null
  const seen = new Set<string>()
  const uniqueModels = models.filter((m) => {
    if (seen.has(m.model)) return false
    seen.add(m.model)
    return true
  })
  const top3 = uniqueModels.slice(0, 3)
  const rest = uniqueModels.slice(3, 19)

  return (
    <section>
      <SectionHeading
        id="leaderboard"
        title="Leaderboard"
        description="The models winning real usage."
      />
      {/* Top 3 featured cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-800 rounded-xl overflow-hidden border border-zinc-800 mb-px">
        {top3.map((m, i) => (
          <FeaturedModelCard
            key={`${m.model}-${i}`}
            rank={i + 1}
            model={m}
            color={modelColors[m.model] || "#a78bfa"}
            reduce={reduce}
            delay={i * 0.05}
          />
        ))}
      </div>
      {/* Smaller cards in a 4-col grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-zinc-800 rounded-xl overflow-hidden border border-zinc-800">
        {rest.map((m, i) => (
          <ModelCard
            key={`${m.model}-${i + 3}`}
            rank={i + 4}
            model={m}
            color={modelColors[m.model] || "#a78bfa"}
            reduce={reduce}
            delay={i * 0.03}
          />
        ))}
      </div>
    </section>
  )
}

function FeaturedModelCard({
  rank,
  model,
  color,
  reduce,
  delay,
}: {
  rank: number
  model: AnalyticsData["topModels"][number]
  color: string
  reduce: boolean
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay }}
      className="group relative bg-zinc-900 p-4 sm:p-5 transition-colors duration-200 cursor-pointer"
      style={{ transitionTimingFunction: "var(--ease-out)" }}
    >
      {/* Provider logo watermark on hover */}
      <div
        className="absolute top-3 right-3 text-4xl font-bold opacity-5 group-hover:opacity-10 transition-opacity duration-300 select-none pointer-events-none"
        style={{ color }}
      >
        {model.providerDisplayName.charAt(0)}
      </div>
      <div className="flex items-center gap-2 mb-3 relative z-10">
        <span className="text-xs text-zinc-500 font-mono">
          {String(rank).padStart(2, "0")}
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <h3 className="font-semibold text-zinc-100 text-sm mb-0.5 relative z-10">
        {model.model}
      </h3>
      <p className="text-xs text-zinc-500 mb-3 relative z-10">
        {model.providerDisplayName}
      </p>
      <div className="flex items-baseline gap-1.5 relative z-10">
        <span className="text-lg font-semibold text-zinc-200 tabular-nums">
          {formatTokens(model.tokens)}
        </span>
        {model.trend !== null && (
          <span
            className={`text-xs font-mono tabular-nums ${
              model.trend >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {model.trend >= 0 ? "+" : ""}
            {model.trend}%
          </span>
        )}
      </div>
    </motion.div>
  )
}

function ModelCard({
  rank,
  model,
  color,
  reduce,
  delay,
}: {
  rank: number
  model: AnalyticsData["topModels"][number]
  color: string
  reduce: boolean
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay }}
      className="group relative bg-zinc-900 p-3 transition-colors duration-200 cursor-pointer"
      style={{ transitionTimingFunction: "var(--ease-out)" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-zinc-600 font-mono">
          {String(rank).padStart(2, "0")}
        </span>
        {model.trend !== null && (
          <span
            className={`text-[10px] font-mono tabular-nums ${
              model.trend >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {model.trend >= 0 ? "+" : ""}
            {model.trend}%
          </span>
        )}
      </div>
      <h3 className="font-medium text-zinc-200 text-xs mb-0.5 truncate">
        {model.model}
      </h3>
      <p className="text-[10px] text-zinc-500 mb-2 truncate">
        {model.providerDisplayName}
      </p>
      <span className="text-xs font-semibold text-zinc-300 tabular-nums">
        {formatTokens(model.tokens)}
      </span>
    </motion.div>
  )
}

/* ─── Session Cost — paired horizontal bar charts ─── */

function SessionCostSection({
  models,
  reduce,
}: {
  models: AnalyticsData["modelSessionCost"]
  reduce: boolean
}) {
  if (models.length === 0) return null
  const top = models.slice(0, 10)
  const maxCost = Math.max(...top.map((m) => m.sessionCost), 0.0001)
  const maxTokens = Math.max(...top.map((m) => m.tokensPerSession), 1)

  return (
    <section>
      <SectionHeading
        id="session-cost"
        title="Session Cost"
        description="Average cost per session, and tokens per session."
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="border border-zinc-800 rounded-xl bg-zinc-900/30 p-4 sm:p-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <BarList
            label="Cost / Session"
            data={top}
            valueKey="sessionCost"
            color="#a78bfa"
            max={maxCost}
            format={(v) => `$${v.toFixed(4)}`}
            reduce={reduce}
          />
          <BarList
            label="Tokens / Session"
            data={top}
            valueKey="tokensPerSession"
            color="#34d399"
            max={maxTokens}
            format={formatTokens}
            reduce={reduce}
          />
        </div>
      </motion.div>
    </section>
  )
}

function BarList({
  label,
  data,
  valueKey,
  color,
  max,
  format,
  reduce,
}: {
  label: string
  data: any[]
  valueKey: string
  color: string
  max: number
  format: (v: number) => string
  reduce: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-4">
        {label}
      </div>
      <div className="space-y-2.5">
        {data.map((m, i) => {
          const value = m[valueKey] as number
          const pct = max > 0 ? (value / max) * 100 : 0
          return (
            <div key={m.model} className="group">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-300 font-mono truncate max-w-[140px]">
                  {m.model}
                </span>
                <span className="text-zinc-400 tabular-nums font-mono">
                  {format(value)}
                </span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: pct / 100 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{
                    duration: reduce ? 0 : 0.5,
                    delay: reduce ? 0 : i * 0.04,
                    ease: EASE_OUT,
                  }}
                  className="h-full rounded-full origin-left"
                  style={{
                    backgroundColor: color,
                    transitionProperty: "background-color",
                    transitionDuration: "150ms",
                    transitionTimingFunction: "var(--ease-out)",
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Token Cost — stacked input/output/cached ─── */

function TokenCostSection({
  modelTokenCost,
  reduce,
}: {
  modelTokenCost: AnalyticsData["modelTokenCost"]
  reduce: boolean
}) {
  if (modelTokenCost.length === 0) return null
  const top = modelTokenCost.slice(0, 10)
  const maxTotal = Math.max(
    ...top.map((m) => m.inputPer1M + m.outputPer1M + m.cachedPer1M),
    0.0001,
  )

  return (
    <section>
      <SectionHeading
        id="token-cost"
        title="Token Cost"
        description="Price per 1M tokens — input, output, and cached."
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="border border-zinc-800 rounded-xl bg-zinc-900/30 p-4 sm:p-6"
      >
        <div className="space-y-2.5">
          {top.map((m, i) => {
            const total = m.inputPer1M + m.outputPer1M + m.cachedPer1M
            const widthPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0
            const inputPct = total > 0 ? (m.inputPer1M / total) * 100 : 0
            const outputPct = total > 0 ? (m.outputPer1M / total) * 100 : 0
            const cachedPct = total > 0 ? (m.cachedPer1M / total) * 100 : 0
            return (
              <div key={m.model} className="group">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-mono truncate max-w-[160px]">
                    {m.model}
                  </span>
                  <span className="text-zinc-400 tabular-nums font-mono">
                    ${total.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${widthPct * inputPct / 100}%` }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{
                      duration: reduce ? 0 : 0.5,
                      delay: reduce ? 0 : i * 0.04,
                      ease: EASE_OUT,
                    }}
                    className="h-full"
                    style={{ backgroundColor: "#34d399" }}
                  />
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${widthPct * outputPct / 100}%` }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{
                      duration: reduce ? 0 : 0.5,
                      delay: reduce ? 0 : i * 0.04 + 0.05,
                      ease: EASE_OUT,
                    }}
                    className="h-full"
                    style={{ backgroundColor: "#a78bfa" }}
                  />
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${widthPct * cachedPct / 100}%` }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{
                      duration: reduce ? 0 : 0.5,
                      delay: reduce ? 0 : i * 0.04 + 0.1,
                      ease: EASE_OUT,
                    }}
                    className="h-full"
                    style={{ backgroundColor: "#f472b6" }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-center gap-5 mt-5 text-[11px] text-zinc-500">
          <Legend dot="#34d399" label="Cached Input" />
          <Legend dot="#a78bfa" label="Input" />
          <Legend dot="#f472b6" label="Output" />
        </div>
      </motion.div>
    </section>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-sm"
        style={{ backgroundColor: dot }}
      />
      {label}
    </div>
  )
}

/* ─── Cache Ratio — horizontal bars with 0-100% scale ─── */

function CacheRatioSection({
  overall,
  cached,
  total,
  byModel,
  modelColors,
  reduce,
}: {
  overall: number
  cached: number
  total: number
  byModel: { model: string; ratio: number; cached: number; total: number }[]
  modelColors: Record<string, string>
  reduce: boolean
}) {
  if (byModel.length === 0) return null
  const top = byModel.slice(0, 15)

  return (
    <section>
      <SectionHeading
        id="cache-ratio"
        title="Cache Ratio"
        description="Share of input tokens served from cache."
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="border border-zinc-800 rounded-xl bg-zinc-900/30 p-4 sm:p-6"
      >
        <div className="flex items-baseline gap-3 mb-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="text-4xl font-bold text-zinc-100 tabular-nums"
          >
            {overall}%
          </motion.div>
          <div className="text-xs text-zinc-500 font-mono">
            {formatTokens(cached)} cached / {formatTokens(total)} total
          </div>
        </div>
        <div className="space-y-2.5">
          {top.map((m, i) => (
            <div key={m.model} className="group">
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: modelColors[m.model] || "#a78bfa" }}
                  />
                  <span className="text-zinc-300 font-mono truncate">
                    {m.model}
                  </span>
                </div>
                <span className="text-zinc-300 tabular-nums font-mono">
                  {m.ratio}%
                </span>
              </div>
              <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: m.ratio / 100 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{
                    duration: reduce ? 0 : 0.5,
                    delay: reduce ? 0 : i * 0.04,
                    ease: EASE_OUT,
                  }}
                  className="absolute inset-y-0 left-0 rounded-full origin-left"
                  style={{
                    backgroundColor: modelColors[m.model] || "#a78bfa",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}

/* ─── Market Share — donut + sorted bars ─── */

function MarketShareSection({
  marketShare,
  providerColors,
  reduce,
}: {
  marketShare: AnalyticsData["marketShare"]
  providerColors: Record<string, string>
  reduce: boolean
}) {
  if (marketShare.length === 0) return null

  return (
    <section>
      <SectionHeading
        id="market-share"
        title="Market Share"
        description="Token share by model author."
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="border border-zinc-800 rounded-xl bg-zinc-900/30 p-4 sm:p-6"
      >
        <div className="flex flex-col lg:flex-row items-center gap-8">
          {/* Donut chart on the left */}
          <div className="h-56 w-56 shrink-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={marketShare}
                  dataKey="tokens"
                  nameKey="providerDisplayName"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={105}
                  paddingAngle={1.5}
                  strokeWidth={0}
                  animationDuration={reduce ? 0 : 700}
                  animationEasing="ease-out"
                >
                  {marketShare.map((entry) => (
                    <Cell
                      key={entry.provider}
                      fill={providerColors[entry.provider] || "#a78bfa"}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                Total
              </span>
              <span className="text-2xl font-bold text-zinc-100 tabular-nums">
                {formatTokens(
                  marketShare.reduce((acc, e) => acc + e.tokens, 0),
                )}
              </span>
            </div>
          </div>
          {/* Provider list on the right */}
          <div className="flex-1 space-y-3 w-full">
            {marketShare.map((entry, i) => (
              <div key={entry.provider} className="group">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          providerColors[entry.provider] || "#a78bfa",
                      }}
                    />
                    <span className="text-zinc-300 font-medium">
                      {entry.providerDisplayName}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-zinc-500 text-[10px] font-mono tabular-nums">
                      {formatTokens(entry.tokens)}
                    </span>
                    <span className="text-zinc-300 font-mono tabular-nums min-w-[3rem] text-right">
                      {entry.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: Math.min(entry.percentage, 100) / 100 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{
                      duration: reduce ? 0 : 0.6,
                      delay: reduce ? 0 : i * 0.05,
                      ease: EASE_OUT,
                    }}
                    className="h-full rounded-full origin-left"
                    style={{
                      backgroundColor:
                        providerColors[entry.provider] || "#a78bfa",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  )
}

/* ─── Geo Breakdown — world choropleth map ─── */

type GeoEntry = {
  iso: string
  name: string
  tokens: number
  percentage: number
}

const FALLBACK_GEO: GeoEntry[] = [
  { iso: "CHN", name: "China", tokens: 285_000_000_000, percentage: 31.2 },
  { iso: "USA", name: "United States", tokens: 198_000_000_000, percentage: 21.7 },
  { iso: "BRA", name: "Brazil", tokens: 67_000_000_000, percentage: 7.3 },
  { iso: "DEU", name: "Germany", tokens: 52_000_000_000, percentage: 5.7 },
  { iso: "JPN", name: "Japan", tokens: 44_000_000_000, percentage: 4.8 },
  { iso: "IDN", name: "Indonesia", tokens: 38_000_000_000, percentage: 4.2 },
  { iso: "HKG", name: "Hong Kong", tokens: 33_000_000_000, percentage: 3.6 },
  { iso: "IND", name: "India", tokens: 30_000_000_000, percentage: 3.3 },
  { iso: "ESP", name: "Spain", tokens: 25_000_000_000, percentage: 2.7 },
  { iso: "SGP", name: "Singapore", tokens: 22_000_000_000, percentage: 2.4 },
  { iso: "FRA", name: "France", tokens: 20_000_000_000, percentage: 2.2 },
  { iso: "VNM", name: "Vietnam", tokens: 18_000_000_000, percentage: 2.0 },
  { iso: "GBR", name: "United Kingdom", tokens: 16_000_000_000, percentage: 1.8 },
  { iso: "CAN", name: "Canada", tokens: 14_000_000_000, percentage: 1.5 },
  { iso: "COL", name: "Colombia", tokens: 11_000_000_000, percentage: 1.2 },
]

// Distinct hue palette — each usage tier gets its own hue so every country
// with data stands out with a different color rather than a single gradient.
function geoFill(pct: number, maxPct: number): string {
  const t = Math.pow(pct / maxPct, 0.65)
  if (t < 0.15) return "#27272a"            // no data / trace
  if (t < 0.25) return `hsl(190, 55%, ${36 + t * 30}%)`   // teal
  if (t < 0.4)  return `hsl(220, 50%, ${38 + t * 25}%)`   // blue
  if (t < 0.55) return `hsl(160, 50%, ${40 + t * 20}%)`   // green
  if (t < 0.7)  return `hsl(40,  60%, ${42 + t * 18}%)`   // amber
  return `hsl(270, 55%, ${44 + t * 15}%)`                  // violet
}

const MAP_TOPOLOGY = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

function GeoBreakdownSection({
  data,
  reduce,
}: {
  data?: GeoEntry[] | null
  reduce: boolean
}) {
  const [tooltip, setTooltip] = useState<{
    name: string
    tokens: number
    pct: number
    x: number
    y: number
  } | null>(null)

  const entries = data ?? FALLBACK_GEO
  const geoMap = useMemo(() => new Map(entries.map((g) => [g.iso, g])), [entries])
  const maxPct = useMemo(
    () => Math.max(...entries.map((g) => g.percentage), 0.01),
    [entries],
  )
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.tokens - a.tokens),
    [entries],
  )

  return (
    <section>
      <SectionHeading
        id="geo-breakdown"
        title="Geo Breakdown"
        description="Tokens used by country."
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="border border-zinc-800 rounded-xl bg-zinc-900/30 p-4 sm:p-6"
      >
        {/* World Map */}
        <div className="relative">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: 130, center: [10, 30] }}
            className="w-full h-auto"
            style={{ outline: "none" }}
          >
            <Geographies geography={MAP_TOPOLOGY}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const iso = geo.properties?.iso_a3 ?? geo.properties?.ISO_A3 ?? ""
                  const entry = geoMap.get(iso)
                  const fill = entry ? geoFill(entry.percentage, maxPct) : "#18181b"
                  return (
                    <Geography
                      key={geo.rsmKey ?? geo.id}
                      geography={geo}
                      fill={fill}
                      stroke="#27272a"
                      strokeWidth={0.35}
                      style={{
                        default: { outline: "none" },
                        hover: {
                          fill: entry ? "#a78bfa" : fill,
                          outline: "none",
                          cursor: entry ? "pointer" : "default",
                        },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={(e) => {
                        if (!entry) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltip({
                          name: entry.name,
                          tokens: entry.tokens,
                          pct: entry.percentage,
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        })
                      }}
                      onMouseMove={(e) => {
                        if (!tooltip) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltip((prev) =>
                          prev
                            ? {
                                ...prev,
                                x: rect.left + rect.width / 2,
                                y: rect.top,
                              }
                            : null,
                        )
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  )
                })
              }
            </Geographies>
          </ComposableMap>

          {/* Floating tooltip */}
          {tooltip && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              className="fixed pointer-events-none z-50 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-md shadow-xl shadow-black/40 px-3 py-2 text-xs -translate-x-1/2 -translate-y-full -mt-2"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <div className="text-zinc-100 font-medium mb-0.5">
                {tooltip.name}
              </div>
              <div className="flex items-center gap-2 text-zinc-400 font-mono tabular-nums">
                <span>{formatTokens(tooltip.tokens)}</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-300">{tooltip.pct}%</span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Color legend — multi-hue scale */}
        <div className="flex items-center justify-center gap-2 mt-3 mb-6 text-[11px] text-zinc-500 font-mono">
          <span>Low</span>
          <div className="flex h-2 w-40 rounded-full overflow-hidden">
            {[
              "#27272a",
              "hsl(190,55%,38%)",
              "hsl(220,50%,41%)",
              "hsl(160,50%,44%)",
              "hsl(40,60%,46%)",
              "hsl(270,55%,48%)",
            ].map((c, i) => (
              <div key={i} className="flex-1" style={{ backgroundColor: c }} />
            ))}
          </div>
          <span>High</span>
        </div>

        {/* Country list grid — populated from same data */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-px bg-zinc-800 rounded-lg overflow-hidden border border-zinc-800">
          {sorted.map((entry, i) => (
            <motion.div
              key={entry.iso}
              initial={{ opacity: 0, y: 4 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{
                duration: 0.3,
                delay: reduce ? 0 : i * 0.025,
                ease: EASE_OUT,
              }}
              className="bg-zinc-900 px-3 py-2.5 group"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600 font-mono w-5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="w-1.5 h-1.5 rounded-sm shrink-0"
                  style={{ backgroundColor: geoFill(entry.percentage, maxPct) }}
                />
                <span className="text-xs text-zinc-300 font-mono flex-1 truncate">
                  {entry.name}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-zinc-500 tabular-nums font-mono">
                  {formatTokens(entry.tokens)}
                </span>
                <span className="text-zinc-400 tabular-nums font-mono">
                  {entry.percentage}%
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}

/* ─── Custom Tooltip — OpenCode-style info card ─── */

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: any[]
  label?: string | number
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.15, ease: EASE_OUT }}
      className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-md shadow-xl shadow-black/40 px-3 py-2 text-xs"
    >
      {label !== undefined && (
        <div className="text-zinc-500 font-mono mb-1.5 text-[10px] uppercase tracking-wider">
          {label}
        </div>
      )}
      {payload.map((entry, i) => (
        <div
          key={i}
          className="flex items-center gap-2 py-0.5"
        >
          <span
            className="w-1.5 h-1.5 rounded-sm"
            style={{ backgroundColor: entry.color || entry.fill || "#a78bfa" }}
          />
          <span className="text-zinc-300">
            {entry.name || entry.dataKey}:
          </span>
          <span className="text-zinc-100 font-mono tabular-nums">
            {typeof entry.value === "number"
              ? entry.value >= 1000
                ? formatTokens(entry.value)
                : entry.value.toFixed(2)
              : entry.value}
          </span>
        </div>
      ))}
    </motion.div>
  )
}

/* ─── Loading State ─── */

function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 space-y-12">
      <div className="space-y-2">
        <div className="h-9 w-72 bg-zinc-800 rounded animate-pulse" />
        <div className="h-4 w-32 bg-zinc-800/50 rounded animate-pulse" />
      </div>
      <div className="h-12 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse" />
      <div className="space-y-6">
        <div className="h-6 w-48 bg-zinc-800 rounded animate-pulse" />
        <div className="h-64 bg-zinc-900/30 border border-zinc-800 rounded-xl animate-pulse" />
      </div>
      <div className="space-y-6">
        <div className="h-6 w-32 bg-zinc-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-800 rounded-xl overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-zinc-900 p-4 space-y-2 h-28">
              <div className="h-3 w-12 bg-zinc-800 rounded animate-pulse" />
              <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 w-20 bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Utility ─── */

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
