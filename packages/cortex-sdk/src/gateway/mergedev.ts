import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { GatewayModel } from "./base"
import { BaseGatewayProvider, type GatewayProviderOptions, type ModelInfo } from "./base"

const DEFAULT_BASE_URL = "https://api-gateway.merge.dev/v1/openai"
const DEFAULT_MODEL = "anthropic/claude-opus-4-8"

export interface MergeDevProviderOptions extends Omit<GatewayProviderOptions, "provider"> {}

export class MergeDevProvider extends BaseGatewayProvider {
  private readonly sdk: ReturnType<typeof createOpenAICompatible>

  constructor(options: MergeDevProviderOptions = {}) {
    super({
      ...options,
      provider: "mergedev",
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      model: options.model ?? DEFAULT_MODEL,
    })
    this.sdk = createOpenAICompatible({
      name: "mergedev",
      baseURL: this.baseURL,
      apiKey: this.apiKey,
      headers: this.headers,
      fetch: this.fetchImpl,
    })
  }

  protected buildModel(modelName: string): GatewayModel {
    return this.sdk.chatModel(modelName)
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "anthropic/claude-opus-4-8", name: "Claude Opus 4.8", provider: "mergedev" },
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "mergedev" },
    ]
  }
}

export function createMergeDevProvider(options?: MergeDevProviderOptions): MergeDevProvider {
  return new MergeDevProvider(options)
}
