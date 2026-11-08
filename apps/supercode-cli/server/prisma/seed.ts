// apps/supercode-cli/server/prisma/seed.ts
// Run: bun run prisma/seed.ts
import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated"

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_TERMINAL || process.env.DATABASE_URL,
})

const prisma = new PrismaClient({ adapter })

const isTest = process.env.DODO_MODE === "test"

const DODO_PRODUCT_IDS = {
  sparkPremium: isTest
    ? "pdt_0Nk0u6EggnAdDxGtoLa1W"
    : "pdt_0NkW4k2cUeO1f7a8yLje5",
  proMonthlyIn: isTest
    ? "pdt_0NkRjph71bwF2z3aBulCG"
    : "pdt_0NkW59I3J7uy2m1j0RAOF",
  proMonthlyInt: isTest
    ? "pdt_0Nk0vS5WMtkT7u2T7P70e"
    : "pdt_0NkW5Vvq7Uxw55sjMlDFe",
  proYearlyIn: isTest
    ? "pdt_0NkRm62YJBP043k9sEDab"
    : "pdt_0NkW5s9M64jbHMoKrIpsl",
  proYearlyInt: isTest
    ? "pdt_0Nk0vwfI1kYrDaRsQzEUQ"
    : "pdt_0NkW6PfRqqooJXIMaX4Ci",
  ultraMonthly: isTest
    ? "pdt_0NkRmfmsthQToUr41UAnd"
    : "pdt_0NkW6cjti170KbFpeolfw",
  ultraYearly: isTest
    ? "pdt_0NkRmxBRNTOME3FYF9Qkg"
    : "pdt_0NkW6tnjud9Sp1iGr9TXj",
} as const

console.log(`[seed] DODO_MODE=${process.env.DODO_MODE ?? "live"} — using ${isTest ? "test" : "live"} product IDs`)

