import type { ModelMessage } from "ai"
import { orcarouterConfig } from "../../config/orcarouter.config.ts"
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible.ts"

/**
 * OrcaRouter — thin wrapper over the shared OpenAI-compatible adapter.
 */
export class OrcaRouterService {
  private adapter: OpenAICompatibleAdapter
  sendMessage: any
  readonly modelName: string
  get model() {
    return this.adapter.model
  }

  constructor(modelName?: string) {
    this.adapter = new OpenAICompatibleAdapter({
      providerId: "orcarouter",
      providerLabel: "OrcaRouter",
      clientName: "orcarouter",
      baseURL: orcarouterConfig.baseUrl,
      apiKey: orcarouterConfig.apiKey,
      modelName: modelName || orcarouterConfig.model,
      missingKeyError:
        "OrcaRouter is not configured.\n\n  Set ORCAROUTER_API_KEY in your environment:\n" +
        "    export ORCAROUTER_API_KEY=<your-key>\n\n" +
        "  Get a key at: https://orcarouter.ai",
      highValueModels: [],
      defaultMaxOutputTokens: 8192,
      toolLoop: "execute",
      streamTimeoutMs: 120_000,
    })
    this.modelName = this.adapter.modelName
    this.sendMessage = this.adapter.sendMessage.bind(this.adapter)
  }

  async getMessage(messages: ModelMessage[], tools?: any) {
    return this.adapter.getMessage(messages, tools)
  }
}
