import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { streamText, stepCountIs, type ModelMessage, type LanguageModel } from "ai"
import { openRouterConfig } from "../../config/openrouter.config.ts"
import chalk from "chalk"

const MODEL_MAX_TOKENS: Record<string, number> = {
  "moonshotai/kimi-k2.6": 384,
  "deepseek/deepseek-v4-flash": 8192,
  "deepseek-ai/deepseek-v4-flash": 8192,
  "minimax/minimax-m3": 1024,
  "minimax/minimax-m3.5": 1024,
  "minimax/minimax-m2.5": 1024,
  "minimaxai/minimax-m2.7": 1024,
  "z-ai/glm-5.1": 512,
}

function getModelMaxTokens(modelName: string): number {
  const direct = MODEL_MAX_TOKENS[modelName]
  if (direct != null) return direct
  for (const [key, value] of Object.entries(MODEL_MAX_TOKENS)) {
    if (modelName.includes(key) || key.includes(modelName)) return value
  }
  for (const key of Object.keys(MODEL_MAX_TOKENS)) {
    const keyParts = key.split("/").pop()
    if (keyParts && modelName.includes(keyParts)) {
      const val = MODEL_MAX_TOKENS[key]
      if (val != null) return val
    }
  }
  return Math.min(openRouterConfig.maxTokens, 8192)
}

export class OpenRouterService {
  model: LanguageModel
  readonly modelName: string
  readonly maxTokens: number

  constructor(modelName?: string) {
    if (!openRouterConfig.apiKey) {
      throw new Error("OpenRouter is not configured.\n\n  Set OPENROUTER_API_KEY in your environment:\n    export OPENROUTER_API_KEY=<your-key>\n\n  Get a key at: https://openrouter.ai/keys")
    }

    this.modelName = modelName || openRouterConfig.model
    this.maxTokens = getModelMaxTokens(this.modelName)

    const openrouter = createOpenRouter({
      apiKey: openRouterConfig.apiKey,
    })

    this.model = openrouter.chat(this.modelName, {
      maxTokens: this.maxTokens,
    })
  }

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
  ) {
    try {
      const systemMessages = messages.filter(m => m.role === "system")
      const nonSystemMessages = messages.filter(m => m.role !== "system")
      const system = systemMessages.map(m => m.content).join("\n")

      const hasTools = tools && Object.keys(tools).length > 0

      if (!hasTools) {
        const result = streamText({
          model: this.model,
          messages: nonSystemMessages,
          system,
          abortSignal: signal,
        })

        let fullResponse = ""
        for await (const chunk of result.textStream) {
          fullResponse += chunk
          onChunk?.(chunk)
        }

        const [finishReason, usage] = await Promise.all([
          result.finishReason,
          result.usage,
        ])

        return {
          content: fullResponse,
          finishReason,
          usage,
        }
      }

      let fullResponse = ""

      const result = streamText({
        model: this.model,
        messages: nonSystemMessages,
        system,
        tools,
        stopWhen: stepCountIs(25),
        abortSignal: signal,
        onStepFinish: async (event) => {
          if (event.toolCalls?.length) {
            for (const tc of event.toolCalls) {
              onToolCall?.({ toolName: tc.toolName, args: (tc as any).input as Record<string, unknown> })
            }
          }
        },
      })

      for await (const chunk of result.textStream) {
        fullResponse += chunk
        onChunk?.(chunk)
      }

      const [finishReason, usage] = await Promise.all([
        result.finishReason,
        result.usage,
      ])

      return {
        content: fullResponse,
        finishReason,
        usage,
      }
    } catch (error: any) {
      if (error?.name === "AbortError") throw error
      console.error(chalk.red("OpenRouter Service Error:"), error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async getMessage(messages: ModelMessage[], tools?: any) {
    let fullResponse = ""
    const result = await this.sendMessage(messages, (chunk) => {
      fullResponse += chunk
    })
    return result.content
  }
}
