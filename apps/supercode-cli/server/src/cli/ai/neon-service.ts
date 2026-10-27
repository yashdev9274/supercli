import { createNeon } from "@neon/ai-sdk-provider"
import { generateObject, type FlexibleSchema, type LanguageModel } from "ai"
import { DEFAULT_NEON_MODEL, getNeonConfig } from "../../config/neon.config"
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible"

export function createNeonModel(modelName = DEFAULT_NEON_MODEL, fetcher?: typeof fetch): LanguageModel {
  return createNeon({ ...getNeonConfig(), ...(fetcher ? { fetch: fetcher } : {}) })(modelName)
}

export class NeonService {
  readonly modelName: string
  readonly model: LanguageModel
  readonly sendMessage: OpenAICompatibleAdapter["sendMessage"]

  constructor(modelName = DEFAULT_NEON_MODEL) {
    this.modelName = modelName
    this.model = createNeonModel(modelName)
    const config = getNeonConfig()
    const adapter = new OpenAICompatibleAdapter({
      providerId: "neon",
      providerLabel: "Neon AI Gateway",
      clientName: "neon",
      ...config,
      modelName,
      model: this.model,
      missingKeyError: "Set NEON_AI_GATEWAY_TOKEN and NEON_AI_GATEWAY_BASE_URL or run /connect → Neon AI Gateway.",
      toolLoop: "execute",
      useFullStream: true,
      streamTimeoutMs: 120_000,
    })
    this.sendMessage = adapter.sendMessage.bind(adapter)
  }

  async generateObject<T>(schema: FlexibleSchema<T>, prompt: string) {
    const result = await generateObject({ model: this.model, schema, prompt })
    return { object: result.object }
  }
}
