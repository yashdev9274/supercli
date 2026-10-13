import type { GatewayModel } from "./base"
import { createMinimax } from "vercel-minimax-ai-provider"
import { BaseGatewayProvider, type GatewayProviderOptions, type ModelInfo } from "./base"

const DEFAULT_MODEL = "MiniMax-M1"

export interface MiniMaxProviderOptions extends Omit<GatewayProviderOptions, "provider"> {}

export class MiniMaxProvider extends BaseGatewayProvider {
  private readonly sdk: ReturnType<typeof createMinimax>

  constructor(options: MiniMaxProviderOptions = {}) {
    super({
      ...options,
      provider: "minimax",
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL ?? "",
      model: options.model ?? DEFAULT_MODEL,
    })
    this.sdk = createMinimax({
      apiKey: this.apiKey,
      baseURL: this.baseURL || undefined,
      headers: this.headers,
      fetch: this.fetchImpl,
    })
  }

  protected buildModel(modelName: string): GatewayModel {
    return this.sdk.languageModel(modelName)
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "MiniMax-M1", name: "MiniMax M1", provider: "minimax" },
      { id: "MiniMax-M2", name: "MiniMax M2", provider: "minimax" },
    ]
  }
}

export function createMiniMaxProvider(options?: MiniMaxProviderOptions): MiniMaxProvider {
  return new MiniMaxProvider(options)
}