const PLANS = [
  {
    tier: "spark",
    name: "Free",
    description: "1000 product credits per month, free BYOK, free Codex/Claude/OpenCode connect, 1 vCPU / 4 GB. 16K context, with 1M context for native DeepSeek V4 Flash only.",
    variant: null,
    interval: null,
    priceCents: 0,
    currency: "USD",
    requestLimit: 10000,
    contextLimit: 16000,
    modelAccess: "open",
    creditAmountCents: 1000,
    monthlyCredits: 1000,
    dodoProductId: null,
    sortOrder: 1,
  },
  {
    tier: "spark-premium",
    name: "Spark Monthly (India)",
    description: "Everything in Free, plus $5 credits, open-source models, connectors, limited PR reviews, up to 2 vCPU / 8 GB.",
    variant: "in",
    interval: "month",
    priceCents: 44900,
    currency: "INR",
    requestLimit: 15000,
    contextLimit: 32000,
    modelAccess: "open",
    creditAmountCents: 500,
    monthlyCredits: 500,
    dodoProductId: DODO_PRODUCT_IDS.sparkPremium,
    sortOrder: 2,
  },
  {
    tier: "spark-premium",
    name: "Spark Monthly (International)",
    description: "Everything in Free, plus $5 credits, open-source models, connectors, limited PR reviews, up to 2 vCPU / 8 GB.",
    variant: "int",
    interval: "month",
    priceCents: 500,
    currency: "USD",
    requestLimit: 15000,
    contextLimit: 32000,
    modelAccess: "open",
    creditAmountCents: 500,
    monthlyCredits: 500,
    dodoProductId: DODO_PRODUCT_IDS.sparkPremium,
    sortOrder: 3,
  },
  {
    tier: "pro",
    name: "Pro Monthly (India)",
    description: "Everything in Spark, plus frontier models, $20 credits, up to 4 vCPU / 16 GB.",
    variant: "in",
    interval: "month",
    priceCents: 154900,
    currency: "INR",
    requestLimit: 25000,
    contextLimit: 128000,
    modelAccess: "premium",
    creditAmountCents: 2000,
    monthlyCredits: 2000,
    dodoProductId: DODO_PRODUCT_IDS.proMonthlyIn,
    sortOrder: 4,
  },
  {
    tier: "pro",
    name: "Pro Monthly (International)",
    description: "Everything in Spark, plus frontier models, $25 credits, up to 4 vCPU / 16 GB.",
    variant: "int",
    interval: "month",
    priceCents: 2000,
    currency: "USD",
    requestLimit: 25000,
    contextLimit: 128000,
    modelAccess: "premium",
    creditAmountCents: 2500,
    monthlyCredits: 2500,
    dodoProductId: DODO_PRODUCT_IDS.proMonthlyInt,
    sortOrder: 5,
  },
  {
    tier: "pro",
    name: "Pro Yearly (India)",
    description: "Everything in Spark, plus frontier models, $20 credits, up to 4 vCPU / 16 GB.",
    variant: "in",
    interval: "year",
    priceCents: 1850000,
    currency: "INR",
    requestLimit: 25000,
    contextLimit: 128000,
    modelAccess: "premium",
    creditAmountCents: 2000,
    monthlyCredits: 2000,
    dodoProductId: DODO_PRODUCT_IDS.proYearlyIn,
    sortOrder: 6,
  },
  {
    tier: "pro",
    name: "Pro Yearly (International)",
    description: "Everything in Spark, plus frontier models, $25 credits, up to 4 vCPU / 16 GB.",
    variant: "int",
    interval: "year",
    priceCents: 20000,
    currency: "USD",
    requestLimit: 25000,
    contextLimit: 128000,
    modelAccess: "premium",
    creditAmountCents: 2500,
    monthlyCredits: 2500,
    dodoProductId: DODO_PRODUCT_IDS.proYearlyInt,
    sortOrder: 7,
  },
  {
    tier: "ultra",
    name: "Ultra Monthly",
    description: "Everything in Pro, plus $110 credits, unlimited PR reviews, up to 16 vCPU / 64 GB.",
    variant: null,
    interval: "month",
    priceCents: 10000,
    currency: "USD",
    requestLimit: 110000,
    contextLimit: 1048576,
    modelAccess: "all",
    creditAmountCents: 11000,
    monthlyCredits: 11000,
    dodoProductId: DODO_PRODUCT_IDS.ultraMonthly,
    sortOrder: 8,
  },
  {
    tier: "ultra",
    name: "Ultra Yearly",
    description: "Everything in Pro, plus $110 credits, unlimited PR reviews, up to 16 vCPU / 64 GB.",
    variant: null,
    interval: "year",
    priceCents: 100000,
    currency: "USD",
    requestLimit: 110000,
    contextLimit: 1048576,
    modelAccess: "all",
    creditAmountCents: 11000,
    monthlyCredits: 11000,
    dodoProductId: DODO_PRODUCT_IDS.ultraYearly,
    sortOrder: 9,
  },
]

