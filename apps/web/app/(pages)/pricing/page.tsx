"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import Link from "next/link"
import { Check, Minus, ArrowUpRight, Cpu, MemoryStick, Coins } from "lucide-react"

// Terminal client URL — where /studio lives. Override per environment.
const TERMINAL_URL =
  process.env.NEXT_PUBLIC_TERMINAL_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://supercode-terminal.vercel.app"
    : "http://localhost:3000")

type Billing = "monthly" | "yearly"

interface TierStats {
  requests: string
  // contextWindow: string
  // tokens: string
  models: string
}

interface TierPrice {
  monthly: string | { indian: string; international: string }
  yearly: string | { indian: string; international: string }
}

interface Tier {
  name: string
  price: TierPrice
  period: string
  badge: string
  badgeClass: string
  description: string
  cta: string
  href: string
  popular: boolean
  stats: TierStats
  features: { label: string; included: boolean }[]
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: {
      monthly: "$0",
      yearly: "$0",
    },
    period: "/month",
    badge: "Free to start",
    badgeClass: "text-emerald-400",
    description:
      "Fixed DeepSeek credits, free BYOK, free Codex/Claude/OpenCode connect, and 1 vCPU / 4 GB machines.",
    cta: "Start free",
    href: "https://nova.supercodeai.tech",
    popular: false,
    stats: {
      requests: "Fixed DeepSeek credits",
      models: "DeepSeek only",
    },
    features: [
      { label: "Fixed credits — DeepSeek model", included: true },
      { label: "Free bring-your-own API keys (BYOK)", included: true },
      { label: "Connect Codex / Claude / OpenCode subs — free", included: true },
      { label: "1 vCPU / 4 GB RAM cloud machines", included: true },
      { label: "Unlimited members", included: true },
      { label: "Discord community support", included: true },
      { label: "App connectors", included: false },
      { label: "PR reviews", included: false },
      { label: "Machines up to 64 GB RAM", included: false },
    ],
  },
  {
    name: "Spark",
    price: {
      monthly: { indian: "₹449", international: "$5" },
      yearly: { indian: "₹4,490", international: "$50" },
    },
    period: "/month",
    badge: "For getting started",
    badgeClass: "text-emerald-400",
    description:
      "Everything in Free, plus $5 credits, app connectors, and limited PR reviews.",
    cta: "Get started",
    href: "/download",
    popular: false,
    stats: {
      requests: "$5 credits",
      models: "Open Source models only",
    },
    features: [
      { label: "Everything in Free", included: true },
      { label: "$5 monthly credits (INT & IN)", included: true },
      { label: "Connect Codex / Claude / OpenCode subs — free", included: true },
      { label: "Open Source models (weekly / monthly usage)", included: true },
      { label: "Free bring-your-own API keys (BYOK)", included: true },
      { label: "upto 2 vCPU / 8 GB RAM cloud machines", included: true },
      { label: "App connectors", included: true },
      { label: "Monthly limited PR reviews", included: true },
      { label: "Unlimited members", included: true },
    ],
  },
  {
    name: "Pro",
    price: {
      monthly: { indian: "₹1,549", international: "$20" },
      yearly: { indian: "₹18,500", international: "$100" },
    },
    period: "/month",
    badge: "Most popular",
    badgeClass: "text-amber-400",
    description:
      "Everything in Spark, plus frontier models, $25/$20 credits, and machines up to 4 vCPU / 16 GB.",
    cta: "Get started",
    href: "https://test.checkout.dodopayments.com/buy/pdt_0Nk0vS5WMtkT7u2T7P70e?quantity=1",
    popular: true,
    stats: {
      requests: "$25 INT / $20 IN credits",
      models: "Frontier models + BYOK",
    },
    features: [
      { label: "Everything in Spark", included: true },
      { label: "$25 credits (INT) / $20 credits (IN)", included: true },
      { label: "Connect Codex / Claude / OpenCode subs — free", included: true },
      { label: "Frontier models (weekly / monthly usage)", included: true },
      { label: "Free bring-your-own API keys (BYOK)", included: true },
      { label: "Up to 4vCPU / 16 GB RAM", included: true },
      { label: "App connectors", included: true },
      { label: "Monthly PR reviews", included: true },
      { label: "Usage analytics", included: true },
    ],
  },
  {
    name: "Ultra",
    price: {
      monthly: "$100",
      yearly: "$1,000",
    },
    period: "/month",
    badge: "For daily shipping",
    badgeClass: "text-purple-400",
    description:
      "Everything in Pro, plus $110 credits, unlimited PR reviews, and machines up to 16 vCPU / 64 GB.",
    cta: "Get started",
    href: "https://test.checkout.dodopayments.com/buy/pdt_0NkRmfmsthQToUr41UAnd?quantity=1",
    popular: false,
    stats: {
      requests: "$110 credits",
      models: "Frontier models + BYOK",
    },
    features: [
      { label: "Everything in Pro", included: true },
      { label: "$110 monthly credits", included: true },
      { label: "Connect Codex / Claude / OpenCode subs — free", included: true },
      { label: "Frontier models (weekly / monthly usage)", included: true },
      { label: "Free bring-your-own API keys (BYOK)", included: true },
      { label: "Up to 16vCPU / 64 GB RAM", included: true },
      { label: "App connectors", included: true },
      { label: "Unlimited PR reviews", included: true },
      { label: "Priority support", included: true },
      { label: "Usage analytics + exports", included: true },
    ],
  },
]

