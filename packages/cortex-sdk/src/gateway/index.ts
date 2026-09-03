import { SdkError } from "../core/errors"
import type { GatewayOptions, GatewayProvider } from "../core/types"
import type { BaseGatewayProvider, GatewayCost, GatewayModel, GatewayUsage, ModelInfo } from "./base"
import { ConcentrateAIProvider } from "./concentrateai"
import { GeminiProvider } from "./gemini"
import { MergeDevProvider } from "./mergedev"
import { MiniMaxProvider } from "./minimax"
import { NimProvider } from "./nim"
import { OpenRouterProvider } from "./openrouter"
import { OrcaRouterProvider } from "./orcarouter"
import { SupercodeCloudProvider } from "./supercode-cloud"

export type { GatewayOptions, GatewayProvider } from "../core/types"
export type { GatewayCost, GatewayUsage, ModelInfo } from "./base"

export type GatewayOptionsWithCallbacks = GatewayOptions & {
  timeoutMs?: number
  maxRetries?: number
  onUsage?: (usage: GatewayUsage) => void
  onCost?: (cost: GatewayCost) => void
}

export interface GatewayClient {
  model(id?: string): GatewayModel
  listModels(): Promise<ModelInfo[]>
  readonly provider: GatewayProvider
  readonly defaultModel: string
}

const providerCache = new Map<string, BaseGatewayProvider>()

function cacheKey(options: GatewayOptions): string {
  return JSON.stringify({
    provider: options.provider,
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    model: options.model,
    headers: options.headers,
  })
}

export function createGateway(options: GatewayOptionsWithCallbacks): GatewayClient {
  const key = cacheKey(options)
  let provider = providerCache.get(key)
  if (!provider) {
    provider = buildProvider(options)
    providerCache.set(key, provider)
  }
  return {
    get provider() {
      return provider!.provider
    },
    get defaultModel() {
      return provider!.defaultModel
    },
    model: (id?: string) => provider!.model(id),
    listModels: () => provider!.listModels(),
  }
}

function buildProvider(options: GatewayOptionsWithCallbacks): BaseGatewayProvider {
  const callbacks = {
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    onUsage: options.onUsage,
    onCost: options.onCost,
  }
  switch (options.provider) {
    case "concentrateai":
      return new ConcentrateAIProvider({ ...options, ...callbacks })
    case "mergedev":
      return new MergeDevProvider({ ...options, ...callbacks })
    case "openrouter":
      return new OpenRouterProvider({ ...options, ...callbacks })
    case "gemini":
      return new GeminiProvider({ ...options, ...callbacks })
    case "minimax":
      return new MiniMaxProvider({ ...options, ...callbacks })
    case "nim":
      return new NimProvider({ ...options, ...callbacks })
    case "orcarouter":
      return new OrcaRouterProvider({ ...options, ...callbacks })
    case "supercode-cloud":
      return new SupercodeCloudProvider({ ...options, ...callbacks })
    default: {
      const provider = options.provider as string
      throw new SdkError(`createGateway: unsupported provider "${provider}"`, { code: "INVALID_PROVIDER" })
    }
  }
}

export function clearGatewayCache(): void {
  providerCache.clear()
}
