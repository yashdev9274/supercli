import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { GatewayModel } from "./base"
import { BaseGatewayProvider, type GatewayProviderOptions, type ModelInfo } from "./base"

const DEFAULT_MODEL = "gemini-2.5-flash"

export interface GeminiProviderOptions extends Omit<GatewayProviderOptions, "provider"> {}

export class GeminiProvider extends BaseGatewayProvider {
  private readonly sdk: ReturnType<typeof createGoogleGenerativeAI>

  constructor(options: GeminiProviderOptions = {}) {
    super({
      ...options,
      provider: "gemini",
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL ?? "",
      model: options.model ?? DEFAULT_MODEL,
    })
    this.sdk = createGoogleGenerativeAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL || undefined,
      fetch: this.fetchImpl,
    })
  }

  protected buildModel(modelName: string): GatewayModel {
    return this.sdk.chat(modelName)
  }

  async listModels(): Promise<ModelInfo[]> {
    const fallback: ModelInfo[] = [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "gemini" },
    ]
    if (!this.apiKey) return fallback
    try {
      const response = await this.fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.apiKey)}`,
      )
      if (!response.ok) return fallback
      const data = (await response.json()) as { models?: Array<{ name?: string; displayName?: string }> }
      const models = (data.models ?? [])
        .map((m) => {
          const id = m.name?.replace(/^models\//, "")
          if (!id) return null
          return { id, name: m.displayName ?? id, provider: "gemini" as const }
        })
        .filter((m): m is { id: string; name: string; provider: "gemini" } => m !== null)
      return models.length > 0 ? models : fallback
    } catch {
      return fallback
    }
  }
}

export function createGeminiProvider(options?: GeminiProviderOptions): GeminiProvider {
  return new GeminiProvider(options)
}
