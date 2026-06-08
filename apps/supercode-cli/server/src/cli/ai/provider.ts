import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import { AIService } from "./google-service.ts"
import { MinimaxService } from "./minimax-service.ts"
import { OpenRouterService } from "./openrouter-service.ts"
import { NvidiaService } from "./nvidia-service.ts"
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
}

const providerEnvVars: Record<ModelProvider, { env: string; label: string; link?: string }> = {
  google: { env: "GOOGLE_GENERATIVE_AI_API_KEY", label: "Google Gemini", link: "https://aistudio.google.com/apikey" },
  minimax: { env: "MINIMAX_API_KEY", label: "MiniMax" },
  openrouter: { env: "OPENROUTER_API_KEY", label: "OpenRouter", link: "https://openrouter.ai/keys" },
  nvidia: { env: "NVIDIA_API_KEY", label: "NVIDIA NIM" },
}

const providerConfigs: Record<ModelProvider, () => string> = {
  google: () => config.googleApiKey,
  minimax: () => minimaxConfig.apiKey,
  openrouter: () => openRouterConfig.apiKey,
  nvidia: () => nvidiaConfig.apiKey,
}

export function createProvider(provider: ModelProvider, model?: string): AIProvider {
  const { env, label, link } = providerEnvVars[provider]

  if (!providerConfigs[provider]()) {
    return {
      name: provider,
      modelName: "unconfigured",
      sendMessage: async () => {
        const hint = link ? `\n  Get a key at: ${link}` : ""
        throw new Error(
          `${label} is not configured.\n\n  Set your API key:\n    export ${env}=<your-key>\n\n  Or create a .env file in the project root:\n    ${env}=<your-key>${hint}`,
        )
      },
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
