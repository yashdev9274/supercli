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
      const result = streamText({
        model: this.model,
        messages,
      })

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
