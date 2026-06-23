import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import { AIService } from "./google-service.ts"
import { MinimaxService } from "./minimax-service.ts"
import { OpenRouterService } from "./openrouter-service.ts"
import { NvidiaService } from "./nvidia-service.ts"
import { ConcentrateService } from "./concentrate-service.ts"
import { ServerProxyService } from "./server-proxy-service.ts"
import { config } from "../../config/google.config.ts"
import { minimaxConfig } from "../../config/minimax.config.ts"
import { openRouterConfig } from "../../config/openrouter.config.ts"
import { nvidiaConfig } from "../../config/nvidia.config.ts"

export type ModelProvider = "google" | "minimax" | "openrouter" | "nvidia" | "concentrateai"

export interface AIProvider {
  readonly name: string
  readonly modelName: string
  readonly model?: any
  sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
  ): Promise<{
    content: string
    finishReason: FinishReason
    usage: LanguageModelUsage
  }>
  generateObject?(schema: any, prompt: string): Promise<{ object: unknown }>
}

const providerMeta: Record<ModelProvider, { env: string; label: string; defaultModel: string; link?: string }> = {
  google: { env: "GOOGLE_GENERATIVE_AI_API_KEY", label: "Google Gemini", defaultModel: "gemini-2.5-flash", link: "https://aistudio.google.com/apikey" },
  minimax: { env: "MINIMAX_API_KEY", label: "MiniMax", defaultModel: "MiniMax-M2" },
  openrouter: { env: "OPENROUTER_API_KEY", label: "OpenRouter", defaultModel: "openai/gpt-oss-120b:free", link: "https://openrouter.ai/keys" },
  nvidia: { env: "NVIDIA_API_KEY", label: "NVIDIA NIM", defaultModel: "minimaxai/minimax-m2.7" },
  concentrateai: { env: "CONCENTRATEAI_API_KEY", label: "ConcentrateAI", defaultModel: "deepseek-v4-flash", link: "https://concentrate.ai" },
}

const providerConfigs: Record<ModelProvider, () => string> = {
  google: () => config.googleApiKey,
  minimax: () => minimaxConfig.apiKey,
  openrouter: () => openRouterConfig.apiKey,
  nvidia: () => nvidiaConfig.apiKey,
  concentrateai: () => process.env.CONCENTRATEAI_API_KEY || "",
}

export function createProvider(provider: ModelProvider, model?: string): AIProvider {
  const meta = providerMeta[provider]

  if (!providerConfigs[provider]()) {
    const svc = new ServerProxyService(provider, model || meta.defaultModel)
    return {
      name: provider,
      modelName: model || meta.defaultModel,
      sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning) => svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning),
      generateObject: (schema, prompt) => svc.generateObject(schema, prompt),
    }
  }

  switch (provider) {
    case "google": {
      const svc = new AIService(model)
      return {
        name: "google",
        modelName: svc.modelName,
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning) => svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning),
      }
    }
    case "openrouter": {
      const svc = new OpenRouterService(model)
      return {
        name: "openrouter",
        modelName: svc.modelName,
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning) => svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning),
      }
    }
    case "nvidia": {
      const svc = new NvidiaService(model)
      return {
        name: "nvidia",
        modelName: svc.modelName,
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning) => svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning),
      }
    }
    case "concentrateai": {
      const svc = new ConcentrateService(model)
      return {
        name: "concentrateai",
        modelName: svc.modelName,
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning) => svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning),
      }
    }
    default: {
      throw new Error(`Provider "${provider}" is paused or unavailable`)
    }
  }
}
