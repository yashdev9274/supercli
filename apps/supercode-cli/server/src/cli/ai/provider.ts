import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import { AIService } from "./google-service.ts"
import { MinimaxService } from "./minimax-service.ts"

export type ModelProvider = "google" | "minimax"

export interface AIProvider {
  readonly name: string
  readonly modelName: string
  sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
  ): Promise<{
    content: string
    finishResponse: PromiseLike<FinishReason>
    usage: PromiseLike<LanguageModelUsage>
  }>
}

export function createProvider(provider: ModelProvider): AIProvider {
  switch (provider) {
    case "google": {
      const svc = new AIService()
      return {
        name: "google",
        modelName: "gemini-2.5-flash",
        sendMessage: (messages, onChunk, tools, onToolCall) => svc.sendMessage(messages, onChunk, tools, onToolCall),
      }
    }
    case "minimax": {
      const svc = new MinimaxService()
      return {
        name: "minimax",
        modelName: "MiniMax-M2",
        sendMessage: (messages, onChunk, tools, onToolCall) => svc.sendMessage(messages, onChunk, tools, onToolCall),
      }
    }
  }
}
