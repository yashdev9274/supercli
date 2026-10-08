"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  ArrowLeft,
  Copy,
  CreditCard,
  ExternalLink,
  Search,
  Settings2,
  UserRound,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { requestJson } from "@/modules/nova-web/api"
import { AccountMenu } from "@/modules/nova-web/components/account-menu"
import type { SettingsActivity, SettingsUsage } from "@/modules/nova/settings/service"
import type { SettingsSectionId } from "@/modules/nova-web/settings-sections"
import type { NovaUser } from "@/modules/nova-web/types"

export type { SettingsSectionId } from "@/modules/nova-web/settings-sections"
export { normalizeSettingsSection, SETTINGS_SECTIONS } from "@/modules/nova-web/settings-sections"

const SECTION_META: Array<{
  id: SettingsSectionId
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "usage", label: "Usage", icon: CreditCard },
]

const PREFS_KEY = "nova:settings:general"

type GeneralPrefs = {
  openLinksInDesktop: boolean
  enterBehavior: "interrupt" | "queue" | "newline"
  cmdEnterBehavior: "queue" | "interrupt" | "steer"
  altEnterBehavior: "steer" | "queue" | "interrupt"
}

const DEFAULT_PREFS: GeneralPrefs = {
  openLinksInDesktop: false,
  enterBehavior: "interrupt",
  cmdEnterBehavior: "queue",
  altEnterBehavior: "steer",
}

function readPrefs(): GeneralPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) as Partial<GeneralPrefs> }
  } catch {
    return DEFAULT_PREFS
  }
}

function writePrefs(prefs: GeneralPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

export function SettingsView({
  user,
  section,
  onSectionChange,
  onBack,
  onNavigate,
}: {
  user: NovaUser
  section: SettingsSectionId
  onSectionChange: (section: SettingsSectionId) => void
  onBack: () => void
  onNavigate: (href: string) => void
}) {
  const [query, setQuery] = useState("")
  const [prefs, setPrefs] = useState<GeneralPrefs>(DEFAULT_PREFS)
  const [copied, setCopied] = useState<string | null>(null)
  const [activity, setActivity] = useState<SettingsActivity | null>(null)
  const [activityRange, setActivityRange] = useState<7 | 30 | 90>(30)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [usage, setUsage] = useState<SettingsUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setPrefs(readPrefs())
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (section !== "activity") return
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setActivityLoading(true)
      setActivityError(null)
      try {
        const payload = await requestJson<SettingsActivity>(
          `/api/nova/settings/activity?range=${activityRange}`,
        )
        if (!cancelled) setActivity(payload)
      } catch (error) {
        if (!cancelled) {
          setActivityError(error instanceof Error ? error.message : "Could not load activity")
        }
      } finally {
        if (!cancelled) setActivityLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activityRange, section])

  useEffect(() => {
    if (section !== "usage") return
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setUsageLoading(true)
      setUsageError(null)
      try {
        const payload = await requestJson<SettingsUsage>("/api/nova/settings/usage")
        if (!cancelled) setUsage(payload)
      } catch (error) {
        if (!cancelled) {
          setUsageError(error instanceof Error ? error.message : "Could not load usage")
        }
      } finally {
        if (!cancelled) setUsageLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [section])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SECTION_META
    return SECTION_META.filter((item) => item.label.toLowerCase().includes(q))
  }, [query])

  function updatePrefs(patch: Partial<GeneralPrefs>) {
    setPrefs((current) => {
      const next = { ...current, ...patch }
      writePrefs(next)
      return next
    })
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(null), 1_500)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-[#0a0a0a] text-[#e8e8e8]">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0c0c]">
        <div className="flex h-11 items-center gap-2 border-b border-white/[0.05] px-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-[#8a8a8a] transition hover:bg-white/[0.04] hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            Settings
          </button>
        </div>
        <div className="px-2 py-2">
          <div className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.06] bg-[#141414] px-2.5">
            <Search className="size-3.5 text-[#4a4a4a]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settings"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[#e8e8e8] outline-none placeholder:text-[#4a4a4a]"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
          {filtered.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition",
                  section === item.id
                    ? "bg-white/[0.08] text-white"
                    : "text-[#a0a0a0] hover:bg-white/[0.04] hover:text-[#e8e8e8]",
                )}
              >
                <Icon className="size-3.5 opacity-80" />
                {item.label}
              </button>
            )
          })}
        </div>
        <div className="border-t border-white/[0.05] p-2">
          <AccountMenu user={user} onNavigate={onNavigate} />
        </div>
      </aside>

      <section className="min-h-0 flex-1 overflow-y-auto bg-[#0f0f0f]">
        <div className="mx-auto max-w-[760px] px-8 py-10">
          {section === "general" ? (
            <GeneralSection prefs={prefs} onChange={updatePrefs} />
          ) : null}
          {section === "profile" ? (
            <ProfileSection user={user} copied={copied} onCopy={copyText} />
          ) : null}
          {section === "activity" ? (
            <ActivitySection
              range={activityRange}
              onRangeChange={setActivityRange}
              loading={activityLoading}
              error={activityError}
              data={activity}
              onOpenThread={(id) => onNavigate(`/s/${id}`)}
            />
          ) : null}
          {section === "usage" ? (
            <UsageSection loading={usageLoading} error={usageError} data={usage} />
          ) : null}
        </div>
      </section>
    </div>
  )
}

