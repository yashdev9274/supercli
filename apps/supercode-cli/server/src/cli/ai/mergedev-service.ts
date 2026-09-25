import type { ModelMessage } from "ai"
import { mergedevConfig } from "../../config/mergedev.config.ts"
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible.ts"

const HIGH_VALUE_MODELS = [
  "anthropic/claude-fable-5",
  "anthropic/claude-opus-5",
  "anthropic/claude-opus-4-8",
  "anthropic/claude-opus-4-7",
  "openai/gpt-5.5",
]

/**
 * Merge Dev gateway — thin wrapper over the shared OpenAI-compatible adapter.
 */
export class MergeDevService {
  private adapter: OpenAICompatibleAdapter
  sendMessage: any
  readonly modelName: string
  get model() {
    return this.adapter.model
  }

  constructor(modelName?: string) {
    this.adapter = new OpenAICompatibleAdapter({
      providerId: "mergedev",
      providerLabel: "MergeDev",
      clientName: "mergedev",
      baseURL: mergedevConfig.baseUrl,
      apiKey: mergedevConfig.apiKey,
      modelName: modelName || mergedevConfig.model,
      missingKeyError:
        "Merge Dev is not configured.\n\n  Set MERGE_DEV_API_KEY in your environment:\n" +
        "    export MERGE_DEV_API_KEY=<your-key>\n\n" +
        "  Get a key at: https://app.merge.dev/settings/api-keys",
      highValueModels: HIGH_VALUE_MODELS,
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
