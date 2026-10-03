import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { GatewayModel } from "./base"
import { BaseGatewayProvider, type GatewayProviderOptions, type ModelInfo } from "./base"

const DEFAULT_BASE_URL = "https://api.concentrate.ai/v1"
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash"

export interface ConcentrateAIProviderOptions extends Omit<GatewayProviderOptions, "provider"> {}

export class ConcentrateAIProvider extends BaseGatewayProvider {
  private readonly sdk: ReturnType<typeof createOpenAICompatible>

  constructor(options: ConcentrateAIProviderOptions = {}) {
    super({
      ...options,
      provider: "concentrateai",
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      model: options.model ?? DEFAULT_MODEL,
    })
    this.sdk = createOpenAICompatible({
      name: "concentrateai",
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
      { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "concentrateai" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "concentrateai" },
    ]
  }
}

export function createConcentrateAIProvider(options?: ConcentrateAIProviderOptions): ConcentrateAIProvider {
  return new ConcentrateAIProvider(options)
}