function GeneralSection({
  prefs,
  onChange,
}: {
  prefs: GeneralPrefs
  onChange: (patch: Partial<GeneralPrefs>) => void
}) {
  return (
    <>
      <h1 className="text-[28px] font-medium tracking-tight">General</h1>

      <h2 className="mt-10 text-[13px] font-medium text-[#a0a0a0]">Interface</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
        <Row
          title="Sidebar"
          description="Choose which items appear in the sidebar and their order"
          action={
            <span className="text-[12px] text-[#8a8a8a]">Customize</span>
          }
        />
        <Row
          title="Open links in desktop app"
          description="Open Nova links in the installed desktop app when available"
          action={
            <Toggle
              checked={prefs.openLinksInDesktop}
              onChange={(value) => onChange({ openLinksInDesktop: value })}
            />
          }
        />
      </div>

      <h2 className="mt-10 text-[13px] font-medium text-[#a0a0a0]">Input</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
        <Row
          title="Enter behavior"
          description="What pressing Enter does mid-run; Newline keeps ⌘/Ctrl+Enter and ⌥/Alt+Enter sends"
          action={
            <Select
              value={prefs.enterBehavior}
              onChange={(value) => onChange({ enterBehavior: value as GeneralPrefs["enterBehavior"] })}
              options={[
                { value: "interrupt", label: "Interrupt" },
                { value: "queue", label: "Queue" },
                { value: "newline", label: "Newline" },
              ]}
            />
          }
        />
        <Row
          title="⌘/Ctrl+Enter behavior"
          description="What pressing ⌘/Ctrl+Enter does mid-run"
          action={
            <Select
              value={prefs.cmdEnterBehavior}
              onChange={(value) => onChange({ cmdEnterBehavior: value as GeneralPrefs["cmdEnterBehavior"] })}
              options={[
                { value: "queue", label: "Queue" },
                { value: "interrupt", label: "Interrupt" },
                { value: "steer", label: "Steer" },
              ]}
            />
          }
        />
        <Row
          title="⌥/Alt+Enter behavior"
          description="What pressing ⌥/Alt+Enter does mid-run"
          action={
            <Select
              value={prefs.altEnterBehavior}
              onChange={(value) => onChange({ altEnterBehavior: value as GeneralPrefs["altEnterBehavior"] })}
              options={[
                { value: "steer", label: "Steer" },
                { value: "queue", label: "Queue" },
                { value: "interrupt", label: "Interrupt" },
              ]}
            />
          }
        />
      </div>
    </>
  )
}

function ProfileSection({
  user,
  copied,
  onCopy,
}: {
  user: NovaUser
  copied: string | null
  onCopy: (label: string, value: string) => void
}) {
  return (
    <>
      <h1 className="text-[28px] font-medium tracking-tight">Profile</h1>
      <div className="mt-8 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
        <Row
          title="Profile picture"
          description="Shown across your account"
          action={
            user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="size-8 rounded-lg object-cover" />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#2dd4bf]/15 text-[12px] font-semibold text-[#2dd4bf]">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
            )
          }
        />
        <Row
          title="Name"
          description="Shown to teammates"
          action={
            <span className="rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3 py-1.5 text-[13px] text-[#e4e4e4]">
              {user.name}
            </span>
          }
        />
        <Row
          title="Email"
          description="Signed-in account"
          action={
            <button
              type="button"
              onClick={() => onCopy("email", user.email)}
              className="inline-flex items-center gap-1.5 text-[13px] text-[#a0a0a0] transition hover:text-white"
            >
              {user.email}
              <ExternalLink className="size-3 opacity-60" />
            </button>
          }
        />
        <Row
          title="User ID"
          description="For support and API requests"
          action={
            <button
              type="button"
              onClick={() => onCopy("id", user.id)}
              className="inline-flex items-center gap-1.5 font-mono text-[12px] text-[#8a8a8a] transition hover:text-white"
            >
              {user.id}
              <Copy className="size-3 opacity-70" />
              {copied === "id" ? <span className="text-[11px] text-[#2dd4bf]">Copied</span> : null}
            </button>
          }
        />
      </div>

      <h2 className="mt-10 text-[13px] font-medium text-[#a0a0a0]">Danger zone</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
        <Row
          title="Delete account"
          description="Permanently revoke your access to Nova"
          action={
            <span className="text-[13px] text-[#f87171]">Contact support</span>
          }
        />
      </div>
    </>
  )
}