const ENTERPRISE_FEATURES = [
  "Custom credit quota and invoicing",
  "SSO / SAML authentication",
  "Dedicated support",
  "Audit logging and compliance",
  "Custom machine sizes",
  "Unlimited seats & orgs",
  "SLA guarantees & uptime",
  "On-premise / VPC option",
]

const FAQ = [
  {
    q: "What is included in the Free plan?",
    a: "Free includes fixed DeepSeek credits, free BYOK (bring your own API keys), and 2 vCPU / 4 GB cloud machines. App connectors and PR reviews are not included — upgrade to Spark for those.",
  },
  {
    q: "How does regional pricing work for Spark?",
    a: "Spark is $5/month internationally with $5 included credits. Indian users pay ₹449/month with $5 included credits (UPI supported).",
  },
  {
    q: "How does regional pricing work for Pro?",
    a: "Pro is $20/month internationally with $25 included credits. Indian users pay ₹1,549/month with $20 included credits (UPI supported). Free and Ultra are priced the same worldwide.",
  },
  {
    q: "How do credits work?",
    a: "Credits are spent on hosted model usage on Nova. Free includes fixed DeepSeek credits. Spark includes $5 credits (₹449 IN / $5 INT). Pro includes $25 (INT) or $20 (IN) credits per month. Ultra includes $110 credits per month. BYOK usage does not consume Nova credits.",
  },
  {
    q: "Can I upgrade or downgrade at any time?",
    a: "Yes. Plan changes take effect immediately. Upgrades are prorated; downgrades credit your account for the remaining billing period.",
  },
  {
    q: "What models are available on each plan?",
    a: "Free and Spark include DeepSeek plus free BYOK for other providers. Pro and Ultra add frontier models via included credits, with free BYOK on every plan.",
  },
  {
    q: "What machine sizes do I get?",
    a: "Free and Spark: 2 vCPU / 4 GB. Pro: machines up to 16 GB. Ultra: machines up to 32 GB. Enterprise can go custom.",
  },
  {
    q: "Are app connectors and PR reviews included?",
    a: "App connectors and PR reviews start at Spark ($5 INT / ₹449 IN). The Free plan does not include them.",
  },
]

function CheckIcon() {
  return <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
}

function MinusIcon() {
  return <Minus className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 mt-0.5" />
}

function formatPrice(
  price: TierPrice,
  billing: Billing,
  region: "in" | "int" = "in",
): string {
  const p = billing === "monthly" ? price.monthly : price.yearly
  if (typeof p === "string") return p
  return region === "in" ? p.indian : p.international
}

function formatPeriod(billing: Billing): string {
  return billing === "monthly" ? "/month" : "/year"
}

function isRegional(price: TierPrice, billing: Billing): boolean {
  const p = billing === "monthly" ? price.monthly : price.yearly
  return typeof p !== "string"
}

const COMPARE_ROWS: {
  section?: string
  label: string
  values: [string, string, string, string]
}[] = [
  {
    section: "Usage & credits",
    label: "Monthly price",
    values: ["$0", "$5 / ₹449", "$20 / ₹1,549", "$100"],
  },
  {
    label: "Monthly credits included",
    values: ["Fixed DeepSeek", "$5", "$25 INT / $20 IN", "$110"],
  },
  {
    label: "Roll-over unused credits",
    values: ["—", "—", "✓", "✓"],
  },
  {
    section: "Models",
    label: "DeepSeek (hosted)",
    values: ["✓", "✓", "✓", "✓"],
  },
  {
    label: "Open-source models (hosted credits)",
    values: ["—", "✓", "✓", "✓"],
  },
  {
    label: "Frontier models (hosted credits)",
    values: ["—", "—", "✓", "✓"],
  },
  {
    label: "Bring your own API keys (BYOK)",
    values: ["Free", "Free", "Free", "Free"],
  },
  {
    label: "Connect Codex / Claude / OpenCode subs",
    values: ["Free", "Free", "Free", "Free"],
  },
  {
    section: "Compute",
    label: "Cloud machine size",
    values: ["1 vCPU / 4 GB", "Up to 2 vCPU / 8 GB", "Up to 4 vCPU / 16 GB", "Up to 16 vCPU / 64 GB"],
  },
  {
    label: "Concurrent cloud machines",
    values: ["1", "1", "Up to 4", "Up to 8"],
  },
  {
    section: "Product",
    label: "App connectors",
    values: ["—", "✓", "✓", "✓"],
  },
  {
    label: "PR reviews",
    values: ["—", "Limited", "Monthly", "Unlimited"],
  },
  {
    label: "Unlimited members",
    values: ["✓", "✓", "✓", "✓"],
  },
  {
    label: "Captains, subagents, and review",
    values: ["✓", "✓", "✓", "✓"],
  },
  {
    section: "Analytics & support",
    label: "Usage dashboard",
    values: ["Limited", "Limited", "Full", "Full + exports"],
  },
  {
    label: "Per-request cost & token breakdown",
    values: ["—", "—", "✓", "✓"],
  },
  { label: "Discord community support", values: ["✓", "✓", "✓", "✓"] },
  { label: "Email support", values: ["—", "—", "✓", "✓"] },
  { label: "Priority support", values: ["—", "—", "—", "✓"] },
  {
    section: "Privacy & security",
    label: "No training on your code",
    values: ["✓", "✓", "✓", "✓"],
  },
  {
    label: "Cancel anytime — no lock-in",
    values: ["✓", "✓", "✓", "✓"],
  },
  {
    label: "SSO / SAML",
    values: ["—", "—", "—", "Enterprise"],
  },
  {
    label: "Custom credit quota & invoicing",
    values: ["—", "—", "—", "Enterprise"],
  },
]

