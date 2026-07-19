import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import { AIService } from "./google-service.ts"
import { MinimaxService } from "./minimax-service.ts"
import { OpenRouterService } from "./openrouter-service.ts"
import { NvidiaService } from "./nvidia-service.ts"
import { ConcentrateService } from "./concentrate-service.ts"
import { MergeDevService } from "./mergedev-service.ts"
import { OrcaRouterService } from "./orcarouter-service.ts"
import { ServerProxyService } from "./server-proxy-service.ts"
import { config } from "../../config/google.config.ts"
import { minimaxConfig } from "../../config/minimax.config.ts"
import { openRouterConfig } from "../../config/openrouter.config.ts"
import { nvidiaConfig } from "../../config/nvidia.config.ts"
import { mergedevConfig } from "../../config/mergedev.config.ts"
import { orcarouterConfig } from "../../config/orcarouter.config.ts"

export type ModelProvider = "supercode" | "google" | "minimax" | "openrouter" | "nvidia" | "concentrateai" | "mergedev" | "orcarouter"

export type ConnectionType = "direct" | "proxy"

export interface AIProvider {
  readonly name: string
  readonly modelName: string
  readonly connectionType: ConnectionType
  readonly model?: any
  sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
    onToolResult?: (params: { toolName: string; args: unknown; result: string }) => void,
    onStepFinish?: (params: { stepNumber: number; toolCalls: Array<{ toolName: string; args: unknown }>; toolResults: Array<{ toolName: string; args: unknown; result: string }> }) => void,
    onStepBudget?: (maxSteps: number) => void,
  ): Promise<{
    content: string
    finishReason: FinishReason
    usage: LanguageModelUsage
  }>
  generateObject?(schema: any, prompt: string): Promise<{ object: unknown }>
}

export const providerMeta: Record<ModelProvider, { env: string; label: string; defaultModel: string; link?: string }> = {
  supercode: { env: "", label: "Supercode Cloud", defaultModel: "deepseek-v4-flash" },
  google: { env: "GOOGLE_BYOK_PROD_KEY / GOOGLE_BYOK_DEV_KEY", label: "Google Gemini", defaultModel: "gemini-2.5-flash", link: "https://aistudio.google.com/apikey" },
  minimax: { env: "MINIMAX_API_KEY", label: "MiniMax", defaultModel: "MiniMax-M2" },
  openrouter: { env: "OPENROUTER_BYOK_PROD_KEY / OPENROUTER_BYOK_DEV_KEY", label: "OpenRouter", defaultModel: "openai/gpt-oss-120b:free", link: "https://openrouter.ai/keys" },
  nvidia: { env: "NVIDIA_BYOK_PROD_KEY / NVIDIA_BYOK_DEV_KEY", label: "NVIDIA NIM", defaultModel: "minimaxai/minimax-m3" },
  concentrateai: { env: "CONCENTRATE_BYOK_PROD_KEY / CONCENTRATE_BYOK_DEV_KEY", label: "ConcentrateAI", defaultModel: "deepseek-v4-flash", link: "https://concentrate.ai" },
  mergedev: { env: "MERGE_DEV_BYOK_PROD_KEY / MERGE_DEV_BYOK_DEV_KEY", label: "Merge Dev Gateway", defaultModel: "anthropic/claude-opus-4-8", link: "https://app.merge.dev" },
  orcarouter: { env: "ORCAROUTER_BYOK_PROD_KEY / ORCAROUTER_BYOK_DEV_KEY", label: "OrcaRouter", defaultModel: "openai/gpt-4o-mini", link: "https://orcarouter.ai" },
}

const providerConfigs: Record<ModelProvider, () => string> = {
  supercode: () => "",
  google: () => process.env.GOOGLE_BYOK_PROD_KEY || process.env.GOOGLE_BYOK_DEV_KEY || config.googleApiKey,
  minimax: () => minimaxConfig.apiKey,
  openrouter: () => process.env.OPENROUTER_BYOK_PROD_KEY || process.env.OPENROUTER_BYOK_DEV_KEY || openRouterConfig.apiKey,
  nvidia: () => process.env.NVIDIA_BYOK_PROD_KEY || process.env.NVIDIA_BYOK_DEV_KEY || nvidiaConfig.apiKey,
  concentrateai: () => process.env.CONCENTRATE_BYOK_PROD_KEY || process.env.CONCENTRATE_BYOK_DEV_KEY || process.env.CONCENTRATEAI_API_KEY || "",
  mergedev: () => process.env.MERGE_DEV_BYOK_PROD_KEY || process.env.MERGE_DEV_BYOK_DEV_KEY || mergedevConfig.apiKey,
  orcarouter: () => process.env.ORCAROUTER_BYOK_PROD_KEY || process.env.ORCAROUTER_BYOK_DEV_KEY || orcarouterConfig.apiKey,
}

export function createProvider(provider: ModelProvider, model?: string): AIProvider {
  const meta = providerMeta[provider]

  // Only supercode cloud models are allowed through the proxy without an API key.
  // All other providers require the user to connect their own key first.
  if (!providerConfigs[provider]()) {
    if (provider === "supercode") {
      // Cloud models run through ConcentrateAI with the server's own API key.
      // Send "concentrateai" as the provider so the server's existing handler
      // picks it up — it falls back to CONCENTRATEAI_API_KEY when no forwarded
      // key is provided.
      const svc = new ServerProxyService("concentrateai", model || meta.defaultModel)
      return {
        name: provider,
        modelName: model || meta.defaultModel,
        connectionType: "proxy",
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult, onStepFinish) =>
          svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult, onStepFinish),
        generateObject: (schema, prompt) => svc.generateObject(schema, prompt),
      }
    }
    throw new Error(
      `No API key configured for ${meta.label}. ` +
      `Run \`/connect\` and select "${meta.label}" to save your key, ` +
      `then select this model again.`
    )
  }

  switch (provider) {
    case "google": {
      const svc = new AIService(model)
      return {
        name: "google",
        modelName: svc.modelName,
        connectionType: "direct",
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult) =>
          svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult),
      }
    }
    case "openrouter": {
      const svc = new OpenRouterService(model)
      return {
        name: "openrouter",
        modelName: svc.modelName,
        connectionType: "direct",
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult) =>
          svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult),
      }
    }
    case "nvidia": {
      const svc = new NvidiaService(model)
      return {
        name: "nvidia",
        modelName: svc.modelName,
        connectionType: "direct",
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult, onStepFinish) =>
          svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult, onStepFinish),
      }
    }
    case "concentrateai": {
      const svc = new ConcentrateService(model)
      return {
        name: "concentrateai",
        modelName: svc.modelName,
        connectionType: "direct",
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult, onStepFinish, onStepBudget) =>
          svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult, onStepFinish, onStepBudget),
      }
    }
    case "mergedev": {
      const svc = new MergeDevService(model)
      return {
        name: "mergedev",
        modelName: svc.modelName,
        connectionType: "direct",
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult, onStepFinish) =>
          svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult, onStepFinish),
      }
    }
    case "orcarouter": {
      const svc = new OrcaRouterService(model)
      return {
        name: "orcarouter",
        modelName: svc.modelName,
        connectionType: "direct",
        model: svc.model,
        sendMessage: (messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult, onStepFinish) =>
          svc.sendMessage(messages, onChunk, tools, onToolCall, signal, onReasoning, onToolResult, onStepFinish),
      }
    }
    default: {
      throw new Error(`Provider "${provider}" is paused or unavailable`)
    }
  }
}
