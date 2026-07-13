"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import Link from "next/link"
import { Check, Minus, ArrowUpRight } from "lucide-react"

type Billing = "monthly" | "yearly"

interface TierStats {
  requests: string
  contextWindow: string
  tokens: string
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
    name: "Spark",
    price: {
      monthly: "$1",
      yearly: "$1",
    },
    period: "/year",
    badge: "Free for existing users",
    badgeClass: "text-emerald-400",
    description:
      "Open models, core features, standard limits. Just $1/year — fully refundable.",
    cta: "Get Started",
    href: "/download",
    popular: false,
    stats: {
      requests: "~15K requests/month",
      contextWindow: "32K",
      tokens: "Standard tokens",
      models: "Open models only",
    },
    features: [
      { label: "Open models only", included: true },
      { label: "32K context window", included: true },
      { label: "~15K requests/month", included: true },
      { label: "Standard token limits", included: true },
      { label: "Standard rate limits", included: true },
      { label: "Limited usage analytics", included: true },
      { label: "Discord community support", included: true },
      { label: "Memory (cross-session)", included: false },
      { label: "Merge.dev Agent Handler", included: false },
      { label: "Priority access", included: false },
    ],
  },
  {
    name: "Pro",
    price: {
      monthly: { indian: "$9", international: "$12" },
      yearly: { indian: "$100", international: "$140" },
    },
    period: "/month",
    badge: "Most popular",
    badgeClass: "text-amber-400",
    description:
      "Premium models, expanded context, cross-session memory, and Merge.dev Agent Handler.",
    cta: "Subscribe",
    href: "#",
    popular: true,
    stats: {
      requests: "~25K requests/month",
      contextWindow: "128K",
      tokens: "Higher tokens",
      models: "Open-source + premium",
    },
    features: [
      { label: "Open-source + premium models", included: true },
      { label: "128K context window", included: true },
      { label: "~25K requests/month", included: true },
      { label: "Higher token limits", included: true },
      { label: "Higher rate limits", included: true },
      { label: "Usage analytics", included: true },
      { label: "Discord community support", included: true },
      { label: "Memory (cross-session)", included: true },
      { label: "Merge.dev Agent Handler", included: true },
      { label: "Priority access", included: true },
    ],
  },
  {
    name: "Ultra",
    price: {
      monthly: "$100",
      yearly: "$1,000",
    },
    period: "/month",
    badge: "Maximum power",
    badgeClass: "text-purple-400",
    description:
      "Maximum context, unlimited requests, premium models, and the highest availability.",
    cta: "Subscribe",
    href: "#",
    popular: false,
    stats: {
      requests: "~110K requests/month",
      contextWindow: "1M",
      tokens: "Maximum tokens",
      models: "All models (unrestricted)",
    },
    features: [
      { label: "All models (unrestricted)", included: true },
      { label: "1M context window", included: true },
      { label: "~110K requests/month", included: true },
      { label: "Maximum token limits", included: true },
      { label: "Highest rate limits", included: true },
      { label: "Usage analytics", included: true },
      { label: "Priority support", included: true },
      { label: "Memory (cross-session)", included: true },
      { label: "Merge.dev Agent Handler", included: true },
      { label: "99.9% availability SLA", included: true },
    ],
  },
]

const ENTERPRISE_FEATURES = [
  "Custom credits & seats",
  "Unlimited team members",
  "Dedicated support engineer",
  "SLA guarantees & uptime",
  "Priority infrastructure",
  "Custom training & onboarding",
  "SSO / SAML",
  "On-premise deployment option",
]

