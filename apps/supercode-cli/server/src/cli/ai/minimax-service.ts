import { createMinimax } from "vercel-minimax-ai-provider"
import { streamText, type ModelMessage } from "ai"
import { minimaxConfig } from "../../config/minimax.config.ts"
import chalk from "chalk"

export class MinimaxService {
  model: ReturnType<ReturnType<typeof createMinimax>>

  constructor() {
    if (!minimaxConfig.apiKey) {
      throw new Error("MiniMax is not configured.\n\n  Set MINIMAX_API_KEY in your environment:\n    export MINIMAX_API_KEY=<your-key>")
    }

    const minimax = createMinimax({
      apiKey: minimaxConfig.apiKey,
    })

    this.model = minimax(minimaxConfig.model)
  }

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
  ) {
    try {
      const systemMessages = messages.filter(m => m.role === "system")
      const nonSystemMessages = messages.filter(m => m.role !== "system")
      const system = systemMessages.map(m => m.content).join("\n")

      const streamOptions: any = {
        model: this.model,
        messages: nonSystemMessages,
        maxTokens: Number(process.env.MINIMAX_MAX_TOKENS) || 4096,
      }

      if (system) {
        streamOptions.system = system
      }

      if (tools && Object.keys(tools).length > 0) {
        streamOptions.tools = tools
        streamOptions.maxSteps = 25
        if (onToolCall) {
          streamOptions.experimental_onToolCallStart = (event: any) => {
            const tc = event.toolCall
            onToolCall({ toolName: tc.toolName, args: tc.input as Record<string, unknown> })
          }
        }
      }

      const result = streamText(streamOptions)

      let fullResponse = ""

      for await (const chunk of result.textStream) {
        fullResponse += chunk
        onChunk?.(chunk)
      }

      return {
        content: fullResponse,
        finishResponse: result.finishReason,
        usage: result.usage,
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
