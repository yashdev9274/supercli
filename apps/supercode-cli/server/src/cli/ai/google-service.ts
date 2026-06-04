import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, type ModelMessage } from "ai";
import { config } from "../../config/google.config.ts";
import chalk from "chalk";

export class AIService {
  private model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>

  constructor() {
    if (!config.googleApiKey) {
      throw new Error("GOOGLE_API_KEY is not set in env");
    }

    const google = createGoogleGenerativeAI({
      apiKey: config.googleApiKey,
    })

    this.model = google(config.model)
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
          streamOptions.experimental_onToolCallStart = ({ toolName, args }: { toolName: string; args: unknown }) => {
            onToolCall({ toolName, args: args as Record<string, unknown> })
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
      console.error(chalk.red("AI Service Error:"), error instanceof Error ? error.message : String(error))
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
