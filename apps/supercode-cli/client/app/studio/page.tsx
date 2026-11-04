"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
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
  Shield,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
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

/** Feature lists — keep in sync with apps/web /pricing */
function getFeatures(tier: string) {
  if (tier === "spark") return [
    { label: "Fixed credits — DeepSeek model", included: true },
    { label: "Free bring-your-own API keys (BYOK)", included: true },
    { label: "Connect Codex / Claude / OpenCode subs — free", included: true },
    { label: "1 vCPU / 4 GB RAM cloud machines", included: true },
    { label: "Unlimited members", included: true },
    { label: "Discord community support", included: true },
    { label: "App connectors", included: false },
    { label: "PR reviews", included: false },
    { label: "Machines up to 64 GB RAM", included: false },
  ]
  if (tier === "spark-premium") return [
    { label: "Everything in Free", included: true },
    { label: "$5 monthly credits (INT & IN)", included: true },
    { label: "Connect Codex / Claude / OpenCode subs — free", included: true },
    { label: "Open Source models (weekly / monthly usage)", included: true },
    { label: "Free bring-your-own API keys (BYOK)", included: true },
    { label: "Up to 2 vCPU / 8 GB RAM cloud machines", included: true },
    { label: "App connectors", included: true },
    { label: "Monthly limited PR reviews", included: true },
    { label: "Unlimited members", included: true },
  ]
  if (tier === "pro") return [
    { label: "Everything in Spark", included: true },
    { label: "$25 credits (INT) / $20 credits (IN)", included: true },
    { label: "Connect Codex / Claude / OpenCode subs — free", included: true },
    { label: "Frontier models (weekly / monthly usage)", included: true },
    { label: "Free bring-your-own API keys (BYOK)", included: true },
    { label: "Up to 4 vCPU / 16 GB RAM", included: true },
    { label: "App connectors", included: true },
    { label: "Monthly PR reviews", included: true },
    { label: "Usage analytics", included: true },
  ]
  return [
    { label: "Everything in Pro", included: true },
    { label: "$110 monthly credits", included: true },
    { label: "Connect Codex / Claude / OpenCode subs — free", included: true },
    { label: "Frontier models (weekly / monthly usage)", included: true },
    { label: "Free bring-your-own API keys (BYOK)", included: true },
    { label: "Up to 16 vCPU / 64 GB RAM", included: true },
    { label: "App connectors", included: true },
    { label: "Unlimited PR reviews", included: true },
    { label: "Priority support", included: true },
    { label: "Usage analytics + exports", included: true },
  ]
}

function displayPlanName(plan: Plan | null | undefined): string {
  if (!plan) return "No active plan"
  if (plan.tier === "spark") return "Free"
  if (plan.tier === "spark-premium") return "Spark"
  if (plan.tier === "pro") return "Pro"
  if (plan.tier === "ultra") return "Ultra"
  return plan.name
}

function tierVmLabel(tier: string): string {
  if (tier === "spark") return "1 vCPU / 4 GB"
  if (tier === "spark-premium") return "2 vCPU / 8 GB"
  if (tier === "pro") return "4 vCPU / 16 GB"
  if (tier === "ultra") return "16 vCPU / 64 GB"
  return "—"
}

function modelAccessLabel(tier: string, access?: string): string {
  if (tier === "spark") return "DeepSeek only"
  if (tier === "spark-premium") return "Open Source only"
  if (tier === "pro" || tier === "ultra" || access === "premium" || access === "all") {
    return "Frontier models + BYOK"
  }
  return "DeepSeek only"
}

function creditsLabel(plan: Plan | null | undefined, region: "in" | "int"): string {
  if (!plan) return "—"
  if (plan.tier === "spark") return "Fixed DeepSeek"
  if (plan.tier === "spark-premium") return "$5 / mo"
  if (plan.tier === "pro") return region === "in" ? "$20 / mo" : "$25 / mo"
  if (plan.tier === "ultra") return "$110 / mo"
  if (plan.creditAmountCents) return `$${(plan.creditAmountCents / 100).toFixed(0)} / mo`
  return "—"
}

