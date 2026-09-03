"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  ArrowUpRight,
  Loader2,
  Sparkles,
  Shield,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Zap,
} from "lucide-react"

type Plan = {
  id: string
  tier: string
  name: string
  description: string | null
  variant: string | null
  interval: string | null
  priceCents: number
  currency: string
  requestLimit: number
  contextLimit: number
  modelAccess: string
  creditAmountCents: number
  dodoProductId: string | null
  sortOrder: number
}

type SubscriptionInfo = {
  id: string
  status: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
  isGrandfathered: boolean
}

type CreditBalance = {
  balanceCents: number
  totalCredits: number
  resetAt: string | null
}

const TIER_COLORS: Record<string, string> = {
  spark: "text-emerald-400 border-emerald-500/30",
  "spark-premium": "text-cyan-400 border-cyan-500/30",
  pro: "text-amber-400 border-amber-500/30",
  ultra: "text-purple-400 border-purple-500/30",
}

const TIER_BG: Record<string, string> = {
  spark: "bg-emerald-500/[0.03]",
  "spark-premium": "bg-cyan-500/[0.03]",
  pro: "bg-amber-500/[0.04]",
  ultra: "bg-purple-500/[0.03]",
}

function BackgroundGlow() {
  return (
    <>
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,146,60,0.06)_0%,transparent_60%)]" />
      <div className="fixed inset-0 bg-[linear-gradient(rgba(245,158,11,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black_30%,transparent_100%)] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)] pointer-events-none" />
    </>
  )
}

function getFeatures(tier: string) {
  if (tier === "spark") return [
    { label: "Open models only", included: true },
    { label: "16K context window", included: true },
    { label: "~10K requests/month", included: true },
    { label: "Standard token limits", included: true },
    { label: "$5 monthly credits + deals", included: true },
    { label: "Memory (cross-session)", included: false },
    { label: "Merge.dev Agent Handler", included: false },
    { label: "Priority access", included: false },
  ]
  if (tier === "spark-premium") return [
    { label: "Open models only", included: true },
    { label: "32K context window", included: true },
    { label: "~15K requests/month (resets)", included: true },
    { label: "Standard token limits", included: true },
    { label: "$10 monthly credits + deals", included: true },
    { label: "Memory (cross-session)", included: false },
    { label: "Merge.dev Agent Handler", included: false },
    { label: "Priority access", included: false },
  ]
  if (tier === "pro") return [
    { label: "Open-source + premium models", included: true },
    { label: "128K context window", included: true },
    { label: "~25K requests/month", included: true },
    { label: "Higher token limits", included: true },
    { label: "Usage analytics", included: true },
    { label: "Memory (cross-session)", included: true },
    { label: "Merge.dev Agent Handler", included: true },
    { label: "Priority access", included: true },
  ]
  return [
    { label: "All models (unrestricted)", included: true },
    { label: "1M context window", included: true },
    { label: "~110K requests/month", included: true },
    { label: "Maximum token limits", included: true },
    { label: "Highest rate limits", included: true },
    { label: "Usage analytics", included: true },
    { label: "Priority support", included: true },
    { label: "99.9% availability SLA", included: true },
  ]
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2">
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-[12px] font-mono text-zinc-300">{value}</div>
    </div>
  )
}

function PlanLimitBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-cyan-500"
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-zinc-500 font-mono">Requests used</span>
        <span className="text-[11px] font-mono text-zinc-400">
          {used.toLocaleString()} / {limit.toLocaleString()} ({pct}%)
        </span>
      </div>
      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function CreditMeter({ balance }: { balance: CreditBalance }) {
  const pct = Math.min(100, Math.round((balance.balanceCents / Math.max(balance.totalCredits, 1)) * 100))
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-zinc-500 font-mono">Credits remaining</span>
        <span className="text-[11px] font-mono text-zinc-400">
          ${(balance.balanceCents / 100).toFixed(2)} / ${(balance.totalCredits / 100).toFixed(2)} ({pct}%)
        </span>
      </div>
      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-cyan-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function formatPrice(plan: Plan): string {
  if (plan.currency === "INR") {
    return `₹${(plan.priceCents / 100).toLocaleString("en-IN")}`
  }
  return `$${(plan.priceCents / 100).toFixed(0)}`
}

/** Resolve the regional variant (India vs international) from the browser locale. */
function detectVariant(): "in" | "int" {
  if (typeof navigator === "undefined") return "int"
  const region = navigator.language?.split("-")[1]?.toUpperCase()
  return region === "IN" ? "in" : "int"
}

function getNextBillingDate(interval: string | null): string {
  const d = new Date()
  if (interval === "year") {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

function StudioPage() {
  const { data: session, isPending: sessionLoading } = authClient.useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null)
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [requestsUsed, setRequestsUsed] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [confirmingPlan, setConfirmingPlan] = useState<Plan | null>(null)

  const userId = session?.user?.id

  useEffect(() => {
    if (!sessionLoading && !session?.session) {
      router.replace(`/sign-in?redirect=${encodeURIComponent("/studio")}`)
    }
  }, [session, sessionLoading, router])

  // Surface success/cancelled from the Dodo return/cancel URL
  useEffect(() => {
    if (searchParams.get("success")) toast.success("Checkout complete — welcome aboard!")
    if (searchParams.get("cancelled")) toast.info("Checkout cancelled")
  }, [searchParams, toast])

  // Auto-scroll to / highlight the plan requested via ?plan= (from /pricing)
  useEffect(() => {
    const requested = searchParams.get("plan")
    if (!requested) return
    if (!loading && plans.length > 0) {
      const target = document.getElementById(`plan-card-${requested}`)
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" })
        target.classList.add("ring-2", "ring-amber-500/60")
        setTimeout(() => target.classList.remove("ring-2", "ring-amber-500/60"), 2500)
      }
    }
  }, [searchParams, plans, loading])

  const fetchData = useCallback(async () => {
    if (!userId) return
    try {
      setError(null)
      const variant = detectVariant()
      const [plansRes, statusRes] = await Promise.all([
        fetch(`/api/billing/plans?isGrandfathered=true&variant=${variant}`),
        fetch(`/api/billing/status?userId=${encodeURIComponent(userId)}`),
      ])
      if (!plansRes.ok) throw new Error(`Plans API: ${plansRes.status}`)
      if (!statusRes.ok) throw new Error(`Status API: ${statusRes.status}`)
      const plansData = await plansRes.json()
      const statusData = await statusRes.json()
      setPlans(plansData.plans ?? [])
      setSubscription(statusData.subscription ?? null)
      setCurrentPlan(statusData.plan ?? null)
      setCreditBalance(statusData.creditBalance ?? null)
      setRequestsUsed(statusData.requestsUsed ?? 0)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (userId) fetchData()
  }, [userId, fetchData])

  const currentTier = currentPlan?.tier ?? "spark"
  const isGrandfathered = subscription?.isGrandfathered ?? false

  const handleConfirmPayNow = useCallback(async () => {
    if (!confirmingPlan || !userId) return
    if (!confirmingPlan.dodoProductId) {
      setConfirmingPlan(null)
      toast.error("Checkout URL not available for this plan")
      return
    }
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, planId: confirmingPlan.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.checkout_url) {
        throw new Error(data.error ?? "Failed to create checkout session")
      }
      window.location.href = data.checkout_url as string
    } catch (err) {
      setConfirmingPlan(null)
      toast.error(err instanceof Error ? err.message : "Checkout failed")
    }
  }, [confirmingPlan, userId])

  const handleCancel = useCallback(async () => {
    if (!userId) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/billing/status?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel subscription")
      toast.success(data.message ?? "Subscription cancelled")
      setCancelOpen(false)
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed")
    } finally {
      setCancelling(false)
    }
  }, [userId, fetchData])

  const handleRefund = useCallback(async () => {
    if (!userId) return
    setRefunding(true)
    try {
      const res = await fetch("/api/billing/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? data.message ?? "Refund request failed")
      toast.success(data.message ?? "Refund initiated")
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed")
    } finally {
      setRefunding(false)
    }
  }, [userId, fetchData])

  const handlePortal = useCallback(async () => {
    if (!userId) return
    try {
      const res = await fetch("/api/billing/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "portal" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to get portal link")
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open portal")
    }
  }, [userId])

  if (sessionLoading || (!session?.session && !loading)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <Spinner className="size-8 text-amber-500" />
      </div>
    )
  }

  const upgradePlans = plans.filter(
    (p) => p.tier !== currentTier && p.tier !== "spark",
  )
  const sparkPremiumPlan = plans.find((p) => p.tier === "spark-premium")

  return (
    <div className="relative min-h-screen bg-zinc-950 overflow-hidden">
      <BackgroundGlow />

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <span className="font-mono text-[10px] tracking-[0.25em] text-amber-500/40 uppercase">
              Billing Studio
            </span>
            <h1 className="text-2xl font-semibold text-zinc-100 mt-1 tracking-tight">
              Your Plan & Usage
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchData} className="text-zinc-500">
              <RefreshCw className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ArrowUpRight className="size-3.5" />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner className="size-6 text-amber-500" />
          </div>
        ) : error ? (
          <Card className="border-red-500/30 bg-red-500/[0.03]">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="size-5 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm text-red-300 font-medium">Failed to load billing data</p>
                  <p className="text-xs text-zinc-500 mt-0.5 font-mono">{error}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={fetchData} className="mt-4">
                <RefreshCw className="size-3 mr-1" /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Current plan card */}
            <Card className={`border ${TIER_COLORS[currentTier] || "border-zinc-800"} ${TIER_BG[currentTier] || "bg-zinc-900/40"} backdrop-blur-xl`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-semibold text-zinc-100">
                        {currentPlan?.name ?? "No active plan"}
                      </h2>
                      <Badge variant="outline" className="text-[10px] font-mono text-zinc-500 border-zinc-700">
                        {subscription?.status ?? "none"}
                      </Badge>
                      {isGrandfathered && (
                        <Badge variant="outline" className="text-[10px] font-mono text-emerald-500 border-emerald-500/30">
                          Grandfathered
                        </Badge>
                      )}
                    </div>
                    <p className="text-[13px] text-zinc-500">
                      {currentPlan?.description ?? "Subscribe to a plan to get started."}
                    </p>
                  </div>
                  {subscription && (
                    <Button variant="outline" size="sm" onClick={handlePortal} className="shrink-0">
                      <ExternalLink className="size-3 mr-1" />
                      Billing Portal
                    </Button>
                  )}
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
                  <StatBadge label="Requests" value={`~${(currentPlan?.requestLimit ?? 10000).toLocaleString()}/mo`} />
                  <StatBadge label="Context" value={`${(currentPlan?.contextLimit ?? 16384).toLocaleString()} tokens`} />
                  <StatBadge label="Model access" value={currentPlan?.modelAccess === "all" ? "All models" : currentPlan?.modelAccess === "premium" ? "Open + Premium" : "Open models"} />
                  <StatBadge label="Credits" value={currentPlan?.creditAmountCents ? `$${(currentPlan.creditAmountCents / 100).toFixed(0)}/mo` : "—"} />
                </div>

                {/* Request usage bar */}
                <PlanLimitBar used={requestsUsed} limit={currentPlan?.requestLimit ?? 10000} />

                {/* Credit balance */}
                {creditBalance && (
                  <div className="mt-4">
                    <CreditMeter balance={creditBalance} />
                    {creditBalance.resetAt && (
                      <p className="text-[10px] text-zinc-600 font-mono mt-1">
                        Resets {new Date(creditBalance.resetAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Features list */}
                <div className="mt-5 pt-4 border-t border-zinc-800">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-3 block">
                    Plan features
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {getFeatures(currentTier).map((f) => (
                      <div key={f.label} className="flex items-center gap-2 text-[12px]">
                        {f.included ? (
                          <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                        ) : (
                          <span className="size-3 text-zinc-700 shrink-0 text-center">—</span>
                        )}
                        <span className={f.included ? "text-zinc-300" : "text-zinc-600"}>{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cancel button */}
                {currentTier !== "spark" && (
                  <div className="mt-5 pt-4 border-t border-zinc-800">
                    <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                          Cancel Subscription
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Your plan will remain active until the end of the billing period.
                            {isGrandfathered
                              ? " You will fall back to the free Spark plan (10K requests, 16K context)."
                              : " Without a paid plan, you will need Spark Premium to keep using the CLI."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Plan</AlertDialogCancel>
                          <AlertDialogAction onClick={handleCancel} disabled={cancelling}>
                            {cancelling ? <Loader2 className="size-3 animate-spin inline mr-1" /> : null}
                            Confirm Cancel
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Spark Premium upgrade card (Spark users only) */}
            {currentTier === "spark" && sparkPremiumPlan && (
              <Card id="plan-card-spark-premium" className="border-cyan-500/30 bg-cyan-500/[0.03] backdrop-blur-xl scroll-mt-24">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="size-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                        <Zap className="size-5 text-cyan-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-[15px] font-semibold text-zinc-100 font-mono">Spark Premium</h3>
                          <Badge variant="outline" className="text-[10px] font-mono text-cyan-400 border-cyan-500/30">
                            Recommended
                          </Badge>
                        </div>
                        <p className="text-[12px] text-zinc-500 leading-relaxed max-w-md">
                          Upgrade for $1/month — unlock 15K requests, 32K context, and $10 monthly credits with deal multipliers.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <span className="text-xl font-semibold text-zinc-100">$1</span>
                        <span className="text-[12px] text-zinc-500 font-mono">/month</span>
                        <span className="text-[10px] text-zinc-600 font-mono block">+ processing fee</span>
                      </div>
                      <Button
                        onClick={() => setConfirmingPlan(sparkPremiumPlan)}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white"
                      >
                        Upgrade
                      </Button>
                    </div>
                  </div>

                  {/* Mini stats */}
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-cyan-500/10">
                    <div className="text-center">
                      <div className="text-[11px] font-mono text-cyan-400 font-medium">15K</div>
                      <div className="text-[10px] text-zinc-500">Requests</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[11px] font-mono text-cyan-400 font-medium">32K</div>
                      <div className="text-[10px] text-zinc-500">Context</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[11px] font-mono text-cyan-400 font-medium">$10</div>
                      <div className="text-[10px] text-zinc-500">Credits</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No active plan → show sign-up prompt for new users */}
            {!currentPlan && (
              <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-xl">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="size-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Sparkles className="size-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-zinc-100 font-mono">Get started with Spark Premium</h3>
                      <p className="text-[12px] text-zinc-500 leading-relaxed mt-1">
                        $1/month + processing fee — 15K requests, 32K context, $10 monthly credits, open models.
                        Fully refundable if you use less than $5 of credits and 7.5K requests.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Other plan options */}
            {upgradePlans.length > 0 && (
              <div>
                <h3 className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-3">
                  Available upgrades
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {upgradePlans.map((plan) => (
                    <Card key={plan.id} id={`plan-card-${plan.tier}`} className="border-zinc-800 bg-zinc-900/40 backdrop-blur-xl scroll-mt-24">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-100 font-mono">{plan.name}</h4>
                            <p className="text-[11px] text-zinc-500 mt-0.5">{plan.description}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-lg font-semibold text-zinc-100">
                              {formatPrice(plan)}
                            </span>
                            <span className="text-[11px] text-zinc-500 font-mono">/{plan.interval}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1 mb-3">
                          <div className="text-[10px] text-zinc-500">
                            <span className="block text-zinc-300 font-medium">{plan.requestLimit.toLocaleString()}</span>
                            requests
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            <span className="block text-zinc-300 font-medium">{(plan.contextLimit / 1000).toFixed(0)}K</span>
                            context
                          </div>
                        </div>
                        <Button
                          onClick={() => setConfirmingPlan(plan)}
                          className="w-full text-[12px]"
                          variant={plan.tier === "pro" ? "default" : "outline"}
                          size="sm"
                        >
                          Subscribe to {plan.tier === "pro" ? "Pro" : "Ultra"}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Refund section (Spark Premium only) */}
            {currentTier === "spark-premium" && (
              <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-xl">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Shield className="size-5 text-zinc-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium text-zinc-300">Request Refund</h4>
                        <p className="text-[12px] text-zinc-600 mt-1 leading-relaxed">
                          Refundable if credits consumed &lt; $5 and requests used &lt; 7.5K.
                          Otherwise, refunds are handled on a case-by-case basis.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefund}
                      disabled={refunding}
                      className="text-zinc-400 shrink-0"
                    >
                      {refunding ? <Loader2 className="size-3 animate-spin" /> : "Request Refund"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Confirm checkout dialog */}
      <Dialog open={!!confirmingPlan} onOpenChange={(open) => { if (!open) setConfirmingPlan(null) }}>
        <DialogContent className="bg-zinc-900 border-zinc-700/50 max-w-md p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="text-zinc-100 text-base font-semibold tracking-tight">
              Confirm plan changes
            </DialogTitle>
          </DialogHeader>

          {confirmingPlan && (
            <div className="px-6 space-y-4">
              {/* Plan + price */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[15px] font-semibold text-zinc-100">{confirmingPlan.name}</span>
                  <p className="text-[12px] text-zinc-500 mt-0.5">
                    Billed {confirmingPlan.interval === "year" ? "yearly" : "monthly"}, starting today
                  </p>
                </div>
                <span className="text-[15px] font-semibold text-zinc-100">{formatPrice(confirmingPlan)}</span>
              </div>

              {/* Dashed divider */}
              <div className="border-t border-dashed border-zinc-700" />

              {/* Due today */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[14px] font-semibold text-zinc-100">Due today</span>
                  <p className="text-[12px] text-zinc-500 mt-0.5">
                    Your next billing date will be {getNextBillingDate(confirmingPlan.interval)}
                  </p>
                </div>
                <span className="text-[14px] font-semibold text-zinc-100">{formatPrice(confirmingPlan)}</span>
              </div>

              {/* UPI note (INR only) */}
              {confirmingPlan.currency === "INR" ? (
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  UPI auto-pay can&apos;t approve this charge on its own. After you click Pay now, you&apos;ll be redirected to enter your UPI PIN to authorise it.
                </p>
              ) : (
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  You&apos;ll be redirected to complete payment securely.
                </p>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 pb-6 pt-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-200">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleConfirmPayNow}
              className="bg-white text-zinc-950 hover:bg-zinc-200 font-semibold"
            >
              Pay now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function StudioPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-zinc-950">
          <Spinner className="size-8 text-amber-500" />
        </div>
      }
    >
      <StudioPage />
    </Suspense>
  )
}