function PricingCard({
  tier,
  index,
  billing,
  region,
  onRegionChange,
}: {
  tier: Tier
  index: number
  billing: Billing
  region: "in" | "int"
  onRegionChange: (region: "in" | "int") => void
}) {
  const effectiveBilling = tier.name === "Free" ? "monthly" : billing
  const regional = isRegional(tier.price, effectiveBilling)

  // Free → Nova app; paid tiers → terminal billing studio
  const finalHref =
    tier.name === "Free" ? tier.href : `${TERMINAL_URL}/studio`

  return (
    <motion.div
      initial={{ opacity: 0, translateY: 12 }}
      whileInView={{ opacity: 1, translateY: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.23, 1, 0.32, 1] }}
      className={`relative flex flex-col rounded-xl border ${
        tier.popular
          ? "border-amber-500/50 bg-amber-500/[0.04]"
          : "border-border bg-card"
      } p-6 md:p-8`}
    >
      {tier.popular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-amber-500 border border-amber-400 rounded-full shadow-lg shadow-amber-500/20">
          <span className="text-[11px] font-semibold font-mono text-black tracking-wider uppercase">
            Most popular
          </span>
        </div>
      )}

      {!tier.popular && tier.badge && (
        <span
          className={`text-[11px] font-mono ${tier.badgeClass} tracking-wider uppercase mb-4`}
        >
          {tier.badge}
        </span>
      )}

      <div className="mb-1 mt-1">
        <span className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight">
          {formatPrice(tier.price, effectiveBilling, region)}
        </span>
        <span className="text-sm text-muted-foreground font-mono">
          {formatPeriod(effectiveBilling)}
        </span>
        {regional && tier.name === "Spark" && (
          <div className="text-[11px] text-primary/80 font-mono mt-1">
            $5 credits included
          </div>
        )}
        {regional && tier.name === "Pro" && (
          <div className="text-[11px] text-amber-400/90 font-mono mt-1">
            {region === "in" ? "$20" : "$25"} credits included
          </div>
        )}
      </div>

      {/* Region toggle (Pro only) */}
      {(tier.name === "Spark" || tier.name === "Pro") && (
        <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/5 mb-2 w-fit">
          {(["in", "int"] as const).map((r) => (
            <button
              key={r}
              onClick={() => onRegionChange(r)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all duration-200 ${
                region === r
                  ? tier.name === "Pro"
                    ? "bg-amber-500 text-black"
                    : "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r === "in" ? "IN 🇮🇳" : "INT 🌍"}
            </button>
          ))}
        </div>
      )}

      <h3 className="text-[15px] font-semibold text-foreground font-mono mt-5 mb-2">
        {tier.name}
      </h3>

      <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">
        {tier.description}
      </p>

      <div className="grid grid-cols-2 gap-2 mb-6 p-3 rounded-lg bg-white/[0.03] border border-white/5">
        <StatItem label="Credits" value={tier.stats.requests} />
        {/* <StatItem label="Context" value={tier.stats.contextWindow} /> */}
        {/* <StatItem label="Tokens" value={tier.stats.tokens} /> */}
        <StatItem label="Models" value={tier.stats.models} />
      </div>

      <Link
        href={finalHref}
        target={finalHref.startsWith("http") ? "_blank" : undefined}
        rel={finalHref.startsWith("http") ? "noopener noreferrer" : undefined}
        onClick={(e) => {
          // If this tier routes to the terminal /studio, keep it in the
          // same tab — /studio handles the auth check and bounces to the
          // terminal sign-in flow (root) when unauthenticated.
          if (finalHref.startsWith(`${TERMINAL_URL}/`)) {
            e.preventDefault()
            window.location.href = finalHref
          }
        }}
        className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-medium font-mono transition-all duration-200 active:scale-[0.97] mb-6 ${
          tier.popular
            ? "bg-amber-500 text-black hover:bg-amber-400"
            : "bg-white/10 text-foreground hover:bg-white/15 border border-white/10"
        }`}
      >
        {tier.cta}
        <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>

      <div className="space-y-2.5 mt-auto">
        {tier.features.map((f) => (
          <div key={f.label} className="flex items-start gap-3">
            {f.included ? <CheckIcon /> : <MinusIcon />}
            <span
              className={`text-[13px] leading-tight ${
                f.included ? "text-foreground/80" : "text-muted-foreground/40"
              }`}
            >
              {f.label}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className="text-[12px] font-mono text-foreground/80">{value}</div>
    </div>
  )
}

type VmSizeId = "2x4" | "4x16" | "8x32"

const VM_SIZES: {
  id: VmSizeId
  label: string
  vcpu: number
  ramGb: number
  novaPlan: string
  novaPriceUsd: number
  novaCreditsUsd: number
}[] = [
  {
    id: "2x4",
    label: "2 vCPU · 4 GB",
    vcpu: 2,
    ramGb: 4,
    novaPlan: "Spark / Spark Premium",
    novaPriceUsd: 1,
    novaCreditsUsd: 1,
  },
  {
    id: "4x16",
    label: "Up to 16 GB",
    vcpu: 4,
    ramGb: 16,
    novaPlan: "Pro",
    novaPriceUsd: 10,
    novaCreditsUsd: 12,
  },
  {
    id: "8x32",
    label: "Up to 32 GB",
    vcpu: 8,
    ramGb: 32,
    novaPlan: "Ultra",
    novaPriceUsd: 100,
    novaCreditsUsd: 110,
  },
]

type CompetitorRow = {
  name: string
  plan: string
  monthlyUsd: number
  creditsUsd: number
  maxVm: string
  highlight?: boolean
}

function competitorsForVm(vm: VmSizeId): CompetitorRow[] {
  if (vm === "2x4") {
    return [
      {
        name: "Nova",
        plan: "Spark Premium",
        monthlyUsd: 1,
        creditsUsd: 1,
        maxVm: "2 vCPU / 4 GB",
        highlight: true,
      },
      {
        name: "Capy",
        plan: "Lite",
        monthlyUsd: 20,
        creditsUsd: 20,
        maxVm: "4 vCPU / 16 GB",
      },
      {
        name: "Devin",
        plan: "Pro",
        monthlyUsd: 20,
        creditsUsd: 20,
        maxVm: "Desktop + Cloud",
      },
      {
        name: "Devin",
        plan: "Free",
        monthlyUsd: 0,
        creditsUsd: 0,
        maxVm: "Limited",
      },
    ]
  }
  if (vm === "4x16") {
    return [
      {
        name: "Nova",
        plan: "Pro",
        monthlyUsd: 10,
        creditsUsd: 12,
        maxVm: "Up to 16 GB",
        highlight: true,
      },
      {
        name: "Capy",
        plan: "Lite",
        monthlyUsd: 20,
        creditsUsd: 20,
        maxVm: "4 vCPU / 16 GB",
      },
      {
        name: "Capy",
        plan: "Pro",
        monthlyUsd: 100,
        creditsUsd: 105,
        maxVm: "8 vCPU / 32 GB",
      },
      {
        name: "Devin",
        plan: "Pro",
        monthlyUsd: 20,
        creditsUsd: 20,
        maxVm: "Desktop + Cloud",
      },
      {
        name: "Devin",
        plan: "Team",
        monthlyUsd: 80,
        creditsUsd: 80,
        maxVm: "Team seats",
      },
    ]
  }
  return [
    {
      name: "Nova",
      plan: "Ultra",
      monthlyUsd: 100,
      creditsUsd: 110,
      maxVm: "Up to 32 GB",
      highlight: true,
    },
    {
      name: "Capy",
      plan: "Pro",
      monthlyUsd: 100,
      creditsUsd: 105,
      maxVm: "8 vCPU / 32 GB",
    },
    {
      name: "Capy",
      plan: "Max",
      monthlyUsd: 200,
      creditsUsd: 220,
      maxVm: "16 vCPU / 64 GB",
    },
    {
      name: "Devin",
      plan: "Max",
      monthlyUsd: 200,
      creditsUsd: 200,
      maxVm: "Max cloud",
    },
    {
      name: "Devin",
      plan: "Team",
      monthlyUsd: 80,
      creditsUsd: 80,
      maxVm: "Team seats",
    },
  ]
}

function formatUsd(n: number): string {
  if (n === 0) return "$0"
  if (n < 10) return `$${n.toFixed(2).replace(/\.00$/, "")}`
  return `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`
}

function UsageComparisonCalculator() {
  const [vmId, setVmId] = useState<VmSizeId>("4x16")
  const [hours, setHours] = useState(40)

  const vm = VM_SIZES.find((v) => v.id === vmId) ?? VM_SIZES[1]
  const rows = useMemo(() => competitorsForVm(vmId), [vmId])
  const nova = rows.find((r) => r.highlight) ?? rows[0]
  const maxMonthly = Math.max(...rows.map((r) => Math.max(r.monthlyUsd, 1)))

  // Simple compute estimate: plan base + proportional credit burn by hours (out of ~160 work hrs)
  const creditBurnRatio = Math.min(1, hours / 160)
  const novaEstimate =
    nova.monthlyUsd === 0
      ? 0
      : nova.monthlyUsd + Math.max(0, nova.creditsUsd - nova.monthlyUsd) * creditBurnRatio * 0.15

  const hourPct = Math.round((hours / 720) * 100)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 md:px-8 pt-6 pb-4 border-b border-border/60 text-center">
        <p className="text-[13px] text-muted-foreground font-mono">
          Compare credits and VM size. See how Nova stacks up against Capy and Devin.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/60">
        {/* Left: controls */}
        <div className="p-5 md:p-8 space-y-6">
          <div className="flex flex-wrap gap-2">
            {VM_SIZES.map((size) => (
              <button
                key={size.id}
                type="button"
                onClick={() => setVmId(size.id)}
                className={`px-3.5 py-2 rounded-full text-[12px] font-mono transition-all duration-200 active:scale-[0.97] border ${
                  vmId === size.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white/[0.03] text-muted-foreground border-white/10 hover:text-foreground hover:border-white/20"
                }`}
              >
                {size.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 text-[12px] font-mono text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              {vm.vcpu} vCPU
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MemoryStick className="w-3.5 h-3.5" />
              {vm.ramGb} GB RAM
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5" />
              {vm.novaPlan}
            </span>
          </div>

          <div>
            <div className="flex items-end justify-between mb-3">
              <span className="text-[13px] font-mono text-foreground/80">Hours used / month</span>
              <span className="text-[12px] font-mono text-muted-foreground">
                {hourPct}% · {hours} hrs
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={720}
              step={1}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
            />
            <div className="flex justify-between mt-2 text-[11px] font-mono text-muted-foreground/50">
              <span>1 hour</span>
              <span>Always running</span>
            </div>
          </div>

          <div className="pt-4 border-t border-border/50">
            <div className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-2">
              Nova monthly estimate
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl md:text-5xl font-semibold text-foreground tracking-tight tabular-nums">
                {formatUsd(novaEstimate)}
              </span>
              <span className="text-[12px] font-mono text-muted-foreground">/ mo</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-mono text-muted-foreground">
              <span>
                Plan{" "}
                <span className="text-foreground/80">{formatUsd(nova.monthlyUsd)}</span>
              </span>
              <span>
                Credits{" "}
                <span className="text-foreground/80">{formatUsd(nova.creditsUsd)}</span>
              </span>
              <span>
                VM{" "}
                <span className="text-foreground/80">{nova.maxVm}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right: comparison */}
        <div className="p-5 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[15px] font-semibold text-foreground tracking-tight">
              Monthly usage comparison
            </h3>
            <span className="text-[11px] font-mono text-muted-foreground/50">vs Nova</span>
          </div>

          <div className="space-y-4">
            {rows.map((row) => {
              const mult =
                nova.monthlyUsd <= 0
                  ? row.monthlyUsd <= 0
                    ? 1
                    : Infinity
                  : row.monthlyUsd / Math.max(nova.monthlyUsd, 0.01)
              const barPct = Math.min(100, (row.monthlyUsd / maxMonthly) * 100)
              const multLabel =
                !Number.isFinite(mult) || mult === 0
                  ? "—"
                  : mult < 1.05
                    ? "1×"
                    : `${mult.toFixed(1).replace(/\.0$/, "")}×`

              return (
                <div key={`${row.name}-${row.plan}`} className="grid grid-cols-[1fr_minmax(0,1.2fr)_auto_auto] gap-3 items-center">
                  <div className="min-w-0">
                    <div
                      className={`text-[13px] font-mono truncate ${
                        row.highlight ? "text-primary font-medium" : "text-foreground/80"
                      }`}
                    >
                      {row.name}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground/50 truncate">
                      {row.plan} · {row.maxVm}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        row.highlight ? "bg-primary" : "bg-muted-foreground/40"
                      }`}
                      style={{ width: `${Math.max(barPct, row.monthlyUsd === 0 ? 2 : 4)}%` }}
                    />
                  </div>
                  <div
                    className={`text-[13px] font-mono tabular-nums text-right w-14 ${
                      row.highlight ? "text-primary font-medium" : "text-foreground/80"
                    }`}
                  >
                    {formatUsd(row.monthlyUsd)}
                  </div>
                  <div
                    className={`text-[12px] font-mono tabular-nums text-right w-10 ${
                      row.highlight ? "text-primary/80" : "text-muted-foreground/60"
                    }`}
                  >
                    {multLabel}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 pt-5 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-1">
                Credits
              </div>
              <div className="text-[14px] font-mono text-foreground/90">
                {formatUsd(nova.creditsUsd)}
                <span className="text-[11px] text-muted-foreground/50"> / mo</span>
              </div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-1">
                Max VM
              </div>
              <div className="text-[14px] font-mono text-foreground/90">{nova.maxVm}</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-1">
                Cheapest seat
              </div>
              <div className="text-[14px] font-mono text-foreground/90">
                Nova {formatUsd(nova.monthlyUsd)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-4 border-t border-border/60">
        <p className="text-[11px] text-muted-foreground/50 font-mono leading-relaxed">
          Estimates use public list prices for Capy (Lite / Pro / Max) and Devin (Free / Pro / Team / Max).
          Nova credits: Spark fixed DeepSeek · Pro $12 INT / $10 IN · Ultra $110. VM size is the max concurrent
          machine on that plan. Competitor figures are approximate and may change.
        </p>
      </div>
    </div>
  )
}

