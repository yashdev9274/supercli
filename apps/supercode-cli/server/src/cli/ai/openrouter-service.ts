import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { streamText, type ModelMessage } from "ai"
import { openRouterConfig } from "../../config/openrouter.config.ts"
import chalk from "chalk"

export class OpenRouterService {
  readonly modelName: string
  model: any

  constructor(model?: string) {
    if (!openRouterConfig.apiKey) {
      throw new Error("OpenRouter is not configured.\n\n  Set OPENROUTER_API_KEY in your environment:\n    export OPENROUTER_API_KEY=<your-key>\n\n  Get a key at: https://openrouter.ai/keys")
    }

    this.modelName = model || openRouterConfig.model

    const openrouter = createOpenRouter({
      apiKey: openRouterConfig.apiKey,
    })

    this.model = openrouter(this.modelName)
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
      console.error(chalk.red("OpenRouter Service Error:"), error instanceof Error ? error.message : String(error))
      if (error instanceof Error && "cause" in error) {
        console.error(chalk.red("  Cause:"), String((error as any).cause))
      }
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
