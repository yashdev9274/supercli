import { OpenRouter } from "@openrouter/sdk"
import chalk from "chalk"
import { openRouterConfig } from "../../config/openrouter.config.ts"
import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import { zodToJsonSchema } from "zod-to-json-schema"

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
    tools?: any,
    onToolCall?: any,
  ) {
    try {
      const apiMessages = messages.map((m) => ({
        role: m.role,
        content: String(m.content),
      }))

      const body: any = {
        model: this.modelName,
        messages: apiMessages,
        maxTokens: openRouterConfig.maxTokens,
        stream: true,
      }

      const seenToolCallIds = new Set<string>()

      if (tools && Object.keys(tools).length > 0) {
        body.tools = toolsToOpenAI(tools)
      }

      const response: any = await this.client.chat.send({
        chatRequest: body,
      })

      let fullResponse = ""
      let finishReason: FinishReason = "stop"
      let inputTokens = 0
      let outputTokens = 0

      for await (const chunk of response) {
        const delta = chunk.choices?.[0]?.delta
        if (delta?.content) {
          fullResponse += delta.content
          onChunk?.(delta.content)
        }

        if (delta?.tool_calls && onToolCall) {
          for (const tc of delta.tool_calls) {
            if (tc.id && !seenToolCallIds.has(tc.id)) {
              seenToolCallIds.add(tc.id)
              const name = tc.function?.name || "unknown"
              let args: Record<string, unknown> = {}
              try {
                if (tc.function?.arguments) {
                  args = JSON.parse(tc.function.arguments)
                }
              } catch {
                // partial streaming JSON
              }
              onToolCall({ toolName: name, args })
            }
          }
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

function toolsToOpenAI(tools: Record<string, any>): any[] {
  return Object.entries(tools).map(([name, tool]) => ({
    type: "function",
    function: {
      name,
      description: tool.description || "",
      parameters: zodToJsonSchema(tool.parameters),
    },
  }))
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
