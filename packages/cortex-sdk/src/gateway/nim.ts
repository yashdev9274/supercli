import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { GatewayModel } from "./base"
import { BaseGatewayProvider, type GatewayProviderOptions, type ModelInfo } from "./base"

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1"
const DEFAULT_MODEL = "minimaxai/minimax-m3"

export interface NimProviderOptions extends Omit<GatewayProviderOptions, "provider"> {}

export class NimProvider extends BaseGatewayProvider {
  private readonly sdk: ReturnType<typeof createOpenAICompatible>

  constructor(options: NimProviderOptions = {}) {
    super({
      ...options,
      provider: "nim",
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      model: options.model ?? DEFAULT_MODEL,
    })
    this.sdk = createOpenAICompatible({
      name: "nim",
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
      { id: "minimaxai/minimax-m3", name: "MiniMax M3", provider: "nim" },
      { id: "nvidia/llama-3.1-nemotron-ultra-253b-v1", name: "Llama Nemotron Ultra", provider: "nim" },
    ]
  }
}

export function createNimProvider(options?: NimProviderOptions): NimProvider {
  return new NimProvider(options)
}
