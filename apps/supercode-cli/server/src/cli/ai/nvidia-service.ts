import chalk from "chalk"
import { nvidiaConfig } from "../../config/nvidia.config.ts"
import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import { zodToJsonSchema } from "zod-to-json-schema"

export class NvidiaService {
  readonly modelName: string
  private readonly baseUrl: string

  constructor(model?: string) {
    if (!nvidiaConfig.apiKey) {
      throw new Error("NVIDIA_API_KEY is not set in env")
    }

    this.modelName = model || nvidiaConfig.model
    this.baseUrl = nvidiaConfig.baseUrl
  }

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
  ) {
    try {
      const bodyObj: any = {
        model: this.modelName,
        messages: messages.map((m) => ({ role: m.role, content: String(m.content) })),
        max_tokens: nvidiaConfig.maxTokens,
        temperature: nvidiaConfig.temperature,
        top_p: nvidiaConfig.topP,
        stream: true,
      }

      const seenToolCallIds = new Set<string>()

      if (tools && Object.keys(tools).length > 0) {
        bodyObj.tools = toolsToOpenAI(tools)
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${nvidiaConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyObj),
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => "unknown error")
        throw new Error(`NVIDIA API ${response.status}: ${errText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""
      let fullResponse = ""
      let finishReason: FinishReason = "stop"
      let inputTokens = 0
      let outputTokens = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith("data: ")) continue

          const jsonStr = trimmed.slice(6)
          if (jsonStr === "[DONE]") break

          try {
            const data = JSON.parse(jsonStr)

            const delta = data.choices?.[0]?.delta
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

            if (data.choices?.[0]?.finish_reason) {
              finishReason = mapFinishReason(data.choices[0].finish_reason)
            }

            if (data.usage) {
              inputTokens = data.usage.prompt_tokens ?? 0
              outputTokens = data.usage.completion_tokens ?? 0
            }
          } catch {
            // skip malformed JSON lines
          }
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
      console.error(chalk.red("NVIDIA Service Error:"), error instanceof Error ? error.message : String(error))
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