const MODELS = [
  // ── Spark / Spark Premium (minTier: "spark") — all open / cloud free models ──
  // Spark Premium uses the same open catalog (higher limits/credits); gating is by tier order.
  { slug: "deepseek-v4-flash",         displayName: "DeepSeek V4 Flash",       provider: "deepseek",   minTier: "spark", inputPrice: 0.15,  outputPrice: 0.60,  cachedPrice: 0 },
  { slug: "deepseek/deepseek-v4-flash", displayName: "DeepSeek V4 Flash (OR)",  provider: "openrouter", minTier: "spark", inputPrice: 0.15,  outputPrice: 0.60,  cachedPrice: 0 },
  { slug: "hy3",                       displayName: "Hunyuan Hy3",             provider: "supercode",  minTier: "spark", inputPrice: 0.15,  outputPrice: 0.60,  cachedPrice: 0 },
  { slug: "MiniMax-M3",                displayName: "MiniMax M3",               provider: "minimax",    minTier: "spark", inputPrice: 0.20,  outputPrice: 0.80,  cachedPrice: 0.04 },
  // CLI cloud picker uses this slug; keep both so plan-gate matches either form
  { slug: "minimax-m3",                displayName: "MiniMax M3 (cloud)",       provider: "supercode",  minTier: "spark", inputPrice: 0.20,  outputPrice: 0.80,  cachedPrice: 0.04 },
  { slug: "mimo-v2.5",                displayName: "MiMo v2.5",                provider: "orcarouter", minTier: "spark", inputPrice: 0.15,  outputPrice: 0.60,  cachedPrice: 0 },
  // Single unique slug — both Supercode cloud and OpenRouter routes use this.
  // (slug is @unique; a second row with the same slug can never be upserted.)
  { slug: "stealth/ox-alpha",         displayName: "OX Alpha",                 provider: "supercode", minTier: "spark", inputPrice: 0,     outputPrice: 0,      cachedPrice: 0 },
  { slug: "kimi-k2-6",                 displayName: "Kimi K2.6",               provider: "openrouter", minTier: "spark", inputPrice: 0.15,  outputPrice: 0.60,  cachedPrice: 0 },
  { slug: "kimi-k2-7-code",           displayName: "Kimi K2.7 Code",           provider: "openrouter", minTier: "spark", inputPrice: 0.25,  outputPrice: 1.00,  cachedPrice: 0 },
  { slug: "kimi-k3",                   displayName: "Kimi K3",                  provider: "openrouter", minTier: "spark", inputPrice: 0.50,  outputPrice: 2.00,  cachedPrice: 0 },
  { slug: "glm-5.2",                   displayName: "GLM 5.2",                 provider: "openrouter", minTier: "spark", inputPrice: 0.10,  outputPrice: 0.40,  cachedPrice: 0 },
  { slug: "glm-5.1",                   displayName: "GLM 5.1",                 provider: "openrouter", minTier: "spark", inputPrice: 0.10,  outputPrice: 0.40,  cachedPrice: 0 },
  { slug: "gemini-2.5-flash",          displayName: "Gemini 2.5 Flash",        provider: "google",     minTier: "spark", inputPrice: 0.15,  outputPrice: 0.60,  cachedPrice: 0.025 },
  { slug: "meta/llama-3.3-70b-instruct", displayName: "Llama 3.3 70B",         provider: "openrouter", minTier: "spark", inputPrice: 0.59,  outputPrice: 0.99,  cachedPrice: 0 },
  { slug: "orcarouter/auto",           displayName: "OrcaRouter Auto",         provider: "orcarouter", minTier: "spark", inputPrice: 0,     outputPrice: 0,      cachedPrice: 0 },

  // ── Pro (minTier: "pro") — premium models ──
  { slug: "anthropic/claude-sonnet-4.6", displayName: "Claude Sonnet 4.6",     provider: "openrouter", minTier: "pro",   inputPrice: 3.00,  outputPrice: 15.00, cachedPrice: 0.30 },
  { slug: "anthropic/claude-opus-4.7",   displayName: "Claude Opus 4.7",     provider: "openrouter", minTier: "pro",   inputPrice: 5.00,  outputPrice: 25.00, cachedPrice: 0.50 },
  { slug: "anthropic/claude-opus-4-8",   displayName: "Claude Opus 4.8",     provider: "openrouter", minTier: "pro",   inputPrice: 5.00,  outputPrice: 25.00, cachedPrice: 0.50 },
  { slug: "anthropic/claude-opus-4-7",   displayName: "Claude Opus 4.7 (alt)", provider: "openrouter", minTier: "pro",   inputPrice: 5.00,  outputPrice: 25.00, cachedPrice: 0.50 },
  { slug: "openai/gpt-5.5",            displayName: "GPT 5.5",                 provider: "openrouter", minTier: "pro",   inputPrice: 5.00,  outputPrice: 30.00, cachedPrice: 0.50 },
  { slug: "grok/grok-4-fast-reasoning", displayName: "Grok 4 Fast Reasoning",  provider: "openrouter", minTier: "pro",   inputPrice: 1.00,  outputPrice: 5.00,  cachedPrice: 0 },
  { slug: "gemini-2.5-pro",            displayName: "Gemini 2.5 Pro",          provider: "google",     minTier: "pro",   inputPrice: 1.25,  outputPrice: 10.00, cachedPrice: 0.3125 },
  { slug: "deepseek/deepseek-reasoner", displayName: "DeepSeek Reasoner",       provider: "openrouter", minTier: "pro",   inputPrice: 0.50,  outputPrice: 2.00,  cachedPrice: 0 },
  { slug: "fireworks/nemotron-3-ultra-nvfp4", displayName: "Nemotron 3 Ultra", provider: "openrouter", minTier: "pro",   inputPrice: 0.60,  outputPrice: 2.40,  cachedPrice: 0.12 },

  // ── Ultra (minTier: "ultra") — top-tier frontier models ──
  { slug: "anthropic/claude-opus-5",   displayName: "Claude Opus 5",           provider: "openrouter", minTier: "ultra",  inputPrice: 5.00,  outputPrice: 25.00, cachedPrice: 0.50 },
  { slug: "anthropic/claude-fable-5",  displayName: "Claude Fable 5",          provider: "openrouter", minTier: "ultra",  inputPrice: 10.00, outputPrice: 50.00, cachedPrice: 1.00 },
  { slug: "minimax/minimax-m3.5",     displayName: "MiniMax M3.5",            provider: "minimax",    minTier: "ultra",  inputPrice: 0.25,  outputPrice: 1.00,  cachedPrice: 0 },
]

