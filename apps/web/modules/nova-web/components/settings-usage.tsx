"use client"

import { useState } from "react"
import { ArrowDownLeft, Clock3, Cpu, Plug, RefreshCw, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SettingsUsage } from "@/modules/nova/settings/service"

const CATEGORIES = [
  { kind: "models", label: "Models", icon: Sparkles, color: "bg-[#2dd4bf]", text: "text-[#2dd4bf]", field: "modelCredits" },
  { kind: "machines", label: "Machines", icon: Cpu, color: "bg-[#60a5fa]", text: "text-[#60a5fa]", field: "machineCredits" },
  { kind: "mcp", label: "MCP & apps", icon: Plug, color: "bg-[#c4a0ff]", text: "text-[#c4a0ff]", field: "mcpCredits" },
] as const

type UsageKind = typeof CATEGORIES[number]["kind"]

function credits(value: number): string {
  if (value > 0 && value < 0.01) return "<0.01"
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}

export function UsageSection({ loading, error, data, onRefresh }: {
  loading: boolean
  error: string | null
  data: SettingsUsage | null
  onRefresh: () => void
}) {
  const [filter, setFilter] = useState<UsageKind | "all">("all")
  const available = data?.source === "ledger" && data.balanceCredits != null && data.allowanceCredits != null
  const allowance = available ? data.allowanceCredits ?? 0 : 0
  const remaining = available ? data.balanceCredits ?? 0 : 0
  const spent = available ? data.spentCredits ?? 0 : 0
  const reserved = available ? data.reservedCredits ?? 0 : 0
  const usedPercent = allowance > 0 ? Math.min(100, (spent + reserved) / allowance * 100) : 0
  const remainingPercent = allowance > 0 ? Math.max(0, Math.min(100, remaining / allowance * 100)) : 0
  const daily = data?.daily ?? []
  const visibleCategories = CATEGORIES.filter((category) => filter === "all" || category.kind === filter)
  const maxDay = Math.max(1, ...daily.map((day) => visibleCategories.reduce((sum, category) => sum + day[category.field], 0)))
  const chartTotal = (data?.categories ?? []).filter((category) => filter === "all" || category.kind === filter).reduce((sum, category) => sum + category.spentCredits, 0)
  const history = (data?.history ?? []).filter((row) => filter === "all" || row.kind === filter)

  return (
    <div className="space-y-7" aria-busy={loading}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-medium tracking-tight">Usage</h1>
          <p className="mt-1 text-[13px] text-[#929292]">One credit balance for models, cloud machines, and MCP apps.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="mt-1 inline-flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] px-3 text-[12px] text-[#b0b0b0] transition hover:bg-white/[0.05] disabled:opacity-50">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error || (!loading && data?.source === "unavailable") ? (
        <div role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-4 py-3 text-[13px] leading-6 text-amber-200">
          {error ?? data?.message ?? "Credit usage is temporarily unavailable. Refresh to try again."}
        </div>
      ) : null}

      <section aria-label="Monthly credit allowance" className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#181818]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">{data?.planTier === "spark" ? "Free" : data?.planName ?? "Your plan"}</span>
            {data?.isGrandfathered ? <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] text-[#a0a0a0]">Grandfathered</span> : null}
            <span className="text-[12px] text-[#808080]">Monthly allowance</span>
          </div>
          <span className="text-[12px] text-[#929292]">{data?.periodLabel ?? "Current month"}</span>
        </div>
        <div className="px-5 py-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] text-[#a0a0a0]">Available credits</p>
              <p className="mt-1 flex items-baseline gap-2 tabular-nums">
                <span className="text-[34px] font-medium tracking-tight">{available ? credits(remaining) : "—"}</span>
                <span className="text-[15px] text-[#808080]">{available ? `/ ${credits(allowance)}` : loading ? "Loading…" : "Unavailable"}</span>
              </p>
            </div>
            <p className="pb-1 text-[13px] text-[#a0a0a0]">{available ? `${credits(remainingPercent)}% remaining` : "Your shared monthly balance"}</p>
          </div>
          <div role="progressbar" aria-label="Monthly credits used or reserved" aria-valuenow={available ? Math.round(usedPercent) : undefined} aria-valuemin={0} aria-valuemax={100} className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/[0.07]">
            {CATEGORIES.map((category) => {
              const used = data?.categories.find((entry) => entry.kind === category.kind)?.spentCredits ?? 0
              return <span key={category.kind} className={category.color} style={{ width: `${allowance > 0 ? used / allowance * 100 : 0}%` }} />
            })}
            <span className="bg-amber-300/70" style={{ width: `${allowance > 0 ? reserved / allowance * 100 : 0}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-[12px] text-[#929292]">
            <span>{available ? `${credits(spent)} used · ${credits(reserved)} reserved` : "Usage will appear when the ledger is available"}</span>
            <span>{data?.resetAt ? `Resets ${new Date(data.resetAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}` : "Monthly reset · no rollover"}</span>
          </div>
        </div>
        <div className="border-t border-white/[0.06] bg-white/[0.015] px-5 py-3 text-[12px] leading-5 text-[#929292]">
          Models + machines + MCP apps share this allowance. BYOK exempts model inference only; hosted machines and apps still use credits.
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {CATEGORIES.map((category) => {
          const entry = data?.categories.find((item) => item.kind === category.kind)
          const Icon = category.icon
          return (
            <section key={category.kind} aria-label={`${category.label} credit usage`} className="rounded-xl border border-white/[0.08] bg-[#151515] px-4 py-4">
              <p className="flex items-center gap-2 text-[12px] text-[#a8a8a8]"><Icon className={cn("size-3.5", category.text)} />{category.label}</p>
              <p className="mt-3 text-[22px] font-medium tracking-tight tabular-nums">{available ? credits(entry?.spentCredits ?? 0) : "—"}<span className="ml-1.5 text-[12px] font-normal text-[#808080]">credits used</span></p>
              <p className="mt-1 text-[11px] text-[#808080]">{available ? `${credits(entry?.reservedCredits ?? 0)} reserved · ${(entry?.requests ?? 0).toLocaleString()} ${category.kind === "machines" ? "runs" : "calls"}` : "Awaiting usage data"}</p>
            </section>
          )
        })}
      </div>

      <section aria-label="Daily credit usage" className="rounded-xl border border-white/[0.08] bg-[#151515] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[20px] font-medium tabular-nums">{available ? credits(chartTotal) : "—"}<span className="ml-2 text-[12px] font-normal text-[#929292]">credits used</span></p>
            <p className="mt-1 text-[11px] text-[#808080]">{data ? `${dateLabel(data.periodStart)} – ${dateLabel(data.periodEnd)} · UTC · settled charges only` : "Current period · settled charges only"}</p>
          </div>
          <div role="group" aria-label="Filter usage category" className="flex flex-wrap gap-1 text-[11px]">
            {[{ kind: "all", label: "Total" }, ...CATEGORIES].map((category) => (
              <button key={category.kind} type="button" aria-pressed={filter === category.kind} onClick={() => setFilter(category.kind as UsageKind | "all")} className={cn("rounded-md px-2.5 py-1.5 transition", filter === category.kind ? "bg-white/[0.09] text-white" : "text-[#929292] hover:text-white")}>{category.label}</button>
            ))}
          </div>
        </div>
        <div className="relative mt-6 pl-11" role="img" aria-label={available ? `Daily settled usage: ${credits(chartTotal)} credits this period` : "Daily usage unavailable"}>
          <div className="absolute inset-y-0 left-0 flex w-9 flex-col justify-between pb-6 text-right text-[10px] text-[#737373]"><span>{credits(maxDay)}</span><span>{credits(maxDay / 2)}</span><span>0</span></div>
          <div className="absolute inset-x-11 top-0 h-36 border-y border-white/[0.05] bg-[linear-gradient(to_bottom,transparent_49.5%,rgba(255,255,255,0.04)_50%,transparent_50.5%)]" />
          <div className="relative flex h-36 items-end gap-1 sm:gap-2">
            {daily.map((day) => {
              const total = visibleCategories.reduce((sum, category) => sum + day[category.field], 0)
              return (
                <div key={day.date} className="flex h-full min-w-0 flex-1 items-end" title={`${dateLabel(`${day.date}T00:00:00Z`)}: ${credits(total)} credits`}>
                  <div className={cn("flex w-full flex-col-reverse overflow-hidden rounded-t-sm", total === 0 && "bg-white/[0.06]")} style={{ height: total > 0 ? `${Math.max(1, total / maxDay * 100)}%` : "2px" }}>
                    {visibleCategories.map((category) => <span key={category.kind} className={cn("w-full", category.color)} style={{ height: `${total > 0 ? day[category.field] / total * 100 : 0}%` }} />)}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-[#737373]">{[daily[0], daily.length > 2 ? daily[Math.floor(daily.length / 2)] : undefined, daily.length > 1 ? daily[daily.length - 1] : undefined].filter(Boolean).map((day) => <span key={day!.date}>{dateLabel(`${day!.date}T00:00:00Z`)}</span>)}</div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-[#a0a0a0]">{CATEGORIES.map((category) => <span key={category.kind} className="inline-flex items-center gap-2"><span className={cn("size-2 rounded-sm", category.color)} />{category.label}</span>)}</div>
        {available && chartTotal === 0 ? <p className="mt-4 text-[12px] text-[#929292]">No settled {filter === "all" ? "credit" : CATEGORIES.find((category) => category.kind === filter)?.label.toLowerCase()} usage this period.</p> : null}
      </section>

      <section aria-label="Credit usage history">
        <div className="mb-3 flex items-center justify-between gap-4"><h2 className="text-[14px] font-medium">History</h2><span className="text-[11px] text-[#808080]">Latest 50 charges · your account</span></div>
        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#151515]">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead className="border-b border-white/[0.06] text-[11px] text-[#808080]"><tr><th className="px-4 py-3 font-normal">Usage</th><th className="px-4 py-3 font-normal">Time</th><th className="px-4 py-3 font-normal">Status</th><th className="px-4 py-3 text-right font-normal">Credits</th></tr></thead>
            <tbody>
              {history.map((row) => {
                const category = CATEGORIES.find((entry) => entry.kind === row.kind)!
                const Icon = row.status === "reserved" ? Clock3 : ArrowDownLeft
                return <tr key={row.id} className="border-b border-white/[0.04] last:border-0"><td className="max-w-[300px] px-4 py-3"><p className="truncate text-[#d8d8d8]" title={row.label}>{row.label}</p><p className={cn("mt-0.5 text-[10px]", category.text)}>{category.label}</p></td><td className="whitespace-nowrap px-4 py-3 text-[#929292]">{new Date(row.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td><td className="px-4 py-3"><span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px]", row.status === "reserved" ? "bg-amber-300/[0.08] text-amber-200" : "bg-white/[0.04] text-[#a8a8a8]")}><Icon className="size-3" />{row.status === "reserved" ? "Reserved" : "Used"}</span></td><td className="px-4 py-3 text-right tabular-nums text-[#d8d8d8]">{credits(row.credits)}</td></tr>
              })}
              {history.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-[12px] text-[#929292]">{loading ? "Loading usage…" : !available ? "Usage history is unavailable." : "No charges recorded for this period."}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-[#808080]">Reserved credits are held before work starts. Unused credits are returned after settlement; interrupted work with unknown usage may retain its full reservation.</p>
      </section>
    </div>
  )
}
