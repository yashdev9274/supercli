import type { ModelMessage } from "ai"
import { nvidiaConfig } from "../../config/nvidia.config.ts"
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible.ts"

/**
 * NVIDIA NIM — thin wrapper over the shared OpenAI-compatible adapter.
 */
export class NvidiaService {
  private adapter: OpenAICompatibleAdapter
  sendMessage: any
  readonly modelName: string
  get model() {
    return this.adapter.model
  }

  constructor(modelName?: string) {
    this.adapter = new OpenAICompatibleAdapter({
      providerId: "nvidia",
      providerLabel: "NVIDIA",
      clientName: "nim",
      baseURL: nvidiaConfig.baseUrl,
      apiKey: nvidiaConfig.apiKey,
      modelName: modelName || nvidiaConfig.model,
      missingKeyError:
        "NVIDIA NIM is not configured.\n\n  Set NVIDIA_API_KEY in your environment:\n    export NVIDIA_API_KEY=<your-key>\n\n  Get free credits at: https://build.nvidia.com",
      toolLoop: "execute",
      streamTimeoutMs: 0,
    })
    this.modelName = this.adapter.modelName
    this.sendMessage = this.adapter.sendMessage.bind(this.adapter)
  }

  async getMessage(messages: ModelMessage[], tools?: any) {
    return this.adapter.getMessage(messages, tools)
  }
}
