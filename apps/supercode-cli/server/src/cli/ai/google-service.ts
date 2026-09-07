import type { ModelMessage } from "ai"
import { config } from "../../config/google.config.ts"
import { GoogleAdapter } from "./adapters/google.ts"

/**
 * Google Gemini — thin wrapper over the shared Google adapter.
 * Kept as `AIService` for backward-compatible imports.
 */
export class AIService {
  private adapter: GoogleAdapter
  generateStructured: any
  sendMessage: any
  readonly modelName: string
  get model() {
    return this.adapter.model
  }

  constructor(modelName?: string) {
    this.adapter = new GoogleAdapter(modelName, config.googleApiKey, config.model)
    this.modelName = this.adapter.modelName
    this.generateStructured = this.adapter.generateStructured.bind(this.adapter)
    this.sendMessage = this.adapter.sendMessage.bind(this.adapter)
  }

  async getMessage(messages: ModelMessage[], tools?: any) {
    return this.adapter.getMessage(messages, tools)
  }
}
