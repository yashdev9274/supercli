import { createMinimax } from "vercel-minimax-ai-provider"
import { streamText, type ModelMessage } from "ai"
import { minimaxConfig } from "../../config/minimax.config.ts"
import chalk from "chalk"

export class MinimaxService {
  model: ReturnType<ReturnType<typeof createMinimax>>

  constructor() {
    if (!minimaxConfig.apiKey) {
      throw new Error("MINIMAX_API_KEY is not set in env")
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
      }

      if (system) {
        streamOptions.system = system
      }

      if (tools && Object.keys(tools).length > 0) {
        streamOptions.tools = tools
        streamOptions.maxSteps = 5
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
      console.error(chalk.red("MiniMax Service Error:"), error instanceof Error ? error.message : String(error))
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