const COMPETITOR_COMPARE: {
  section?: string
  label: string
  /** Free · ~$20 · ~$100 — [Nova, Devin, Capy] each */
  free: [string, string, string]
  twenty: [string, string, string]
  hundred: [string, string, string]
}[] = [
  {
    section: "Price",
    label: "Plan name",
    free: ["Free", "Free", "—"],
    twenty: ["Pro", "Pro", "Lite"],
    hundred: ["Ultra", "Max*", "Pro"],
  },
  {
    label: "Monthly price",
    free: ["$0", "$0", "No free plan"],
    twenty: ["$20 INT / ₹1,549 IN", "$20", "$20"],
    hundred: ["$100", "$200*", "$100"],
  },
  {
    label: "Credits / usage included",
    free: ["Fixed DeepSeek credits", "Limited free usage", "—"],
    twenty: ["$25 INT / $20 IN credits", "ACU usage pool", "$20 credits + deals"],
    hundred: ["$110 credits", "Higher ACU pool", "$105 credits + 5% bonus"],
  },
  {
    section: "Models & access",
    label: "Hosted models",
    free: ["DeepSeek only", "Base models (slow SWE)", "—"],
    twenty: ["Frontier + open-source", "Premium models", "Every supported model"],
    hundred: ["Frontier + open-source", "Full model catalog", "All models + bonus credits"],
  },
  {
    label: "BYOK (bring your own keys)",
    free: ["✓ Free", "—", "✓ Free"],
    twenty: ["✓ Free", "—", "✓ Free"],
    hundred: ["✓ Free", "—", "✓ Free"],
  },
  {
    label: "Connect Codex / Claude / OpenCode subs",
    free: ["✓ Free", "—", "—"],
    twenty: ["✓ Free", "—", "—"],
    hundred: ["✓ Free", "—", "—"],
  },
  {
    label: "Premium / frontier models",
    free: ["—", "—", "—"],
    twenty: ["✓", "✓", "✓"],
    hundred: ["✓", "✓", "✓"],
  },
  {
    section: "Compute",
    label: "Cloud / sandbox VM",
    free: ["1 vCPU / 4 GB", "Devin Cloud sessions", "—"],
    twenty: ["Up to 4 vCPU / 16 GB", "Devin Cloud sessions", "Up to 4 vCPU / 16 GB"],
    hundred: ["Up to 16 vCPU / 64 GB", "Devin Cloud sessions", "Up to 8 vCPU / 32 GB"],
  },
  {
    label: "Concurrent RAM on cloud machines",
    free: ["4 GB", "Managed", "—"],
    twenty: ["16 GB", "Managed", "128 GB concurrent"],
    hundred: ["64 GB", "Managed", "512 GB concurrent"],
  },
  {
    section: "Product",
    label: "App connectors / integrations",
    free: ["—", "—", "—"],
    twenty: ["✓", "Slack, GitHub, Linear…", "✓"],
    hundred: ["✓", "Slack, GitHub, Linear…", "✓"],
  },
  {
    label: "PR reviews",
    free: ["—", "—", "—"],
    twenty: ["Monthly", "✓ (via repo)", "—"],
    hundred: ["Unlimited", "✓ (via repo)", "—"],
  },
  {
    label: "Captains / subagents / parallel agents",
    free: ["✓", "—", "—"],
    twenty: ["✓", "✓ sessions", "Captains + subagents"],
    hundred: ["✓", "✓ sessions", "Captains + subagents"],
  },
  {
    label: "Sharing & collaboration",
    free: ["Unlimited members", "— (1 seat)", "Unlimited members"],
    twenty: ["Unlimited members", "— (1 seat)", "Unlimited members"],
    hundred: ["Unlimited members", "— (1 seat*)", "Unlimited members"],
  },
  {
    label: "Mobile builds / devices",
    free: ["—", "—", "—"],
    twenty: ["—", "—", "—"],
    hundred: ["—", "—", "✓"],
  },
  {
    section: "Support",
    label: "Community / Discord",
    free: ["✓", "—", "—"],
    twenty: ["✓", "—", "—"],
    hundred: ["✓", "—", "✓ Priority + Slack"],
  },
  {
    label: "Priority / dedicated support",
    free: ["✓ Priority + Slack connect", "—", "—"],
    twenty: ["✓ Priority + Slack connect", "—", "—"],
    hundred: ["✓ Priority + Slack connect", "—", "✓ Priority + Slack Connect"],
  },
]

