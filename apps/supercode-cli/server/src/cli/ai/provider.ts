import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import { AIService } from "./google-service.ts"
import { MinimaxService } from "./minimax-service.ts"
import { OpenRouterService } from "./openrouter-service.ts"
import { NvidiaService } from "./nvidia-service.ts"

export type ModelProvider = "google" | "minimax" | "openrouter" | "nvidia"

export interface AIProvider {
  readonly name: string
  readonly modelName: string
  readonly model?: object | null
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

export function createProvider(provider: ModelProvider, model?: string): AIProvider {
  switch (provider) {
    case "google": {
      const svc = new AIService()
      return {
        name: "google",
        modelName: "gemini-2.5-flash",
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall) => svc.sendMessage(messages, onChunk, tools, onToolCall),
      }
    }
    case "minimax": {
      const svc = new MinimaxService()
      return {
        name: "minimax",
        modelName: "MiniMax-M2",
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall) => svc.sendMessage(messages, onChunk, tools, onToolCall),
      }
    }
    case "openrouter": {
      const svc = new OpenRouterService(model)
      return {
        name: "openrouter",
        modelName: svc.modelName,
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall) => svc.sendMessage(messages, onChunk, tools, onToolCall),
      }
    }
    case "nvidia": {
      const svc = new NvidiaService(model)
      return {
        name: "nvidia",
        modelName: svc.modelName,
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall) => svc.sendMessage(messages, onChunk, tools, onToolCall),
      }
    }
  }
}