function ActivitySection({
  range,
  onRangeChange,
  loading,
  error,
  data,
  onOpenThread,
}: {
  range: 7 | 30 | 90
  onRangeChange: (range: 7 | 30 | 90) => void
  loading: boolean
  error: string | null
  data: SettingsActivity | null
  onOpenThread: (id: string) => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium tracking-tight">Activity</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">What Nova got done in your workspace</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#141414] p-1">
          {([7, 30, 90] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRangeChange(value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] transition",
                range === value
                  ? "bg-white/[0.08] text-white"
                  : "text-[#8a8a8a] hover:text-white",
              )}
            >
              {value}d
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-[13px] text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Threads started"
          value={loading && !data ? "—" : String(data?.sessions ?? 0)}
          delta={deltaLabel(data?.sessions ?? 0, data?.sessionsPrevious ?? 0)}
        />
        <MetricCard
          label="Runs completed"
          value={loading && !data ? "—" : String(data?.completedRuns ?? 0)}
          delta={deltaLabel(data?.completedRuns ?? 0, data?.completedRunsPrevious ?? 0)}
        />
        <MetricCard
          label="Approvals"
          value={loading && !data ? "—" : String(data?.approvals ?? 0)}
          delta={data ? `${data.failedRuns} failed runs` : "—"}
        />
        <MetricCard
          label="Agent hours"
          value={loading && !data ? "—" : `${data?.agentHours ?? 0}h`}
          delta={deltaLabel(data?.agentHours ?? 0, data?.agentHoursPrevious ?? 0)}
        />
      </div>

      <h2 className="mt-10 text-[13px] font-medium text-[#a0a0a0]">Contribution</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414] p-4">
        <Heatmap days={data?.heatmap ?? []} />
        <div className="mt-3 flex items-center justify-between text-[11px] text-[#5c5c5c]">
          <span>
            {(data?.heatmap.reduce((sum, day) => sum + day.count, 0) ?? 0)} touches in the last 52 weeks
          </span>
          <span className="flex items-center gap-1">
            Less
            {[0, 1, 2, 3, 4].map((level) => (
              <span key={level} className={cn("size-2.5 rounded-[2px]", heatColor(level as 0 | 1 | 2 | 3 | 4))} />
            ))}
            More
          </span>
        </div>
      </div>

      <h2 className="mt-10 text-[13px] font-medium text-[#a0a0a0]">Recent threads</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
        {(data?.recent ?? []).length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#6b6b6b]">
            {loading ? "Loading activity…" : "No threads yet. Start one from the home composer."}
          </p>
        ) : (
          data?.recent.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => onOpenThread(thread.id)}
              className="flex w-full items-center gap-3 border-b border-white/[0.06] px-4 py-3.5 text-left last:border-b-0 hover:bg-white/[0.03]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[#e4e4e4]">{thread.objective}</p>
                <p className="mt-0.5 text-[12px] text-[#6b6b6b]">
                  {thread.status} · {thread.runCount} runs · {new Date(thread.updatedAt).toLocaleString()}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  )
}

