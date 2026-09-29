"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { motion, useReducedMotion } from "framer-motion"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Ellipsis,
  ExternalLink,
  Users,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UsageAnalyticsSkeleton } from "@/components/dashboard/usage/usage-analytics-skeleton"
import {
  getBillingAnalytics,
  type BillingRange,
} from "@/modules/billing/actions"

const RANGE_LABELS: Record<BillingRange, string> = {
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function FilterButton({
  icon: Icon,
  children,
}: {
  icon: typeof Users
  children: React.ReactNode
}) {
  return (
    <button className="flex h-9 min-w-36 items-center justify-between gap-3 border border-border bg-card px-3 text-xs text-foreground/80 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{children}</span>
      </span>
      <ChevronDown className="size-3 text-muted-foreground" />
    </button>
  )
}

export function BillingDashboard() {
  const [range, setRange] = useState<BillingRange>("30d")
  const [selectedDeveloper, setSelectedDeveloper] = useState<{
    id: string
    login: string
  } | null>(null)
  const reduceMotion = useReducedMotion()
  const { data, isLoading, isError } = useQuery({
    queryKey: ["billing-analytics", range],
    queryFn: () => getBillingAnalytics(range),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return <UsageAnalyticsSkeleton />
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-background p-8">
        <div className="border border-destructive/30 bg-destructive/5 px-6 py-5 text-sm text-destructive">
          Billing analytics could not be loaded.
        </div>
      </div>
    )
  }

  const renewsAt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(data.period.renewsAt))

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-full bg-background px-4 py-7 md:px-8 lg:px-10"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Review credit usage renews monthly in UTC.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <FilterButton icon={Users}>{data.scopeName}</FilterButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>{data.scopeName}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <FilterButton icon={CreditCard}>Credits</FilterButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Credits</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <FilterButton icon={CalendarDays}>{RANGE_LABELS[range]}</FilterButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(RANGE_LABELS) as BillingRange[]).map((option) => (
                  <DropdownMenuItem key={option} onClick={() => setRange(option)}>
                    {RANGE_LABELS[option]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mb-5 grid gap-px border border-border bg-border sm:grid-cols-3">
          {[
            ["Credits used", data.period.used],
            ["Credits remaining", data.period.remaining],
            ["Monthly allowance", data.period.allocation],
          ].map(([label, value], index) => (
            <motion.div
              key={String(label)}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className="bg-card px-5 py-4"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 font-mono text-2xl font-medium tabular-nums">{value}</p>
            </motion.div>
          ))}
        </div>

        {data.period.remaining === 0 ? (
          <div className="mb-5 border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
            Monthly credits are exhausted. Reviews resume when credits renew on {renewsAt} UTC.
          </div>
        ) : null}

        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="border border-border bg-card"
        >
          <div className="flex items-center gap-3 border-b border-border px-6 py-5">
            <BarChart3 className="size-4 text-muted-foreground" />
            <h2 className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Daily credit usage
            </h2>
            <span className="ml-auto text-[10px] text-muted-foreground">
              Renews {renewsAt} UTC
            </span>
          </div>

          <div className="h-[300px] px-3 pb-3 pt-6 md:h-[350px] md:px-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dailyUsage} margin={{ top: 5, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.65} />
                <XAxis
                  dataKey="label"
                  interval={range === "90d" ? 9 : range === "30d" ? 2 : 0}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.25 }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${value} credits`, "Usage"]}
                />
                <Bar
                  dataKey="credits"
                  fill="#36e3a2"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive={!reduceMotion}
                  animationDuration={700}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* <div className="border-t border-border px-6 py-4">
            <div className="mb-3 grid grid-cols-[1fr_72px_72px] gap-3 text-right text-[10px] text-muted-foreground">
              <span />
              <span>Reviews</span>
              <span>Credits</span>
            </div>
            <div className="space-y-4">
              {data.categories.map((category) => (
                <div key={category.name} className="grid grid-cols-[1fr_72px_72px] items-center gap-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="size-2.5" style={{ backgroundColor: category.color }} />
                    <span className="text-foreground/85">{category.name}</span>
                    <span
                      className="ml-4 h-px w-20 opacity-80"
                      style={{ backgroundColor: category.color }}
                    />
                  </div>
                  <span className="text-right font-mono tabular-nums">{category.reviews}</span>
                  <span className="text-right font-mono tabular-nums">{category.credits}</span>
                </div>
              ))}
            </div>
          </div> */}
        </motion.section>

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold">Developer Usage</h2>
              <p className="mt-1 text-xs text-muted-foreground">Credits used in the selected range.</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-border">
            <div className="min-w-[620px]">
              <div className="grid grid-cols-[1fr_180px_72px] border-b border-border bg-muted/30 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                <span className="px-4 py-3">Developer</span>
                <span className="border-l border-border px-4 py-3">Credits used</span>
                <span className="border-l border-border px-4 py-3">Action</span>
              </div>
              {data.developers.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No developer usage in this range.
                </div>
              ) : (
                data.developers.map((developer, index) => (
                  <motion.div
                    key={developer.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + index * 0.04 }}
                    className="grid grid-cols-[1fr_180px_72px] items-center border-b border-border bg-card last:border-b-0"
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Avatar className="size-7 rounded-none border border-border">
                        {developer.avatarUrl ? (
                          <AvatarImage src={developer.avatarUrl} alt={developer.login} />
                        ) : null}
                        <AvatarFallback className="rounded-none text-[10px]">
                          {initials(developer.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm">{developer.login}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {developer.reviews} reviews
                        </p>
                      </div>
                    </div>
                    <span className="border-l border-border px-4 py-5 font-mono text-sm tabular-nums">
                      {developer.credits}
                    </span>
                    <div className="flex justify-center border-l border-border px-4 py-3">
                      <button
                        type="button"
                        aria-label={`Actions for ${developer.login}`}
                        onClick={() =>
                          setSelectedDeveloper({
                            id: developer.id,
                            login: developer.login,
                          })
                        }
                        className="flex size-8 items-center justify-center text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Ellipsis className="size-4" />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <AlertDialog
        open={selectedDeveloper !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDeveloper(null)
        }}
      >
        <AlertDialogContent className="max-w-md gap-0 rounded-none border-border bg-[#111111] p-0 shadow-2xl">
          <AlertDialogHeader className="gap-3 px-5 pb-4 pt-5 text-left">
            <AlertDialogTitle className="text-lg font-semibold tracking-tight">
              Stop reviewing {selectedDeveloper?.login}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-5 text-muted-foreground">
              Supercode will stop reviewing pull requests opened by {selectedDeveloper?.login}.
              They won&apos;t receive future reviews, and you won&apos;t be billed for their reviews
              next month unless you undo this filter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-4 border-t border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Manage filters
              <ExternalLink className="size-3" />
            </Link>
            <AlertDialogFooter className="gap-2 sm:justify-end">
              <AlertDialogCancel className="rounded-none border-border bg-muted/40">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="rounded-none bg-red-600 text-white hover:bg-red-500"
                onClick={() => setSelectedDeveloper(null)}
              >
                Stop reviews
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
