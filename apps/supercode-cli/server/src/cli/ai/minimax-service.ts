import { createMinimax } from "vercel-minimax-ai-provider"
import { streamText, type ModelMessage, type FinishReason } from "ai"
import { minimaxConfig } from "../../config/minimax.config.ts"
import chalk from "chalk"
import { executeToolLoop } from "./tool-executor.ts"
import {
  prepareMessages,
  hasTools,
  trackProviderUsage,
  drainReasoningStream,
} from "./adapters/stream-helpers.ts"

/**
 * MiniMax — uses vercel-minimax provider + shared tool/stream helpers.
 */
export class MinimaxService {
  model: ReturnType<ReturnType<typeof createMinimax>>
  readonly modelName: string

  constructor() {
    if (!minimaxConfig.apiKey) {
      throw new Error(
        "MiniMax is not configured.\n\n  Set MINIMAX_API_KEY in your environment:\n    export MINIMAX_API_KEY=<your-key>",
      )
    }
    this.modelName = minimaxConfig.model
    const minimax = createMinimax({ apiKey: minimaxConfig.apiKey })
    this.model = minimax(this.modelName)
  }

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
    onToolResult?: (params: { toolName: string; args: unknown; result: string }) => void,
    onStepFinish?: (params: {
      stepNumber: number
      toolCalls: Array<{ toolName: string; args: unknown }>
      toolResults: Array<{ toolName: string; args: unknown; result: string }>
    }) => void,
  ) {
    try {
      const { system, messages: nonSystem } = prepareMessages(messages)

      if (hasTools(tools)) {
        const { content, usage } = await executeToolLoop(
          this.model,
          nonSystem,
          system,
          tools,
          { onChunk, onToolCall, onReasoning, onToolResult, onStepFinish, signal },
        )
        const resolved = await usage
        trackProviderUsage({
          provider: "minimax",
          model: this.modelName,
          usage: {
            inputTokens: resolved.inputTokens ?? 0,
            outputTokens: resolved.outputTokens ?? 0,
            totalTokens: resolved.totalTokens ?? 0,
          },
        })
        return {
          content,
          finishReason: "stop" as FinishReason,
          usage: resolved,
        }
      }

      const streamOptions: any = {
        model: this.model,
        messages: nonSystem,
        maxTokens: Number(process.env.MINIMAX_MAX_TOKENS) || 4096,
        abortSignal: signal,
      }
      if (system) streamOptions.system = system

      const result = streamText(streamOptions)
      let fullResponse = ""
      await Promise.all([
        drainReasoningStream(result, onReasoning),
        (async () => {
          for await (const chunk of result.textStream) {
            fullResponse += chunk
            onChunk?.(chunk)
          }
        })(),
      ])

      const [finishReason, usage] = await Promise.all([
        result.finishReason,
        result.usage,
      ])
      trackProviderUsage({ provider: "minimax", model: this.modelName, usage })
      return { content: fullResponse, finishReason, usage }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (
        message.includes("insufficient balance") ||
        message.includes("402") ||
        message.includes("1008")
      ) {
        console.error(
          chalk.red("MiniMax API Error:"),
          "Insufficient balance. Top up at https://platform.minimax.ai",
        )
        throw new Error(
          "MiniMax API: insufficient balance (402).\n\n" +
            "  Your MiniMax account has insufficient credits.\n" +
            "  Top up at: https://platform.minimax.ai\n" +
            "  Or switch to a different provider.",
        )
      }
      console.error(chalk.red("MiniMax Service Error:"), message)
      throw error
    }
  }

  async getMessage(messages: ModelMessage[], tools?: any) {
    let fullResponse = ""
    await this.sendMessage(messages, (chunk) => {
      fullResponse += chunk
    }, tools)
    return fullResponse
  }
}
