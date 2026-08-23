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
    name: "Spark (Grandfathered)",
    description: "Free plan for existing users — open models, standard limits.",
    variant: null,
    interval: null,
    priceCents: 0,
    currency: "USD",
    requestLimit: 10000,
    contextLimit: 16000,
    modelAccess: "open",
    creditAmountCents: 500,
    dodoProductId: null,
    sortOrder: 1,
  },
  {
    tier: "spark-premium",
    name: "Spark Premium",
    description: "Open models, higher limits, $10 in monthly credits.",
    variant: null,
    interval: "month",
    priceCents: 100,
    currency: "USD",
    requestLimit: 15000,
    contextLimit: 32000,
    modelAccess: "open",
    creditAmountCents: 1000,
    dodoProductId: DODO_PRODUCT_IDS.sparkPremium,
    sortOrder: 2,
  },
  {
    tier: "pro",
    name: "Pro Monthly (India)",
    description: "Premium models, 128K context, $30 in monthly credits.",
    variant: "in",
    interval: "month",
    priceCents: 65900,
    currency: "INR",
    requestLimit: 25000,
    contextLimit: 128000,
    modelAccess: "premium",
    creditAmountCents: 3000,
    dodoProductId: DODO_PRODUCT_IDS.proMonthlyIn,
    sortOrder: 3,
  },
  {
    tier: "pro",
    name: "Pro Monthly (International)",
    description: "Premium models, 128K context, $30 in monthly credits.",
    variant: "int",
    interval: "month",
    priceCents: 1200,
    currency: "USD",
    requestLimit: 25000,
    contextLimit: 128000,
    modelAccess: "premium",
    creditAmountCents: 3000,
    dodoProductId: DODO_PRODUCT_IDS.proMonthlyInt,
    sortOrder: 4,
  },
  {
    tier: "pro",
    name: "Pro Yearly (India)",
    description: "Premium models, 128K context, $30 in monthly credits.",
    variant: "in",
    interval: "year",
    priceCents: 770000, // ₹7,700
    currency: "INR",
    requestLimit: 25000,
    contextLimit: 128000,
    modelAccess: "premium",
    creditAmountCents: 3000,
    dodoProductId: DODO_PRODUCT_IDS.proYearlyIn,
    sortOrder: 5,
  },
  {
    tier: "pro",
    name: "Pro Yearly (International)",
    description: "Premium models, 128K context, $30 in monthly credits.",
    variant: "int",
    interval: "year",
    priceCents: 14000,
    currency: "USD",
    requestLimit: 25000,
    contextLimit: 128000,
    modelAccess: "premium",
    creditAmountCents: 3000,
    dodoProductId: DODO_PRODUCT_IDS.proYearlyInt,
    sortOrder: 6,
  },
  {
    tier: "ultra",
    name: "Ultra Monthly",
    description: "All models, 1M context, $150 in monthly credits.",
    variant: null,
    interval: "month",
    priceCents: 10000,
    currency: "USD",
    requestLimit: 110000,
    contextLimit: 1048576,
    modelAccess: "all",
    creditAmountCents: 15000,
    dodoProductId: DODO_PRODUCT_IDS.ultraMonthly,
    sortOrder: 7,
  },
  {
    tier: "ultra",
    name: "Ultra Yearly",
    description: "All models, 1M context, $150 in monthly credits.",
    variant: null,
    interval: "year",
    priceCents: 100000,
    currency: "USD",
    requestLimit: 110000,
    contextLimit: 1048576,
    modelAccess: "all",
    creditAmountCents: 15000,
    dodoProductId: DODO_PRODUCT_IDS.ultraYearly,
    sortOrder: 8,
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

async function main() {
  console.log("Seeding plans...")

  for (const plan of PLANS) {
    if (plan.dodoProductId) {
      // Look up by stable key (tier + variant + interval) so switching
      // DODO_MODE between test/live updates the same row instead of
      // creating a duplicate.
      const existing = await prisma.plan.findFirst({
        where: {
          tier: plan.tier,
          variant: plan.variant ?? null,
          interval: plan.interval ?? null,
        },
      })
      if (existing) {
        await prisma.plan.update({ where: { id: existing.id }, data: plan })
      } else {
        await prisma.plan.create({ data: plan })
      }
    } else {
      const existing = await prisma.plan.findFirst({
        where: { tier: "spark", name: "Spark (Grandfathered)" },
      })
      if (existing) {
        await prisma.plan.update({ where: { id: existing.id }, data: plan })
      } else {
        await prisma.plan.create({ data: plan })
      }
    }
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
