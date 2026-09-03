import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { GatewayModel } from "./base"
import { BaseGatewayProvider, type GatewayProviderOptions, type ModelInfo } from "./base"

const DEFAULT_BASE_URL = "https://api.orcarouter.ai/v1"
const DEFAULT_MODEL = "openai/gpt-4o-mini"

export interface OrcaRouterProviderOptions extends Omit<GatewayProviderOptions, "provider"> {}

export class OrcaRouterProvider extends BaseGatewayProvider {
  private readonly sdk: ReturnType<typeof createOpenAICompatible>

  constructor(options: OrcaRouterProviderOptions = {}) {
    super({
      ...options,
      provider: "orcarouter",
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      model: options.model ?? DEFAULT_MODEL,
    })
    this.sdk = createOpenAICompatible({
      name: "orcarouter",
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
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "orcarouter" },
      { id: "openai/gpt-4o", name: "GPT-4o", provider: "orcarouter" },
    ]
  }
}

export function createOrcaRouterProvider(options?: OrcaRouterProviderOptions): OrcaRouterProvider {
  return new OrcaRouterProvider(options)
}