const FAQ = [
  {
    q: "What does the Spark $1 deposit cover?",
    a: "Spark is $1/year for all new users — fully refundable. It is free for existing users. You can request a refund at any time.",
  },
  {
    q: "How does regional pricing work for Pro?",
    a: "We offer location-based pricing for the Pro plan. Indian users pay $9/month (or $100/year). International users pay $12/month (or $140/year). All other plans are priced uniformly worldwide.",
  },
  {
    q: "Can I upgrade or downgrade at any time?",
    a: "Yes. Your plan changes take effect immediately. Upgrades are prorated; downgrades credit your account for the remaining billing period.",
  },
  {
    q: "What models are available on each plan?",
    a: "Spark grants access to open-weight models (Llama, DeepSeek, Mistral, etc.). Pro adds premium models (Claude Opus, GPT-4o, Gemini Ultra) with expanded context. Ultra unlocks the full model catalog at maximum context.",
  },
  {
    q: "How does the Merge.dev Agent Handler work?",
    a: "Pro and Ultra plans include integration with Merge.dev's Agent Handler, giving your agents unified access to 100+ enterprise tools and APIs through a single interface.",
  },
  {
    q: "Is there a free trial for paid plans?",
    a: "Pro and Ultra come with a 7-day free trial. No credit card required to start. Cancel anytime during the trial — you won't be charged.",
  },
  {
    q: "What counts as a request?",
    a: "A request is a single call to a model (including streaming conversations, tool calls, and agent spawns). Token-based usage is tracked separately; see your dashboard for real-time limits.",
  },
]

function CheckIcon() {
  return <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
}

function MinusIcon() {
  return <Minus className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 mt-0.5" />
}

function formatPrice(price: TierPrice, billing: Billing): string {
  const p = billing === "monthly" ? price.monthly : price.yearly
  if (typeof p === "string") return p
  return p.indian
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
  values: [string, string, string]
}[] = [
  {
    section: "Usage",
    label: "Monthly credits included",
    values: ["$10", "$30", "$150"],
  },
  {
    label: "DeepSeek V4 Pro effective usage\nPermanent deal — credits go up to 4× further",
    values: ["~$40", "~$120", "~$600"],
  },
  {
    label: "MiniMax M3 effective usage\nPermanent deal — credits go up to 2.7× further",
    values: ["~$27", "~$80", "~$400"],
  },
  {
    label: "MiMo V2.5 effective usage\nPermanent deal — credits go up to 5× further",
    values: ["~$50", "~$150", "~$750"],
  },
  {
    label: "Typical request volume\nApprox, depends on chosen models",
    values: ["~15K", "~25K", "~110K"],
  },
  { label: "Roll-over unused credits", values: ["—", "✓", "✓"] },
  {
    section: "Models",
    label: "Open-source models (Llama, DeepSeek, Mistral, Qwen, etc.)",
    values: ["✓", "✓", "✓"],
  },
  {
    label: "Premium models (Claude Opus 4.8, GPT‑5, Gemini Ultra 2, etc.)",
    values: ["—", "✓", "✓"],
  },
  {
    label: "taste-1 — learns and applies your coding style",
    values: ["✓", "✓", "✓"],
  },
  {
    label: "Agent Handler (Merge.dev integration)",
    values: ["—", "✓", "✓"],
  },
  {
    section: "Performance",
    label: "Rate limits per minute",
    values: ["60 req/min", "300 req/min", "1,200 req/min"],
  },
  {
    label: "Context window per request",
    values: ["32K tokens", "128K tokens", "1M tokens"],
  },
  {
    label: "Concurrent requests",
    values: ["3", "10", "50"],
  },
  {
    label: "Auto top-up at API cost",
    values: ["—", "—", "✓"],
  },
  {
    section: "Analytics & support",
    label: "Usage dashboard",
    values: ["Limited", "Full", "Full + exports"],
  },
  {
    label: "Per-request cost & token breakdown",
    values: ["—", "✓", "✓"],
  },
  { label: "Discord community support", values: ["✓", "✓", "✓"] },
  { label: "Email support", values: ["—", "✓", "✓"] },
  { label: "Priority support (4h response)", values: ["—", "—", "✓"] },
  {
    section: "Privacy & security",
    label: "No training on your code",
    values: ["✓", "✓", "✓"],
  },
  {
    label: "Local-only taste storage",
    values: ["✓", "✓", "✓"],
  },
  {
    label: "SOC 2 compliance",
    values: ["—", "—", "✓"],
  },
  {
    label: "Cancel anytime — no lock-in",
    values: ["✓", "✓", "✓"],
  },
]