async function upsertPlan(plan: (typeof PLANS)[number]) {
  // Prefer exact regional key (tier + variant + interval)
  let existing = await prisma.plan.findFirst({
    where: {
      tier: plan.tier,
      variant: plan.variant ?? null,
      interval: plan.interval ?? null,
    },
  })

  // Migrate legacy single-row plans (null variant) once per tier+interval+currency
  if (!existing && plan.variant) {
    existing = await prisma.plan.findFirst({
      where: {
        tier: plan.tier,
        interval: plan.interval ?? null,
        variant: null,
        currency: plan.currency,
      },
    })
  }

  // dodoProductId is unique — free it from another row of the same tier if needed
  if (plan.dodoProductId) {
    const owner = await prisma.plan.findFirst({
      where: {
        dodoProductId: plan.dodoProductId,
        ...(existing ? { id: { not: existing.id } } : {}),
      },
    })
    if (owner && owner.tier === plan.tier) {
      await prisma.plan.update({
        where: { id: owner.id },
        data: { dodoProductId: null },
      })
    }
  }

  const data = { ...plan, active: true }

  if (existing) {
    // Avoid unique clash if another tier still owns this product id
    if (plan.dodoProductId) {
      const clash = await prisma.plan.findFirst({
        where: {
          dodoProductId: plan.dodoProductId,
          id: { not: existing.id },
        },
      })
      if (clash) {
        data.dodoProductId = null
      }
    }
    await prisma.plan.update({ where: { id: existing.id }, data })
    return existing.id
  }

  try {
    const created = await prisma.plan.create({ data })
    return created.id
  } catch {
    // Last resort: create without product id (checkout can be wired later)
    const created = await prisma.plan.create({
      data: { ...data, dodoProductId: null },
    })
    return created.id
  }
}

async function main() {
  console.log("Seeding plans...")

  const keptIds: string[] = []
  for (const plan of PLANS) {
    const id = await upsertPlan(plan)
    keptIds.push(id)
  }

  // Deactivate legacy / duplicate plan rows not in the current catalog
  const deactivated = await prisma.plan.updateMany({
    where: {
      id: { notIn: keptIds },
      active: true,
    },
    data: { active: false },
  })
  if (deactivated.count > 0) {
    console.log(`Deactivated ${deactivated.count} legacy plan row(s).`)
  }

  console.log(`Seeded ${PLANS.length} plans.`)

  console.log("Seeding models...")

  for (const model of MODELS) {
    await prisma.model.upsert({
      where: { slug: model.slug },
      update: model,
      create: model,
    })
  }

  console.log(`Seeded ${MODELS.length} models.`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
