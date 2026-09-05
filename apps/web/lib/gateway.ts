import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createGateway } from "ai"
import type { EmbeddingModel, LanguageModel } from "ai"

/**
 * Multi-provider LLM routing for reviews/embeddings:
 * 1. Vercel AI Gateway (`AI_GATEWAY_API_KEY` / OIDC)
 * 2. Merge Gateway (kept as fallback; free tier is tight)
 * 3. Direct provider keys (OPENAI / ANTHROPIC / GOOGLE) when gateways are
 *    rate-limited or free-tier blocked
 *
 * Call sites should use `chatModel()` / `embeddingModel()` / `gatewayProviderChain()`.
 *
 * @see https://vercel.com/docs/ai-gateway
 * @see https://docs.merge.dev/merge-gateway/get-started
 */

export type GatewayProviderName =
  | "vercel"
  | "merge"
  | "openai"
  | "anthropic"
  | "google"

function hasVercelKey() {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim(),
  )
}

function hasMergeKey() {
  return Boolean(process.env.MERGE_GATEWAY_API_KEY?.trim())
}

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

function hasAnthropicKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

function hasGoogleKey() {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim())
}

function resolvePreferredProvider(): GatewayProviderName {
  const raw = (process.env.AI_GATEWAY_PROVIDER ?? "").trim().toLowerCase()
  if (raw === "merge" || raw === "mergedev" || raw === "merge.dev") return "merge"
  if (raw === "vercel" || raw === "ai-gateway" || raw === "vercel-ai-gateway") {
    return "vercel"
  }
  if (raw === "openai") return "openai"
  if (raw === "anthropic") return "anthropic"
  if (raw === "google" || raw === "gemini") return "google"

  // Prefer Vercel when configured; otherwise Merge; otherwise direct keys.
  if (hasVercelKey()) return "vercel"
  if (hasMergeKey()) return "merge"
  if (hasOpenAIKey()) return "openai"
  if (hasAnthropicKey()) return "anthropic"
  if (hasGoogleKey()) return "google"
  return "vercel"
}

export const activeGatewayProvider: GatewayProviderName =
  resolvePreferredProvider()

/** Vercel AI Gateway (AI SDK native). */
export const vercelGateway = createGateway({
  apiKey:
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
    undefined,
})

/**
 * Merge Gateway via the AI SDK URL shim.
 * Must use `/v1/ai-sdk` (not bare `/v1`) so @ai-sdk/openai's Responses
 * payload shape is accepted.
 */
export const mergeGateway = createOpenAI({
  name: "merge",
  baseURL: "https://api-gateway.merge.dev/v1/ai-sdk",
  apiKey: process.env.MERGE_GATEWAY_API_KEY,
})

/** Direct OpenAI (bypasses gateway free-tier caps). */
export const openaiDirect = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/** Direct Anthropic. */
export const anthropicDirect = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/** Direct Google Generative AI. */
export const googleDirect = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
})

/**
 * Back-compat export: historically this was the Merge OpenAI shim.
 * Prefer `chatModel()` / `embeddingModel()` for new call sites.
 */
export const gateway = mergeGateway

/** Strip `provider/` prefix for direct SDK model ids. */
function bareModelId(modelId: string): string {
  const idx = modelId.indexOf("/")
  return idx >= 0 ? modelId.slice(idx + 1) : modelId
}

function providerForModelHint(modelId: string): GatewayProviderName | null {
  const lower = modelId.toLowerCase()
  if (lower.startsWith("openai/") || lower.startsWith("gpt-")) return "openai"
  if (lower.startsWith("anthropic/") || lower.startsWith("claude")) {
    return "anthropic"
  }
  if (
    lower.startsWith("google/") ||
    lower.startsWith("gemini") ||
    lower.startsWith("models/gemini")
  ) {
    return "google"
  }
  return null
}

export function chatModel(
  modelId: string,
  provider: GatewayProviderName = activeGatewayProvider,
): LanguageModel {
  if (provider === "vercel") {
    return vercelGateway(modelId)
  }
  if (provider === "merge") {
    // chat() is more portable across OpenAI-compatible shims than Responses.
    return mergeGateway.chat(modelId)
  }
  if (provider === "openai") {
    // Prefer chat completions for broad model support.
    return openaiDirect.chat(bareModelId(modelId))
  }
  if (provider === "anthropic") {
    return anthropicDirect(bareModelId(modelId))
  }
  // google
  return googleDirect(bareModelId(modelId))
}

export function embeddingModel(
  modelId: string,
  provider: GatewayProviderName = activeGatewayProvider,
): EmbeddingModel {
  if (provider === "vercel") {
    return vercelGateway.embeddingModel(modelId)
  }
  if (provider === "merge") {
    return mergeGateway.embeddingModel(modelId)
  }
  // Direct embeddings: OpenAI only for now (matches existing pinecone path).
  return openaiDirect.embedding(bareModelId(modelId))
}

function isProviderReady(provider: GatewayProviderName): boolean {
  switch (provider) {
    case "vercel":
      return hasVercelKey()
    case "merge":
      return hasMergeKey()
    case "openai":
      return hasOpenAIKey()
    case "anthropic":
      return hasAnthropicKey()
    case "google":
      return hasGoogleKey()
  }
}

/**
 * Providers to try (preferred first). Direct keys are appended last so
 * free-tier gateway limits do not hard-fail PR reviews.
 */
export function gatewayProviderChain(
  modelId?: string,
): GatewayProviderName[] {
  const preferred = activeGatewayProvider
  const chain: GatewayProviderName[] = []
  const seen = new Set<GatewayProviderName>()

  const push = (p: GatewayProviderName) => {
    if (seen.has(p)) return
    if (!isProviderReady(p) && p !== preferred) return
    // Always allow preferred even if key missing (surface a clear error).
    if (!isProviderReady(p) && p === preferred && chain.length > 0) return
    seen.add(p)
    chain.push(p)
  }

  push(preferred)

  // Other gateway
  if (preferred !== "vercel") push("vercel")
  if (preferred !== "merge") push("merge")

  // Direct providers — prefer the one matching the model slug when known.
  const hint = modelId ? providerForModelHint(modelId) : null
  if (hint) push(hint)
  push("openai")
  push("anthropic")
  push("google")

  return chain.length > 0 ? chain : ["vercel"]
}

/** Whether a chat model id is meaningful on this provider. */
export function providerSupportsModel(
  provider: GatewayProviderName,
  modelId: string,
): boolean {
  if (modelId === "default_routing") {
    // Merge-only sentinel for org routing policy.
    return provider === "merge"
  }
  if (provider === "vercel" || provider === "merge") return true

  const hint = providerForModelHint(modelId)
  if (!hint) {
    // Unknown slug: only try OpenAI direct as a last guess for bare ids.
    return provider === "openai"
  }
  return hint === provider
}
