"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Gift, Sparkles, X } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  type BillingCycle,
  type Region,
  type Tier,
  TIER_ACCENTS,
  TIERS,
  billingPeriodLabel,
  formatCredits,
  formatPrice,
  isRegional,
} from "@/modules/nova-web/plans"

// Terminal / harness auth URL — where /studio lives. Override per environment.
const TERMINAL_URL =
  process.env.NEXT_PUBLIC_TERMINAL_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://supercode-terminal.vercel.app"
    : "http://localhost:3000")

const REGION_LABEL: Record<Region, string> = {
  in: "India",
  int: "International",
}
const REGION_FLAG: Record<Region, string> = {
  in: "🇮🇳",
  int: "🌍",
}

const FREE = TIERS[0]!

export function ChoosePlanModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [billing, setBilling] = useState<BillingCycle>("monthly")
  const [region, setRegion] = useState<Region>("in")

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  const visibleTiers = useMemo(() => TIERS, [])

  const handleSelectPaid = useCallback(
    (tier: Tier, billing: BillingCycle, region: Region) => {
      const params = new URLSearchParams({
        plan: tier.name.toLowerCase(),
        cycle: billing,
        region,
      })
      window.location.href = `${TERMINAL_URL}/studio?${params.toString()}`
    },
    [],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-[#0c0c0c] text-white shadow-2xl ring-1 ring-white/10 sm:max-w-[1080px] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close plan selector"
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.08] hover:text-white"
        >
          <X className="size-4" />
        </button>

        <div className="px-6 pb-2 pt-8 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 ring-1 ring-emerald-500/30">
            <Gift className="size-5 text-emerald-300" />
          </div>
          <h2 className="mt-4 text-[22px] font-semibold tracking-tight">
            Put Nova to work
          </h2>
          <p className="mt-1 text-[13px] text-white/55">
            Plans include monthly usage credits and India-pricing where available
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 px-6">
          <BillingToggle billing={billing} onChange={setBilling} />
          <span className="hidden text-white/15 sm:inline">·</span>
          <RegionToggle region={region} onChange={setRegion} />
        </div>

        <div className="px-5 pb-7 pt-6 sm:px-7">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleTiers.map((tier) => (
              <PlanCard
                key={tier.name}
                tier={tier}
                billing={billing}
                region={region}
                onClose={onClose}
                onSelectPaid={handleSelectPaid}
              />
            ))}
          </div>

          <p className="mt-6 text-center text-[11px] text-white/40">
            {FREE.name} is always free · Spark and Pro prices are region-aware ·
            You can switch plans or cancel anytime from this page.
          </p>
        </div>
      </div>
    </div>
  )
}

function BillingToggle({
  billing,
  onChange,
}: {
  billing: BillingCycle
  onChange: (next: BillingCycle) => void
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
      {(["monthly", "yearly"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            "relative inline-flex h-7 items-center rounded-full px-3.5 text-[12px] font-medium transition",
            billing === value
              ? "bg-white text-black shadow"
              : "text-white/55 hover:text-white",
          )}
        >
          {value === "monthly" ? "Monthly" : "Annual"}
          {value === "yearly" && (
            <span
              className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
                billing === "yearly"
                  ? "bg-emerald-500/20 text-emerald-700"
                  : "bg-emerald-500/15 text-emerald-300",
              )}
            >
              Save 17%
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function RegionToggle({
  region,
  onChange,
}: {
  region: Region
  onChange: (next: Region) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
      {(["in", "int"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition",
            region === value
              ? "bg-white text-black shadow"
              : "text-white/55 hover:text-white",
          )}
        >
          <span aria-hidden>{REGION_FLAG[value]}</span>
          <span>{REGION_LABEL[value]}</span>
        </button>
      ))}
    </div>
  )
}

function PlanCard({
  tier,
  billing,
  region,
  onClose,
  onSelectPaid,
}: {
  tier: Tier
  billing: BillingCycle
  region: Region
  onClose: () => void
  onSelectPaid: (tier: Tier, billing: BillingCycle, region: Region) => void
}) {
  const accent = TIER_ACCENTS[tier.accent]
  const priceLabel = formatPrice(tier.price, billing, region)
  const creditLabel = formatCredits(tier.credits, billing, region)
  const regional = isRegional(tier.price, billing)
  const showRegionSwitchOnCard = tier.popular || tier.name === "Spark"
  const isFree = tier.name === "Free"

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl bg-[#141414] p-5 ring-1 ring-white/10 transition",
        tier.popular && "ring-2 ring-amber-400/60",
        "hover:ring-white/20",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-xl bg-gradient-to-b opacity-90",
          accent.bg,
        )}
      />
      <div className="relative">
        {tier.popular ? (
          <span className="absolute right-0 -top-1 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black">
            <Sparkles className="size-3" />
            Most popular
          </span>
        ) : (
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.16em]",
              tier.badgeClass,
            )}
          >
            {tier.badge}
          </p>
        )}

        <h3 className="mt-5 text-[15px] font-semibold tracking-tight">
          {tier.name}
        </h3>

        <div className="mt-3 flex items-end gap-1.5">
          <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
            {priceLabel}
          </span>
          <span className="pb-1 text-[12px] text-white/55">
            {billingPeriodLabel(billing)}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums",
              accent.pillBg,
            )}
          >
            {creditLabel} usage
          </span>
          {billing === "yearly" ? (
            <span className="text-[10.5px] text-emerald-300">
              2 months free
            </span>
          ) : null}
        </div>

        {regional && showRegionSwitchOnCard ? (
          <p className="mt-2 text-[10.5px] text-white/40">
            {region === "in"
              ? "₹ shown for India · UPI supported"
              : "$ shown for outside India"}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => (isFree ? onClose() : onSelectPaid(tier, billing, region))}
          className={cn(
            "mt-4 inline-flex h-9 w-full items-center justify-center rounded-lg text-[13px] font-semibold transition active:scale-[0.98]",
            tier.popular
              ? "bg-amber-400 text-black hover:bg-amber-300"
              : isFree
                ? "bg-white/[0.08] text-white hover:bg-white/[0.12]"
                : "bg-white text-black hover:bg-white/90",
          )}
        >
          {tier.ctaLabel}
        </button>

        <div className="mt-5 h-px w-full bg-white/[0.08]" />

        <ul className="mt-4 space-y-2">
          {tier.features.slice(0, 6).map((feature) => (
            <li key={feature} className="flex gap-2 text-[12.5px] leading-snug text-white/75">
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
              <span className="min-w-0">{feature}</span>
            </li>
          ))}
        </ul>

        {tier.name === "Pro" ? (
          <p className="mt-3 text-[11px] text-white/40">
            Roll over unused credits · mobile builds · Slack connect
          </p>
        ) : null}
      </div>
    </div>
  )
}