function UsageSection({
  loading,
  error,
  data,
}: {
  loading: boolean
  error: string | null
  data: SettingsUsage | null
}) {
  const maxBar = Math.max(1, ...(data?.daily.map((day) => day.spendUsd || day.requests) ?? [1]))

  return (
    <>
      <div>
        <h1 className="text-[28px] font-medium tracking-tight">Usage</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">Spend across models and Nova turns</p>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-[13px] text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
          <div>
            <p className="text-[13px] text-[#e4e4e4]">Current month</p>
            <p className="mt-0.5 text-[12px] text-[#6b6b6b]">{data?.periodLabel ?? "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-[13px] text-[#e4e4e4]">
              {data?.balanceUsd != null ? `$${data.balanceUsd.toFixed(2)} balance` : data?.planName ?? "Harness plan"}
            </p>
            <p className="mt-0.5 text-[12px] text-[#6b6b6b]">
              {data?.requestLimit != null
                ? `${data.requestsUsed ?? 0} / ${data.requestLimit} requests`
                : `${data?.totalRequests ?? 0} turns`}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414] p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[22px] font-medium tracking-tight">
            {data?.source === "harness"
              ? `$${(data.totalSpendUsd ?? 0).toFixed(2)}`
              : String(data?.totalRequests ?? (loading ? "—" : 0))}
            <span className="ml-2 text-[13px] font-normal text-[#6b6b6b]">
              {data?.source === "harness" ? "total spend" : "total turns"}
              {data ? `, ${new Date(data.periodStart).toLocaleDateString()} – ${new Date(data.periodEnd).toLocaleDateString()}` : ""}
            </span>
          </p>
        </div>

        <div className="mt-6 flex h-40 items-end gap-1.5">
          {(data?.daily ?? Array.from({ length: 7 }, (_, index) => ({
            date: `d${index}`,
            spendUsd: 0,
            tokens: 0,
            requests: 0,
          }))).map((day) => {
            const value = data?.source === "harness" ? day.spendUsd : day.requests
            const height = Math.max(4, Math.round((value / maxBar) * 100))
            return (
              <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div
                  className={cn(
                    "w-full rounded-sm",
                    value > 0 ? "bg-[#2dd4bf]" : "bg-white/[0.04]",
                  )}
                  style={{ height: `${height}%` }}
                  title={`${day.date}: ${data?.source === "harness" ? `$${day.spendUsd.toFixed(2)}` : `${day.requests} turns`}`}
                />
              </div>
            )
          })}
        </div>
        {data?.message ? (
          <p className="mt-4 text-[12px] leading-5 text-[#6b6b6b]">{data.message}</p>
        ) : null}
      </div>

      <h2 className="mt-10 text-[13px] font-medium text-[#a0a0a0]">Breakdown</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr] gap-2 border-b border-white/[0.06] px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-[#5c5c5c]">
          <span>Item</span>
          <span className="text-right">Spend</span>
          <span className="text-right">Tokens</span>
          <span className="text-right">Share</span>
        </div>
        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr] gap-2 border-b border-white/[0.06] px-4 py-3 text-[13px]">
          <span className="text-[#e4e4e4]">Billed</span>
          <span className="text-right text-[#c8c8c8]">
            {data?.source === "harness" ? `$${(data.totalSpendUsd ?? 0).toFixed(2)}` : "—"}
          </span>
          <span className="text-right text-[#c8c8c8]">
            {formatTokens(data?.totalTokens ?? 0)}
          </span>
          <span className="text-right text-[#c8c8c8]">100%</span>
        </div>
        {(data?.models ?? []).length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-[#6b6b6b]">
            {loading ? "Loading usage…" : "No model spend recorded this period."}
          </p>
        ) : (
          data?.models.map((model) => (
            <div
              key={`${model.provider}:${model.model}`}
              className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr] gap-2 border-b border-white/[0.06] px-4 py-3 text-[13px] last:border-b-0"
            >
              <span className="truncate text-[#e4e4e4]">{model.model}</span>
              <span className="text-right text-[#c8c8c8]">${model.spendUsd.toFixed(2)}</span>
              <span className="text-right text-[#c8c8c8]">{formatTokens(model.tokens)}</span>
              <span className="text-right text-[#c8c8c8]">{Math.round(model.share * 1000) / 10}%</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}

function Heatmap({ days }: { days: SettingsActivity["heatmap"] }) {
  const weeks: SettingsActivity["heatmap"][] = []
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7))
  }
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="flex flex-col gap-1">
          {week.map((day) => (
            <span
              key={day.date}
              title={`${day.date}: ${day.count}`}
              className={cn("size-2.5 rounded-[2px]", heatColor(day.level))}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function heatColor(level: 0 | 1 | 2 | 3 | 4) {
  switch (level) {
    case 1: return "bg-[#0f3f3a]"
    case 2: return "bg-[#176f64]"
    case 3: return "bg-[#1f9b8a]"
    case 4: return "bg-[#2dd4bf]"
    default: return "bg-white/[0.04]"
  }
}

function MetricCard({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#141414] px-4 py-3.5">
      <p className="text-[12px] text-[#6b6b6b]">{label}</p>
      <p className="mt-2 text-[22px] font-medium tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-[#5c5c5c]">{delta}</p>
    </div>
  )
}

function deltaLabel(current: number, previous: number) {
  const diff = current - previous
  if (diff === 0) return "0 vs last period"
  return `${diff > 0 ? "+" : ""}${diff} vs last period`
}

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function Row({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-4 py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-[#e4e4e4]">{title}</p>
        <p className="mt-0.5 text-[12px] leading-5 text-[#6b6b6b]">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 rounded-full transition",
        checked ? "bg-[#2dd4bf]" : "bg-[#333]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white shadow transition",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-2.5 py-1.5 text-[12px] text-[#c8c8c8] outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
