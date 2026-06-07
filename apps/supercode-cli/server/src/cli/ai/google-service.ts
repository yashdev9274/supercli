import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, generateObject, type ModelMessage } from "ai";
import { config } from "../../config/google.config.ts";
import chalk from "chalk";

export class AIService {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>

  constructor() {
    if (!config.googleApiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set in env");
    }

    const google = createGoogleGenerativeAI({
      apiKey: config.googleApiKey,
    })

    this.model = google(config.model)
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
        streamOptions.maxSteps = 5 // allow limit tool calling
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

      const fullResult = result;

      const toolCalls = [];
      const toolResults = [];

      if (fullResult.steps && Array.isArray(fullResult.steps)) {
        for (const step of fullResult.steps) {
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const toolCall of step.toolCalls) {
              toolCalls.push(toolCall);

              if (onToolCall) {
                onToolCall({ toolName: toolCall.toolName, args: toolCall.input as Record<string, unknown> });
              }
            }
          }

          if (step.toolResults && step.toolResults.length > 0) {
            toolResults.push(...step.toolResults);
          }
        }
      }


      return {
        content: fullResponse,
        finishResponse: result.finishReason,
        usage: result.usage,
        toolCalls,
        toolResults,
        step: fullResult.steps
      }
    } catch (error) {
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
