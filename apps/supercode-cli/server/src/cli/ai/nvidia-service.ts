import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText, stepCountIs, type ModelMessage, type LanguageModel } from "ai"
import { nvidiaConfig } from "../../config/nvidia.config.ts"
import chalk from "chalk"
import { recordUsage } from "../../lib/track-usage"
import { computeCost } from "../../lib/pricing"

export class NvidiaService {
  model: LanguageModel
  readonly modelName: string

  constructor(modelName?: string) {
    if (!nvidiaConfig.apiKey) {
      throw new Error("NVIDIA NIM is not configured.\n\n  Set NVIDIA_API_KEY in your environment:\n    export NVIDIA_API_KEY=<your-key>\n\n  Get free credits at: https://build.nvidia.com")
    }

    this.modelName = modelName || nvidiaConfig.model

    const nim = createOpenAICompatible({
      name: "nim",
      baseURL: nvidiaConfig.baseUrl,
      headers: {
        Authorization: `Bearer ${nvidiaConfig.apiKey}`,
      },
    })

    this.model = nim.chatModel(this.modelName)
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

        recordUsage({
          provider: "nvidia",
          model: this.modelName,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          costUsd: computeCost(this.modelName, usage.inputTokens ?? 0, usage.outputTokens ?? 0, usage.inputTokenDetails?.cacheReadTokens ?? 0),
          durationMs: null,
        })

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

      recordUsage({
        provider: "nvidia",
        model: this.modelName,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        costUsd: computeCost(this.modelName, usage.inputTokens ?? 0, usage.outputTokens ?? 0, usage.inputTokenDetails?.cacheReadTokens ?? 0),
        durationMs: null,
      })

      return {
        content: fullResponse,
        finishReason,
        usage,
      }
    } catch (error: any) {
      if (error?.name === "AbortError") throw error
      console.error(chalk.red("NVIDIA Service Error:"), error instanceof Error ? error.message : String(error))
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
