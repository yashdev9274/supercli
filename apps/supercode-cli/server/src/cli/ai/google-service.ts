import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, generateObject, stepCountIs, type ModelMessage } from "ai";
import { config } from "../../config/google.config.ts";
import chalk from "chalk";

export class AIService {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>
  readonly modelName: string

  constructor(modelName?: string) {
    if (!config.googleApiKey) {
      throw new Error("Google Gemini is not configured.\n\n  Set GOOGLE_GENERATIVE_AI_API_KEY in your environment:\n    export GOOGLE_GENERATIVE_AI_API_KEY=<your-key>\n\n  Get a key at: https://aistudio.google.com/apikey");
    }

    this.modelName = modelName || config.model

    const google = createGoogleGenerativeAI({
      apiKey: config.googleApiKey,
    })

    this.model = google(this.modelName)
  }

  async generateStructured(
    schema: any,
    prompt: string,
  ): Promise<any> {
    try {
      const result = await generateObject({
        model: this.model,
        schema,
        prompt,
      })
      return result.object
    } catch (error) {
      console.error(
        chalk.red("AI Structured Generation Error:"),
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }
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
      console.error(chalk.red("AI Service Error:"), error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async getMessage(messages: ModelMessage[], tools?: any) {
    let fullResponse = ""
    const result = await this.sendMessage(messages, (chunk) => {
      fullResponse += chunk
    })
    return result.content;
  }
}
