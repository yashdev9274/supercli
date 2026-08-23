import prisma from "./prisma"

/** Ordered tier levels for comparison: higher index = more access */
const TIER_ORDER = ["spark", "spark-premium", "pro", "ultra"] as const
type Tier = (typeof TIER_ORDER)[number]

type ModelRow = { slug: string; minTier: string }

/**
 * Static catalog mirroring prisma/seed.ts.
 * Used when the Model table is empty, unreachable, or missing a newly shipped
 * slug (e.g. stealth/ox-alpha before prod seed runs). Without this, unknown
 * open models hard-deny grandfathered Spark users even though the CLI exposes
 * them in the picker.
 */
const STATIC_MODEL_CATALOG: ModelRow[] = [
  // Spark / open
  { slug: "deepseek-v4-flash", minTier: "spark" },
  { slug: "deepseek/deepseek-v4-flash", minTier: "spark" },
  { slug: "hy3", minTier: "spark" },
  { slug: "MiniMax-M3", minTier: "spark" },
  { slug: "minimax-m3", minTier: "spark" },
  { slug: "mimo-v2.5", minTier: "spark" },
  { slug: "stealth/ox-alpha", minTier: "spark" },
  { slug: "ox-alpha", minTier: "spark" },
  { slug: "kimi-k2-6", minTier: "spark" },
  { slug: "kimi-k2-7-code", minTier: "spark" },
  { slug: "kimi-k3", minTier: "spark" },
  { slug: "glm-5.2", minTier: "spark" },
  { slug: "glm-5.1", minTier: "spark" },
  { slug: "gemini-2.5-flash", minTier: "spark" },
  { slug: "meta/llama-3.3-70b-instruct", minTier: "spark" },
  { slug: "orcarouter/auto", minTier: "spark" },
  // Pro
  { slug: "anthropic/claude-sonnet-4.6", minTier: "pro" },
  { slug: "anthropic/claude-opus-4.7", minTier: "pro" },
  { slug: "openai/gpt-5", minTier: "pro" },
  { slug: "openai/gpt-4.1", minTier: "pro" },
  { slug: "google/gemini-2.5-pro", minTier: "pro" },
  // Ultra catch-alls are still gated via DB when present
]

let modelCache: ModelRow[] | null = null

function findModel(models: ModelRow[], modelSlug: string): ModelRow | undefined {
  const normalized = modelSlug.trim().toLowerCase()
  if (!normalized) return undefined

  // 1. Exact match first (avoid over-broad includes)
  const exact = models.find((m) => m.slug.toLowerCase() === normalized)
  if (exact) return exact

  // 2. Provider/slug suffix: "openrouter/stealth/ox-alpha" → "stealth/ox-alpha"
  const bySuffix = models.find((m) => {
    const slug = m.slug.toLowerCase()
    return normalized.endsWith(`/${slug}`) || normalized.endsWith(slug)
  })
  if (bySuffix) return bySuffix

  // 3. Bare name match: "ox-alpha" ↔ "stealth/ox-alpha"
  const bare = normalized.includes("/") ? normalized.split("/").pop()! : normalized
  const byBare = models.find((m) => {
    const slug = m.slug.toLowerCase()
    const slugBare = slug.includes("/") ? slug.split("/").pop()! : slug
    return slugBare === bare || slug === bare || slug.endsWith(`/${bare}`)
  })
  if (byBare) return byBare

  return undefined
}

/**
 * Open / free cloud models that ship in the CLI picker for Spark users.
 * If the DB row is missing entirely, still allow these on spark+ tiers so a
 * stale production seed cannot lock grandfathered users out of free models.
 */
function isKnownOpenModelSlug(modelSlug: string): boolean {
  const n = modelSlug.trim().toLowerCase()
  if (!n) return false
  if (n.includes("stealth/") || n.endsWith("ox-alpha") || n === "ox-alpha") return true
  if (n.includes("deepseek")) return true
  if (n.includes("minimax") || n === "minimax-m3") return true
  if (n === "hy3" || n.includes("hunyuan")) return true
  if (n.includes("mimo")) return true
  if (n.startsWith("kimi-") || n.includes("kimi/")) return true
  if (n.startsWith("glm-")) return true
  if (n === "gemini-2.5-flash" || n.endsWith("/gemini-2.5-flash")) return true
  if (n.includes("llama-3.3") || n.includes("llama3.3")) return true
  if (n.includes("orcarouter")) return true
  return false
}

async function ensureCache(): Promise<ModelRow[]> {
  if (modelCache) return modelCache
  try {
    const rows = await prisma.model.findMany({
      where: { active: true },
      select: { slug: true, minTier: true },
    })
    // Merge DB over static defaults so newly seeded rows win, but missing
    // production rows still resolve via STATIC_MODEL_CATALOG.
    const bySlug = new Map<string, ModelRow>()
    for (const m of STATIC_MODEL_CATALOG) bySlug.set(m.slug.toLowerCase(), m)
    for (const m of rows) bySlug.set(m.slug.toLowerCase(), m)
    modelCache = Array.from(bySlug.values())
  } catch (error) {
    console.error("[model-access] Failed to load model cache, using static catalog:", error)
    modelCache = [...STATIC_MODEL_CATALOG]
  }
  return modelCache
}

export function tierIndex(tier: string): number {
  const i = TIER_ORDER.indexOf(tier as Tier)
  return i === -1 ? -1 : i
}

/**
 * Checks whether a model slug is allowed for the user's plan tier.
 * Model gating is backed by the `Model` table's `minTier` field, with a
 * static fallback catalog so missing seed rows / DB blips don't lock users
 * out of free open models (e.g. stealth/ox-alpha on Spark Grandfathered).
 *
 * Tier ladder: spark < spark-premium < pro < ultra
 * Open models use minTier "spark" so both Spark and Spark Premium get them.
 */
export async function isModelAllowedForTier(
  modelSlug: string,
  userTier: string,
): Promise<boolean> {
  try {
    const models = await ensureCache()
    const model = findModel(models, modelSlug)

    if (model) {
      return tierIndex(userTier) >= tierIndex(model.minTier)
    }

    // DB + static catalog miss: still allow known open/free cloud slugs on
    // spark+ so a lagging production seed cannot break the free tier.
    if (isKnownOpenModelSlug(modelSlug) && tierIndex(userTier) >= tierIndex("spark")) {
      console.warn(
        `[model-access] Allowing unlisted open model "${modelSlug}" for tier "${userTier}" (static open-model fallback)`,
      )
      return true
    }

    return false
  } catch (error) {
    console.error("[model-access] Failed to resolve model access:", error)
    // Infra failure: fail open for known open models only; never unlock pro.
    if (isKnownOpenModelSlug(modelSlug) && tierIndex(userTier) >= tierIndex("spark")) {
      return true
    }
    return false
  }
}

export function getUpgradeSuggestion(userTier: string): string {
  if (tierIndex(userTier) < tierIndex("spark-premium")) {
    return "To access more open models and higher limits, run /upgrade (Spark Premium)"
  }
  if (tierIndex(userTier) < tierIndex("pro")) {
    return "To access premium models (Claude, GPT, etc.), run /upgrade"
  }
  if (tierIndex(userTier) < tierIndex("ultra")) {
    return "To access all models unrestricted, run /upgrade"
  }
  return ""
}

/** Invalidate cache when the Model table changes (e.g. after seeding) */
export function invalidateModelCache(): void {
  modelCache = null
}
