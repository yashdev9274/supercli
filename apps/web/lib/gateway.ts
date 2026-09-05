import { createOpenAI } from "@ai-sdk/openai"
import { createGateway } from "ai"
import type { EmbeddingModel, LanguageModel } from "ai"

/**
 * Dual LLM gateway:
 * - Primary: Vercel AI Gateway (`AI_GATEWAY_API_KEY` / OIDC)
 * - Fallback: Merge Gateway (kept; free-tier model limits still apply there)
 *
 * Call sites should use `chatModel()` / `embeddingModel()` so the active
 * provider is selected from env, not hard-coded to Merge.
 *
 * @see https://vercel.com/docs/ai-gateway
 * @see https://docs.merge.dev/merge-gateway/get-started
 */

export type GatewayProviderName = "vercel" | "merge"

function resolvePreferredProvider(): GatewayProviderName {
  const raw = (process.env.AI_GATEWAY_PROVIDER ?? "").trim().toLowerCase()
  if (raw === "merge" || raw === "mergedev" || raw === "merge.dev") {
    return "merge"
  }
  if (raw === "vercel" || raw === "ai-gateway" || raw === "vercel-ai-gateway") {
    return "vercel"
  }

  // Prefer Vercel when configured; otherwise keep Merge working.
  if (
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim()
  ) {
    return "vercel"
  }
  return "merge"
}

export const activeGatewayProvider: GatewayProviderName =
  resolvePreferredProvider()

/** Vercel AI Gateway (AI SDK native). Uses AI_GATEWAY_API_KEY or OIDC on Vercel. */
export const vercelGateway = createGateway({
  apiKey:
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
    undefined,
})

/**
 * Merge Gateway via the AI SDK URL shim.
 * Must use `/v1/ai-sdk` (not bare `/v1`) so @ai-sdk/openai's Responses
 * payload shape is accepted. Bare `/v1/responses` expects Merge-native
 * `{ type: "message", role, content }` and returns 422 otherwise.
 */
export const mergeGateway = createOpenAI({
  name: "merge",
  baseURL: "https://api-gateway.merge.dev/v1/ai-sdk",
  apiKey: process.env.MERGE_GATEWAY_API_KEY,
})

/**
 * Back-compat export: historically this was the Merge OpenAI shim.
 * Prefer `chatModel()` / `embeddingModel()` for new call sites.
 */
export const gateway = mergeGateway

export function chatModel(
  modelId: string,
  provider: GatewayProviderName = activeGatewayProvider,
): LanguageModel {
  if (provider === "vercel") {
    return vercelGateway(modelId)
  }
  // chat() is more portable across OpenAI-compatible shims than the Responses path.
  return mergeGateway.chat(modelId)
}

export function embeddingModel(
  modelId: string,
  provider: GatewayProviderName = activeGatewayProvider,
): EmbeddingModel {
  if (provider === "vercel") {
    return vercelGateway.embeddingModel(modelId)
  }
  return mergeGateway.embeddingModel(modelId)
}

/** Providers to try for a request (preferred first, other as fallback when keyed). */
export function gatewayProviderChain(): GatewayProviderName[] {
  const preferred = activeGatewayProvider
  const chain: GatewayProviderName[] = [preferred]

  const other: GatewayProviderName = preferred === "vercel" ? "merge" : "vercel"
  const otherReady =
    other === "vercel"
      ? Boolean(
          process.env.AI_GATEWAY_API_KEY?.trim() ||
            process.env.VERCEL_OIDC_TOKEN?.trim(),
        )
      : Boolean(process.env.MERGE_GATEWAY_API_KEY?.trim())

  if (otherReady) chain.push(other)
  return chain
}