function PricingCard({
  tier,
  index,
  billing,
}: {
  tier: Tier
  index: number
  billing: Billing
}) {
  const effectiveBilling = tier.name === "Spark" ? "yearly" : billing
  const regional = isRegional(tier.price, effectiveBilling)

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
          {formatPrice(tier.price, effectiveBilling)}
        </span>
        <span className="text-sm text-muted-foreground font-mono">
          {formatPeriod(effectiveBilling)}
        </span>
        {regional && (
          <div className="text-[11px] text-muted-foreground/60 font-mono mt-1">
            <span className="text-foreground/70">
              {formatPrice(
                tier.price,
                effectiveBilling === "monthly" ? ("monthly" as Billing) : ("yearly" as Billing)
              )}
            </span>
            {" IN · "}
            <span className="text-foreground/70">
              {effectiveBilling === "monthly"
                ? (tier.price.monthly as { indian: string; international: string }).international
                : (tier.price.yearly as { indian: string; international: string }).international}
            </span>{" "}
            INT
          </div>
        )}
      </div>

      <h3 className="text-[15px] font-semibold text-foreground font-mono mt-5 mb-2">
        {tier.name}
      </h3>

      <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">
        {tier.description}
      </p>

      <div className="grid grid-cols-2 gap-2 mb-6 p-3 rounded-lg bg-white/[0.03] border border-white/5">
        <StatItem label="Requests" value={tier.stats.requests} />
        <StatItem label="Context" value={tier.stats.contextWindow} />
        <StatItem label="Tokens" value={tier.stats.tokens} />
        <StatItem label="Models" value={tier.stats.models} />
      </div>

      <Link
        href={tier.href}
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

function ComparisonTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] font-mono">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 pr-6 text-muted-foreground font-medium text-[12px] uppercase tracking-wider">
              Feature
            </th>
            {["Spark", "Pro", "Ultra"].map((name, i) => (
              <th
                key={name}
                className={`text-center py-3 px-4 font-medium text-[12px] uppercase tracking-wider ${
                  i === 1 ? "text-amber-400" : "text-muted-foreground"
                }`}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row, i) => {
            const prev = i > 0 ? COMPARE_ROWS[i - 1] : null
            const isNewSection = row.section && prev?.section !== row.section
            return (
              <tr
                key={i}
                className={`border-b border-border/50 transition-colors duration-150 hover:bg-white/[0.02]`}
              >
                {row.section && isNewSection ? (
                  <td
                    colSpan={4}
                    className="pt-6 pb-2 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider"
                  >
                    {row.section}
                  </td>
                ) : null}
              </tr>
            )
          })}
          {COMPARE_ROWS.map((row, i) => {
            const prev = i > 0 ? COMPARE_ROWS[i - 1] : null
            const isNewSection = row.section && prev?.section !== row.section
            if (isNewSection) return null
            return (
              <tr
                key={i}
                className="border-b border-border/50 transition-colors duration-150 hover:bg-white/[0.02]"
              >
                <td className="py-3 pr-6 text-foreground/70">
                  {row.label.split("\n").map((line, li) => (
                    <span key={li} className={li > 0 ? "text-[11px] text-muted-foreground/50 block mt-0.5" : ""}>
                      {line}
                    </span>
                  ))}
                </td>
                {[0, 1, 2].map((ci) => {
                  const val = row.values[ci]
                  const isCheck =
                    val === "✓" || val === "—"
                  const isEmph = ci === 1
                  return (
                    <td
                      key={ci}
                      className={`py-3 px-4 text-center ${
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
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function PricingPage() {
  const [billing, setBilling] = useState<Billing>("monthly")
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
              Start free with open models. Upgrade for higher limits, premium models,
              and enterprise features. No hidden fees.
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
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {TIERS.map((tier, i) => (
            <PricingCard key={tier.name} tier={tier} index={i} billing={billing} />
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="pb-20 md:pb-28 px-6">
        <div className="max-w-[1000px] mx-auto">
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
                  </Link>{" "}
                  or open the{" "}
                  <Link
                    href="/usage-calculator"
                    className="text-primary hover:underline underline-offset-2"
                  >
                    usage calculator
                  </Link>
                  .
                </p>
              </div>
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