function CompetitorCell({ value, emphasize }: { value: string; emphasize?: boolean }) {
  const isCheck = value === "✓" || value === "—" || value.startsWith("✓")
  return (
    <td
      className={`py-2.5 px-2 text-center text-[12px] ${
        isCheck
          ? value === "—"
            ? "text-muted-foreground/30"
            : "text-primary"
          : emphasize
            ? "text-primary font-medium"
            : "text-foreground/75"
      }`}
    >
      {value}
    </td>
  )
}

function CompetitorCompareTable() {
  const bands: { key: "free" | "twenty" | "hundred"; title: string; sub: string }[] = [
    { key: "free", title: "Free", sub: "$0" },
    { key: "twenty", title: "~$20", sub: "Nova Pro · Devin Pro · Capy Lite" },
    { key: "hundred", title: "~$100", sub: "Nova Ultra · Capy Pro · Devin Max*" },
  ]

  return (
    <div className="space-y-10">
      {bands.map((band) => (
        <div key={band.key}>
          <div className="mb-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
            <h3 className="text-[14px] font-semibold text-foreground font-mono">
              {band.title}
              <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                {band.sub}
              </span>
            </h3>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-[13px] font-mono">
              <thead>
                <tr className="border-b border-border bg-white/[0.02]">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
                    Feature
                  </th>
                  <th className="text-center py-3 px-3 text-primary font-medium text-[11px] uppercase tracking-wider">
                    Nova
                  </th>
                  <th className="text-center py-3 px-3 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
                    Devin
                  </th>
                  <th className="text-center py-3 px-3 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
                    Capy
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPETITOR_COMPARE.flatMap((row, i) => {
                  const prev = i > 0 ? COMPETITOR_COMPARE[i - 1] : null
                  const isNewSection = Boolean(row.section && prev?.section !== row.section)
                  const cells = row[band.key]
                  const out = []
                  if (isNewSection && row.section) {
                    out.push(
                      <tr key={`${band.key}-sec-${row.section}`}>
                        <td
                          colSpan={4}
                          className="pt-4 pb-1.5 px-4 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider"
                        >
                          {row.section}
                        </td>
                      </tr>,
                    )
                  }
                  out.push(
                    <tr
                      key={`${band.key}-row-${i}`}
                      className="border-b border-border/40 hover:bg-white/[0.02]"
                    >
                      <td className="py-2.5 px-4 text-foreground/70 text-[12px]">{row.label}</td>
                      <CompetitorCell value={cells[0]} emphasize />
                      <CompetitorCell value={cells[1]} />
                      <CompetitorCell value={cells[2]} />
                    </tr>,
                  )
                  return out
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-[11px] font-mono text-muted-foreground/45 leading-relaxed">
        *Devin Max is $200/mo (nearest public tier above $100). Devin Team ($80/mo) adds multi-seat
        collaboration. Capy has no free plan. Figures from public Devin and Capy pricing pages and
        may change. Nova Pro: $20 INT ($25 credits) / ₹1,549 IN ($20 credits). Nova Ultra: $100
        ($110 credits), up to 16 vCPU / 64 GB.
      </p>
    </div>
  )
}

function ComparisonTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] font-mono">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 pr-6 text-muted-foreground font-medium text-[12px] uppercase tracking-wider">
              Feature
            </th>
            {["Free", "Spark", "Pro", "Ultra"].map((name, i) => (
              <th
                key={name}
                className={`text-center py-3 px-3 font-medium text-[12px] uppercase tracking-wider ${
                  i === 2 ? "text-amber-400" : "text-muted-foreground"
                }`}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.flatMap((row, i) => {
            const prev = i > 0 ? COMPARE_ROWS[i - 1] : null
            const isNewSection = Boolean(row.section && prev?.section !== row.section)
            const rows = []

            if (isNewSection && row.section) {
              rows.push(
                <tr key={`section-${row.section}`}>
                  <td
                    colSpan={5}
                    className="pt-6 pb-2 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider"
                  >
                    {row.section}
                  </td>
                </tr>,
              )
            }

            rows.push(
              <tr
                key={`row-${i}`}
                className="border-b border-border/50 transition-colors duration-150 hover:bg-white/[0.02]"
              >
                <td className="py-3 pr-6 text-foreground/70">
                  {row.label.split("\n").map((line, li) => (
                    <span
                      key={li}
                      className={li > 0 ? "text-[11px] text-muted-foreground/50 block mt-0.5" : ""}
                    >
                      {line}
                    </span>
                  ))}
                </td>
                {[0, 1, 2, 3].map((ci) => {
                  const val = row.values[ci]
                  const isCheck = val === "✓" || val === "—"
                  const isEmph = ci === 2
                  return (
                    <td
                      key={ci}
                      className={`py-3 px-3 text-center ${
                        isCheck
                          ? val === "✓"
                            ? "text-primary"
                            : "text-muted-foreground/30"
                          : isEmph
                            ? "text-amber-400/90 font-medium"
                            : "text-foreground/80"
                      }`}
                    >
                      {val}
                    </td>
                  )
                })}
              </tr>,
            )

            return rows
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function PricingPage() {
  const [billing, setBilling] = useState<Billing>("monthly")
  const [region, setRegion] = useState<"in" | "int">("in")
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  return (
    <main className="min-h-screen bg-background dark relative">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      {/* Header */}
      <section className="pt-[140px] pb-12 md:pb-20 px-6">
        <div className="max-w-[900px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex justify-center mb-6">
              <div className="px-3 py-1 bg-primary/10 text-primary text-[12px] font-mono rounded-md">
                Pricing
              </div>
            </div>

            <h1 className="text-[32px] md:text-[56px] text-[#A1A1AA] leading-[1.1] mb-6 tracking-tight font-semibold">
              Simple, transparent pricing
            </h1>

            <p className="text-[16px] md:text-[18px] text-muted-foreground leading-relaxed max-w-[600px] mx-auto mb-10">
              Start free with DeepSeek credits and BYOK. Upgrade for app connectors,
              PR reviews, monthly credits, and larger cloud machines. No hidden fees.
            </p>

            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3">
              <span
                className={`text-[13px] font-mono transition-colors duration-200 ${
                  billing === "monthly" ? "text-foreground" : "text-muted-foreground/50"
                }`}
              >
                Monthly
              </span>
              <button
                onClick={() => setBilling(billing === "monthly" ? "yearly" : "monthly")}
                className="relative w-11 h-6 rounded-full bg-white/10 border border-white/10 transition-all duration-200 active:scale-[0.97]"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
                    billing === "yearly" ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span
                className={`text-[13px] font-mono transition-colors duration-200 ${
                  billing === "yearly" ? "text-foreground" : "text-muted-foreground/50"
                }`}
              >
                Yearly
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 rounded font-semibold">
                  Save up to 17%
                </span>
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Tier cards */}
      <section className="pb-20 md:pb-28 px-6">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {TIERS.map((tier, i) => (
            <PricingCard
              key={tier.name}
              tier={tier}
              index={i}
              billing={billing}
              region={region}
              onRegionChange={setRegion}
            />
          ))}
        </div>
      </section>

      {/* Monthly usage calculator — temporarily disabled
      <section id="usage-comparison" className="pb-20 md:pb-28 px-6 scroll-mt-24">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, translateY: 12 }}
            whileInView={{ opacity: 1, translateY: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="text-center mb-10">
              <h2 className="text-[22px] md:text-[28px] text-foreground font-semibold tracking-tight mb-3">
                Monthly usage comparison
              </h2>
              <p className="text-[14px] text-muted-foreground max-w-[560px] mx-auto leading-relaxed">
                Pick a VM size and hours. Compare Nova credits and plan cost against Capy and Devin.
              </p>
            </div>
            <UsageComparisonCalculator />
          </motion.div>
        </div>
      </section>
      */}

      {/* Comparison table */}
      <section className="pb-20 md:pb-28 px-6">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, translateY: 12 }}
            whileInView={{ opacity: 1, translateY: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="text-center mb-12">
              <h2 className="text-[22px] md:text-[28px] text-foreground font-semibold tracking-tight mb-3">
                Every plan. Side by side.
              </h2>
              <p className="text-[14px] text-muted-foreground max-w-[550px] mx-auto leading-relaxed">
                Every feature. Every limit. Every model. Exactly what you get on each
                plan.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 md:p-8">
              <ComparisonTable />

              <div className="mt-6 pt-5 border-t border-border/50">
                <p className="text-[12px] text-muted-foreground/50 font-mono">
                  Need a side-by-side per-model breakdown?{" "}
                  <Link
                    href="/docs"
                    className="text-primary hover:underline underline-offset-2"
                  >
                    See full pricing & limits docs
                  </Link>
                  .
                </p>
              </div>
            </div>

            <div className="mt-16 text-center mb-10">
              <h2 className="text-[22px] md:text-[28px] text-foreground font-semibold tracking-tight mb-3">
                Nova vs Devin vs Capy
              </h2>
              <p className="text-[14px] text-muted-foreground max-w-[560px] mx-auto leading-relaxed">
                Free, ~$20, and ~$100 — how Nova stacks up on price and features.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 md:p-8">
              <CompetitorCompareTable />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Enterprise section */}
      <section className="pb-20 md:pb-28 px-6">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, translateY: 12 }}
            whileInView={{ opacity: 1, translateY: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="rounded-xl border border-border bg-card p-8 md:p-12"
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
              <div className="max-w-md">
                <h2 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight mb-3">
                  Enterprise
                </h2>
                <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
                  Tailored pricing and infrastructure for organizations that need custom
                  credits, unlimited seats, dedicated support, and SLA guarantees.
                </p>
                <Link
                  href="https://cal.com/yash-dewasthale/chat-with-founder"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-medium font-mono bg-white/10 text-foreground hover:bg-white/15 border border-white/10 transition-all duration-200 active:scale-[0.97]"
                >
                  Contact Sales
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3">
                {ENTERPRISE_FEATURES.map((f) => (
                  <div key={f} className="flex items-start gap-3">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <span className="text-[13px] text-foreground/80">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-28 px-6">
        <div className="max-w-[700px] mx-auto">
          <h2 className="text-[22px] md:text-[28px] text-foreground font-semibold tracking-tight text-center mb-12">
            Frequently asked questions
          </h2>

          <div className="space-y-3">
            {FAQ.map((item, i) => {
              const isOpen = expandedFaq === i
              return (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-card overflow-hidden transition-all duration-200"
                >
                  <button
                    onClick={() => setExpandedFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-all duration-200 active:scale-[0.99]"
                  >
                    <span className="text-[14px] font-medium text-foreground font-mono">
                      {item.q}
                    </span>
                    <span
                      className={`text-muted-foreground text-lg transition-transform duration-200 shrink-0 ${
                        isOpen ? "rotate-45" : ""
                      }`}
                    >
                      +
                    </span>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-200 ${
                      isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <p className="px-5 pb-4 text-[13px] text-muted-foreground leading-relaxed">
                      {item.a}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
