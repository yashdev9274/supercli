import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import { AIService } from "./google-service.ts"
import { MinimaxService } from "./minimax-service.ts"
import { OpenRouterService } from "./openrouter-service.ts"
import { NvidiaService } from "./nvidia-service.ts"
import { ServerProxyService } from "./server-proxy-service.ts"
import { config } from "../../config/google.config.ts"
import { minimaxConfig } from "../../config/minimax.config.ts"
import { openRouterConfig } from "../../config/openrouter.config.ts"
import { nvidiaConfig } from "../../config/nvidia.config.ts"

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
  generateObject?(schema: any, prompt: string): Promise<{ object: unknown }>
}

const providerMeta: Record<ModelProvider, { env: string; label: string; defaultModel: string; link?: string }> = {
  google: { env: "GOOGLE_GENERATIVE_AI_API_KEY", label: "Google Gemini", defaultModel: "gemini-2.5-flash", link: "https://aistudio.google.com/apikey" },
  minimax: { env: "MINIMAX_API_KEY", label: "MiniMax", defaultModel: "MiniMax-M2" },
  openrouter: { env: "OPENROUTER_API_KEY", label: "OpenRouter", defaultModel: "openai/gpt-oss-120b:free", link: "https://openrouter.ai/keys" },
  nvidia: { env: "NVIDIA_API_KEY", label: "NVIDIA NIM", defaultModel: "minimaxai/minimax-m2.7" },
}

const providerConfigs: Record<ModelProvider, () => string> = {
  google: () => config.googleApiKey,
  minimax: () => minimaxConfig.apiKey,
  openrouter: () => openRouterConfig.apiKey,
  nvidia: () => nvidiaConfig.apiKey,
}

export function createProvider(provider: ModelProvider, model?: string): AIProvider {
  const meta = providerMeta[provider]

  if (!providerConfigs[provider]()) {
    const svc = new ServerProxyService(provider, model || meta.defaultModel)
    return {
      name: provider,
      modelName: model || meta.defaultModel,
      sendMessage: (messages, onChunk, tools, onToolCall) => svc.sendMessage(messages, onChunk, tools, onToolCall),
      generateObject: (schema, prompt) => svc.generateObject(schema, prompt),
    }
  }

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
