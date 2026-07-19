export type ModelPricing = {
  inputPrice: number
  outputPrice: number
  cachedPrice: number
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gemini-2.5-flash":          { inputPrice: 0.15,   outputPrice: 0.60,   cachedPrice: 0.025 },
  "gemini-2.5-pro":            { inputPrice: 1.25,   outputPrice: 10.00,  cachedPrice: 0.3125 },
  "openai/gpt-oss-120b:free":  { inputPrice: 0,      outputPrice: 0,      cachedPrice: 0 },
  "deepseek-v4-flash":         { inputPrice: 0.15,   outputPrice: 0.60,   cachedPrice: 0 },
  "deepseek/deepseek-v4-flash": { inputPrice: 0.15,  outputPrice: 0.60,   cachedPrice: 0 },
  "deepseek-ai/deepseek-v4-flash": { inputPrice: 0.15, outputPrice: 0.60, cachedPrice: 0 },
  "MiniMax-M2":                { inputPrice: 0.15,   outputPrice: 0.60,   cachedPrice: 0.025 },
  "MiniMax-M3":                { inputPrice: 0.20,   outputPrice: 0.80,   cachedPrice: 0.04 },
  "MiniMax-M2.5":              { inputPrice: 0.15,   outputPrice: 0.60,   cachedPrice: 0.025 },
  "minimaxai/minimax-m3":   { inputPrice: 0.20,   outputPrice: 0.80,   cachedPrice: 0 },
  "minimax/minimax-m3":       { inputPrice: 0.20,   outputPrice: 0.80,   cachedPrice: 0 },
  "minimax/minimax-m3.5":     { inputPrice: 0.25,   outputPrice: 1.00,   cachedPrice: 0 },
  "minimax/minimax-m2.5":     { inputPrice: 0.15,   outputPrice: 0.60,   cachedPrice: 0 },
  "kimi-k2-6":                { inputPrice: 0.15,   outputPrice: 0.60,   cachedPrice: 0 },
  "moonshotai/kimi-k2.6":     { inputPrice: 0.15,   outputPrice: 0.60,   cachedPrice: 0 },
  "glm-5.2":                  { inputPrice: 0.10,   outputPrice: 0.40,   cachedPrice: 0 },
  "glm-5.1":                  { inputPrice: 0.10,   outputPrice: 0.40,   cachedPrice: 0 },
  "z-ai/glm-5.1":             { inputPrice: 0.10,   outputPrice: 0.40,   cachedPrice: 0 },
  "minimax-m3":               { inputPrice: 0.20,   outputPrice: 0.80,   cachedPrice: 0 },
  "meta/llama-3.3-70b-instruct": { inputPrice: 0.59, outputPrice: 0.99, cachedPrice: 0 },
  "anthropic/claude-fable-5": { inputPrice: 10.00, outputPrice: 50.00, cachedPrice: 1.00 },
  "anthropic/claude-opus-4-8": { inputPrice: 5.00, outputPrice: 25.00, cachedPrice: 0.50 },
  "anthropic/claude-opus-4-7": { inputPrice: 5.00, outputPrice: 25.00, cachedPrice: 0.50 },
  "openai/gpt-5.5":          { inputPrice: 5.00,   outputPrice: 30.00,  cachedPrice: 0.50 },
  "anthropic/claude-sonnet-4.6": { inputPrice: 3.00, outputPrice: 15.00, cachedPrice: 0.30 },
  "anthropic/claude-opus-4.7": { inputPrice: 5.00,  outputPrice: 25.00, cachedPrice: 0.50 },
  "deepseek/deepseek-chat":  { inputPrice: 0.15,   outputPrice: 0.60,   cachedPrice: 0 },
  "deepseek/deepseek-reasoner": { inputPrice: 0.50, outputPrice: 2.00,  cachedPrice: 0 },
  "grok/grok-4-fast-reasoning": { inputPrice: 1.00, outputPrice: 5.00,  cachedPrice: 0 },
  "orcarouter/auto":         { inputPrice: 0,      outputPrice: 0,      cachedPrice: 0 },
}

export function computeCost(model: string, inputTokens: number, outputTokens: number, cachedInputTokens: number): number {
  const pricing = lookupPricing(model)
  if (!pricing) return 0
  return (
    (inputTokens / 1_000_000) * pricing.inputPrice +
    (outputTokens / 1_000_000) * pricing.outputPrice +
    (cachedInputTokens / 1_000_000) * pricing.cachedPrice
  )
}

export function lookupPricing(model: string): ModelPricing | null {
  const exact = MODEL_PRICING[model]
  if (exact) return exact
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key) || key.includes(model)) return pricing
  }
  return null
}

export function getProviderDisplayNameFromRaw(raw: string): string {
  const map: Record<string, string> = {
    concentrateai: "ConcentrateAI",
    openrouter: "OpenRouter",
    google: "Google",
    nvidia: "NVIDIA",
    minimax: "MiniMax",
    mergedev: "Merge Dev",
    orcarouter: "OrcaRouter",
  }
  return map[raw] ?? raw
}

export const PROVIDER_COLORS: Record<string, string> = {
  concentrateai: "#f43f5e",
  openrouter: "#8b5cf6",
  google: "#3b82f6",
  nvidia: "#75e02e",
  minimax: "#06b6d4",
  mergedev: "#f59e0b",
  orcarouter: "#2563eb",
  other: "#6b7280",
}

export function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider] ?? PROVIDER_COLORS["other"] ?? "#6b7280"
}
