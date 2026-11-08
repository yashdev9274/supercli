export type BillingCycle = "monthly" | "yearly"
export type Region = "in" | "int"
export type TierName = "Free" | "Spark" | "Pro" | "Ultra"

export type RegionalPrice = {
  indian: string
  international: string
}

export type TierPrice = {
  monthly: string | RegionalPrice
  yearly: string | RegionalPrice
}

export type TierCredit = {
  monthly: string | RegionalPrice
  yearly: string | RegionalPrice
}

export type Tier = {
  name: TierName
  badge: string
  badgeClass: string
  description: string
  price: TierPrice
  credits: TierCredit
  popular: boolean
  features: string[]
  creditsLabel: string
  /** CTA label and target for the modal */
  ctaLabel: string
  ctaHref: string
  /** Pricing accent color used in the modal card border */
  accent: string
}

export const TIERS: Tier[] = [
  {
    name: "Free",
    badge: "Free to start",
    badgeClass: "text-emerald-400",
    description:
      "1,000 monthly credits shared across DeepSeek, cloud machines, and app queries, plus free BYOK and subscription connections.",
    price: {
      monthly: "$0",
      yearly: "$0",
    },
    credits: {
      monthly: "1,000 credits / month",
      yearly: "1,000 credits / month",
    },
    popular: false,
    features: [
      "1,000 monthly credits — DeepSeek with 1M context",
      "Free bring-your-own API keys (BYOK)",
      "Connect Codex / Claude / OpenCode subs — free",
      "1 vCPU / 4 GB RAM cloud machines",
      "Unlimited members",
      "Discord community support",
    ],
    creditsLabel: "1,000 monthly credits",
    ctaLabel: "Continue free",
    ctaHref: "https://nova.supercodeai.tech",
    accent: "emerald",
  },
  {
    name: "Spark",
    badge: "For getting started",
    badgeClass: "text-emerald-400",
    description:
      "Everything in Free, plus $5 credits, app connectors, and limited PR reviews.",
    price: {
      monthly: { indian: "₹449", international: "$5" },
      yearly: { indian: "₹4,490", international: "$50" },
    },
    credits: {
      monthly: "$5 credits",
      yearly: "$50 credits",
    },
    popular: false,
    features: [
      "Everything in Free",
      "$5 monthly credits (INT & IN)",
      "Connect Codex / Claude / OpenCode subs — free",
      "Open Source models (weekly / monthly usage)",
      "Free bring-your-own API keys (BYOK)",
      "Up to 2 vCPU / 8 GB RAM cloud machines",
      "App connectors",
      "Monthly limited PR reviews",
      "Unlimited members",
    ],
    creditsLabel: "$5 credits",
    ctaLabel: "Choose Spark",
    ctaHref: "https://nova.supercodeai.tech/settings/billing?plan=spark",
    accent: "neutral",
  },
  {
    name: "Pro",
    badge: "Most popular",
    badgeClass: "text-amber-400",
    description: "Everything in Spark, plus frontier models, $25/$20 credits, and machines up to 4 vCPU / 16 GB.",
    price: {
      monthly: { indian: "₹1,549", international: "$20" },
      yearly: { indian: "₹18,500", international: "$100" },
    },
    credits: {
      monthly: { indian: "$20", international: "$25" },
      yearly: { indian: "$200", international: "$250" },
    },
    popular: true,
    features: [
      "Everything in Spark",
      "$25 credits (INT) / $20 credits (IN)",
      "Connect Codex / Claude / OpenCode subs — free",
      "Frontier models (weekly / monthly usage)",
      "Free bring-your-own API keys (BYOK)",
      "Up to 4 vCPU / 16 GB RAM",
      "App connectors",
      "Monthly PR reviews",
      "Usage analytics",
    ],
    creditsLabel: "$25 INT / $20 IN credits",
    ctaLabel: "Choose Pro",
    ctaHref: "https://nova.supercodeai.tech/settings/billing?plan=pro",
    accent: "amber",
  },
  {
    name: "Ultra",
    badge: "For daily shipping",
    badgeClass: "text-purple-400",
    description: "Everything in Pro, plus $110 credits, unlimited PR reviews, and machines up to 16 vCPU / 64 GB.",
    price: {
      monthly: "$100",
      yearly: "$1,000",
    },
    credits: {
      monthly: "$110 credits",
      yearly: "$1,100 credits",
    },
    popular: false,
    features: [
      "Everything in Pro",
      "$110 monthly credits",
      "Connect Codex / Claude / OpenCode subs — free",
      "Frontier models (weekly / monthly usage)",
      "Free bring-your-own API keys (BYOK)",
      "Up to 16 vCPU / 64 GB RAM",
      "App connectors",
      "Unlimited PR reviews",
      "Priority support",
      "Usage analytics + exports",
    ],
    creditsLabel: "$110 credits",
    ctaLabel: "Choose Ultra",
    ctaHref: "https://nova.supercodeai.tech/settings/billing?plan=ultra",
    accent: "purple",
  },
]

export function formatPrice(
  price: TierPrice,
  billing: BillingCycle,
  region: Region,
): string {
  const value = billing === "monthly" ? price.monthly : price.yearly
  if (typeof value === "string") return value
  return region === "in" ? value.indian : value.international
}

export function formatCredits(
  credits: TierCredit,
  billing: BillingCycle,
  region: Region,
): string {
  const value = billing === "monthly" ? credits.monthly : credits.yearly
  if (typeof value === "string") return value
  return region === "in" ? value.indian : value.international
}

export function isRegional(price: TierPrice, billing: BillingCycle): boolean {
  const value = billing === "monthly" ? price.monthly : price.yearly
  return typeof value !== "string"
}

export function billingPeriodLabel(billing: BillingCycle): string {
  return billing === "monthly" ? "/month" : "/month, billed yearly"
}

/** Tier colour tokens reused across the pricing UI. */
export const TIER_ACCENTS: Record<Tier["accent"], { ring: string; bg: string; pillBg: string }> = {
  emerald: {
    ring: "ring-emerald-500/40",
    bg: "from-emerald-500/10 via-emerald-500/[0.03] to-transparent",
    pillBg: "bg-emerald-500/[0.08] text-emerald-300 ring-1 ring-emerald-400/30",
  },
  neutral: {
    ring: "ring-white/15",
    bg: "from-white/[0.07] via-white/[0.02] to-transparent",
    pillBg: "bg-white/[0.04] text-white/80 ring-1 ring-white/10",
  },
  amber: {
    ring: "ring-amber-500/40",
    bg: "from-amber-500/15 via-amber-500/[0.04] to-transparent",
    pillBg: "bg-amber-500 text-black",
  },
  purple: {
    ring: "ring-purple-500/40",
    bg: "from-purple-500/15 via-purple-500/[0.04] to-transparent",
    pillBg: "bg-purple-500/[0.1] text-purple-200 ring-1 ring-purple-400/30",
  },
}
