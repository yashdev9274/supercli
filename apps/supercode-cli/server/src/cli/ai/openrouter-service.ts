import { OpenRouter } from "@openrouter/sdk"
import chalk from "chalk"
import { openRouterConfig } from "../../config/openrouter.config.ts"
import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"

export class OpenRouterService {
  private client: OpenRouter
  readonly modelName: string

  constructor(model?: string) {
    if (!openRouterConfig.apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set in env")
    }

    this.modelName = model || openRouterConfig.model

    this.client = new OpenRouter({
      apiKey: openRouterConfig.apiKey,
      httpReferer: openRouterConfig.siteUrl || undefined,
      appTitle: openRouterConfig.siteTitle || undefined,
    })
  }

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    _tools?: any,
    _onToolCall?: any,
  ) {
    try {
      const apiMessages = messages.map((m) => ({
        role: m.role,
        content: String(m.content),
      }))

      const response: any = await this.client.chat.send({
        chatRequest: {
          model: this.modelName,
          messages: apiMessages as any,
          maxTokens: openRouterConfig.maxTokens,
          stream: true,
        },
      })

      let fullResponse = ""
      let finishReason: FinishReason = "stop"
      let inputTokens = 0
      let outputTokens = 0

      for await (const chunk of response) {
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          fullResponse += delta
          onChunk?.(delta)
        }

        if (chunk.choices?.[0]?.finishReason) {
          finishReason = mapFinishReason(chunk.choices[0].finishReason)
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.promptTokens ?? chunk.usage.prompt_tokens ?? 0
          outputTokens = chunk.usage.completionTokens ?? chunk.usage.completion_tokens ?? 0
        }
      }

      const usage: LanguageModelUsage = {
        inputTokens,
        inputTokenDetails: {
          noCacheTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens,
        outputTokenDetails: {
          textTokens: outputTokens,
          reasoningTokens: 0,
        },
        totalTokens: inputTokens + outputTokens,
      }

      return {
        content: fullResponse,
        finishResponse: Promise.resolve(finishReason),
        usage: Promise.resolve(usage),
      }
    } catch (error) {
      console.error(chalk.red("OpenRouter Service Error:"), error instanceof Error ? error.message : String(error))
      if (error instanceof Error && "cause" in error) {
        console.error(chalk.red("  Cause:"), String((error as any).cause))
      }
      throw error
    }
  }

  async getMessage(messages: ModelMessage[], _tools?: any) {
    let fullResponse = ""
    await this.sendMessage(messages, (chunk) => {
      fullResponse += chunk
    })
    return fullResponse
  }
}

function mapFinishReason(reason: string): FinishReason {
  switch (reason) {
    case "stop":
      return "stop"
    case "length":
    case "max_tokens":
      return "length"
    case "tool_calls":
      return "tool-calls"
    case "content_filter":
      return "content-filter"
    default:
      return "stop"
  }
}