function planBlurb(tier: string): string {
  if (tier === "spark") {
    return "Fixed DeepSeek credits, free BYOK, free Codex/Claude/OpenCode connect, and 1 vCPU / 4 GB machines."
  }
  if (tier === "spark-premium") {
    return "Everything in Free, plus $5 credits, app connectors, and limited PR reviews."
  }
  if (tier === "pro") {
    return "Everything in Spark, plus frontier models, $25/$20 credits, and machines up to 4 vCPU / 16 GB."
  }
  if (tier === "ultra") {
    return "Everything in Pro, plus $110 credits, unlimited PR reviews, and machines up to 16 vCPU / 64 GB."
  }
  return ""
}

function tierRank(tier: string): number {
  if (tier === "spark") return 0
  if (tier === "spark-premium") return 1
  if (tier === "pro") return 2
  if (tier === "ultra") return 3
  return -1
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
  const [region, setRegion] = useState<"in" | "int">("int")

  const userId = session?.user?.id

  useEffect(() => {
    setRegion(detectVariant())
  }, [])

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
  const variant = region

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

  const currentRank = tierRank(currentTier)

  // Monthly plans only, matching selected region (IN/INT), higher than current tier
  const upgradePlans = plans
    .filter((p) => {
      if (p.interval && p.interval !== "month") return false
      if (p.variant && p.variant !== variant) return false
      if (p.tier === currentTier) return false
      return tierRank(p.tier) > currentRank
    })
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier))

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
              <a href="/">
                <ArrowUpRight className="size-3.5" />
                Dashboard
              </a>
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
                        {displayPlanName(currentPlan)}
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
                      {planBlurb(currentTier) || currentPlan?.description || "Subscribe to a plan to get started."}
                    </p>
                  </div>
                  {subscription && (
                    <Button variant="outline" size="sm" onClick={handlePortal} className="shrink-0">
                      <ExternalLink className="size-3 mr-1" />
                      Billing Portal
                    </Button>
                  )}
                </div>

                {/* Stats grid — mirrors /pricing card chips */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
                  <StatBadge label="Credits" value={creditsLabel(currentPlan, variant)} />
                  <StatBadge label="Max VM" value={tierVmLabel(currentTier)} />
                  <StatBadge label="Models" value={modelAccessLabel(currentTier, currentPlan?.modelAccess)} />
                  <StatBadge
                    label="Price"
                    value={
                      currentPlan && currentPlan.priceCents > 0
                        ? `${formatPrice(currentPlan)}/mo`
                        : "$0/mo"
                    }
                  />
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
                              ? " You will fall back to Free (fixed DeepSeek credits, 1 vCPU / 4 GB)."
                              : " Without a paid plan, you fall back to Free — Spark is needed for connectors and PR reviews."}
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

            {/* Plan catalog — matches /pricing Free · Spark · Pro · Ultra */}
            {upgradePlans.length > 0 && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <h3 className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                    Available upgrades
                  </h3>
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800 w-fit">
                    {(["in", "int"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRegion(r)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all ${
                          region === r
                            ? "bg-amber-500 text-black"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {r === "in" ? "IN 🇮🇳" : "INT 🌍"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {upgradePlans.map((plan) => {
                    const isPro = plan.tier === "pro"
                    const isSpark = plan.tier === "spark-premium"
                    return (
                      <Card
                        key={plan.id}
                        id={`plan-card-${plan.tier}`}
                        className={`backdrop-blur-xl scroll-mt-24 ${
                          isPro
                            ? "border-amber-500/40 bg-amber-500/[0.04]"
                            : isSpark
                              ? "border-cyan-500/30 bg-cyan-500/[0.03]"
                              : "border-zinc-800 bg-zinc-900/40"
                        }`}
                      >
                        <CardContent className="p-5">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-semibold text-zinc-100 font-mono">
                                  {displayPlanName(plan)}
                                </h4>
                                {isPro && (
                                  <Badge className="text-[10px] font-mono bg-amber-500 text-black border-0">
                                    Most popular
                                  </Badge>
                                )}
                                {isSpark && (
                                  <Badge variant="outline" className="text-[10px] font-mono text-cyan-400 border-cyan-500/30">
                                    For getting started
                                  </Badge>
                                )}
                                {plan.tier === "ultra" && (
                                  <Badge variant="outline" className="text-[10px] font-mono text-purple-400 border-purple-500/30">
                                    For daily shipping
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[12px] text-zinc-500 leading-relaxed">
                                {planBlurb(plan.tier)}
                              </p>
                            </div>
                            <div className="text-left sm:text-right shrink-0">
                              <div>
                                <span className="text-xl font-semibold text-zinc-100">
                                  {formatPrice(plan)}
                                </span>
                                <span className="text-[12px] text-zinc-500 font-mono">/month</span>
                              </div>
                              <div className="text-[11px] font-mono text-cyan-400/90 mt-0.5">
                                {creditsLabel(plan, variant)} credits included
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mb-4 p-3 rounded-lg bg-zinc-950/50 border border-zinc-800/80">
                            <div>
                              <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Credits</div>
                              <div className="text-[12px] font-mono text-zinc-300">{creditsLabel(plan, variant)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Models</div>
                              <div className="text-[12px] font-mono text-zinc-300">
                                {modelAccessLabel(plan.tier, plan.modelAccess)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Max VM</div>
                              <div className="text-[12px] font-mono text-zinc-300">{tierVmLabel(plan.tier)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Region</div>
                              <div className="text-[12px] font-mono text-zinc-300">
                                {plan.variant === "in" ? "India" : plan.variant === "int" ? "International" : "Global"}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
                            {getFeatures(plan.tier).filter((f) => f.included).map((f) => (
                              <div key={f.label} className="flex items-start gap-2 text-[11px] text-zinc-400">
                                <CheckCircle2 className="size-3 text-emerald-500 shrink-0 mt-0.5" />
                                <span>{f.label}</span>
                              </div>
                            ))}
                          </div>

                          <Button
                            onClick={() => setConfirmingPlan(plan)}
                            className={`w-full text-[12px] ${
                              isPro ? "bg-amber-500 hover:bg-amber-400 text-black" : ""
                            }`}
                            variant={isPro ? "default" : "outline"}
                            size="sm"
                          >
                            {isSpark ? "Upgrade to Spark" : `Subscribe to ${displayPlanName(plan)}`}
                            <ArrowUpRight className="size-3.5 ml-1" />
                          </Button>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {currentTier === "ultra" && (
              <p className="text-center text-[12px] font-mono text-zinc-600">
                You&apos;re on Ultra — the highest public plan. Need more? Contact sales for Enterprise.
              </p>
            )}

            {/* Refund section (Spark only) */}
            {currentTier === "spark-premium" && (
              <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-xl">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Shield className="size-5 text-zinc-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium text-zinc-300">Request Refund</h4>
                        <p className="text-[12px] text-zinc-600 mt-1 leading-relaxed">
                          Refundable if credits consumed &lt; $2.50. Otherwise, refunds are
                          handled on a case-by-case basis.
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
                  <span className="text-[15px] font-semibold text-zinc-100">
                    {displayPlanName(confirmingPlan)}
                  </span>
                  <p className="text-[12px] text-zinc-500 mt-0.5">
                    {planBlurb(confirmingPlan.tier)}
                  </p>
                  <p className="text-[11px] text-zinc-600 mt-1 font-mono">
                    {creditsLabel(confirmingPlan, variant)} credits · {tierVmLabel(confirmingPlan.tier)} · billed{" "}
                    {confirmingPlan.interval === "year" ? "yearly" : "monthly"}
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
                  UPI auto-pay can't approve this charge on its own. After you click Pay now, you'll be redirected to enter your UPI PIN to authorise it.
                </p>
              ) : (
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  You'll be redirected to complete payment securely.
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
