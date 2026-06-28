import { createMinimax } from "vercel-minimax-ai-provider"
import { streamText, type ModelMessage, type FinishReason } from "ai"
import { minimaxConfig } from "../../config/minimax.config.ts"
import chalk from "chalk"
import { executeToolLoop } from "./tool-executor.ts"
import { recordUsage } from "../../lib/track-usage"
import { computeCost } from "../../lib/pricing"

export class MinimaxService {
  model: ReturnType<ReturnType<typeof createMinimax>>
  readonly modelName: string

  constructor() {
    if (!minimaxConfig.apiKey) {
      throw new Error("MiniMax is not configured.\n\n  Set MINIMAX_API_KEY in your environment:\n    export MINIMAX_API_KEY=<your-key>")
    }

    this.modelName = minimaxConfig.model

    const minimax = createMinimax({
      apiKey: minimaxConfig.apiKey,
    })

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
  ) {
    try {
      const systemMessages = messages.filter(m => m.role === "system")
      const nonSystemMessages = messages.filter(m => m.role !== "system")
      const system = systemMessages.map(m => m.content).join("\n")

      if (tools && Object.keys(tools).length > 0) {
        const { content, usage } = await executeToolLoop(
          this.model,
          nonSystemMessages,
          system,
          tools,
          { onChunk, onToolCall, onReasoning, onToolResult, signal },
        )
        const resolved = await usage
        recordUsage({
          provider: "minimax",
          model: this.modelName,
          inputTokens: resolved.inputTokens ?? 0,
          outputTokens: resolved.outputTokens ?? 0,
          cachedInputTokens: 0,
          totalTokens: resolved.totalTokens ?? 0,
          costUsd: computeCost(this.modelName, resolved.inputTokens ?? 0, resolved.outputTokens ?? 0, 0),
          durationMs: null,
        })
        return {
          content,
          finishReason: "stop" as FinishReason,
          usage,
        }
      }

      const streamOptions: any = {
        model: this.model,
        messages: nonSystemMessages,
        maxTokens: Number(process.env.MINIMAX_MAX_TOKENS) || 4096,
        abortSignal: signal,
      }

      if (system) streamOptions.system = system

      const result = streamText(streamOptions)

      let fullResponse = ""

      const processReasoning = async () => {
        const stream = (result as any).reasoningStream || (result as any).reasoningText
        if (stream && typeof stream === "object" && onReasoning) {
          try {
            if (Symbol.asyncIterator in stream) {
              for await (const chunk of stream) {
                onReasoning(typeof chunk === "string" ? chunk : String(chunk))
              }
            } else if (typeof stream === "string" && stream.length > 0) {
              onReasoning(stream)
            }
          } catch {
            // reasoning stream may not be supported
          }
        }
      }

      const processText = async () => {
        for await (const chunk of result.textStream) {
          fullResponse += chunk
          onChunk?.(chunk)
        }
      }

      await Promise.all([processReasoning(), processText()])

      const [finishReason, usage] = await Promise.all([
        result.finishReason,
        result.usage,
      ])

      recordUsage({
        provider: "minimax",
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("insufficient balance") || message.includes("402") || message.includes("1008")) {
        console.error(chalk.red("MiniMax API Error:"), "Insufficient balance. Top up at https://platform.minimax.ai")
        throw new Error(
          "MiniMax API: insufficient balance (402).\n\n" +
          "  Your MiniMax account has insufficient credits.\n" +
          "  Top up at: https://platform.minimax.ai\n" +
          "  Or switch to a different provider."
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
    })
    return fullResponse
  }
}
