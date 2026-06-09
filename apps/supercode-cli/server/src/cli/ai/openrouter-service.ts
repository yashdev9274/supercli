import { type ModelMessage } from "ai"
import { openRouterConfig } from "../../config/openrouter.config.ts"
import chalk from "chalk"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

function isServerTool(name: string): boolean {
  return name === "web_search" || name === "url_fetch"
}

function serverTool(name: string): any {
  if (name === "web_search") return { type: "openrouter:web_search" }
  if (name === "url_fetch") return { type: "openrouter:web_fetch" }
  return null
}

function zodToJsonSchema(schema: any): any {
  return typeof schema === "object" && "toJSON" in (schema as any)
    ? (schema as any).toJSON()
    : schema
}

export class OpenRouterService {
  readonly modelName: string

  constructor(model?: string) {
    if (!openRouterConfig.apiKey) {
      throw new Error("OpenRouter is not configured.\n\n  Set OPENROUTER_API_KEY in your environment:\n    export OPENROUTER_API_KEY=<your-key>\n\n  Get a key at: https://openrouter.ai/keys")
    }

    this.modelName = model || openRouterConfig.model
  }

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
    signal?: AbortSignal,
  ) {
    const systemMessages = messages.filter(m => m.role === "system")
    const nonSystemMessages = messages.filter(m => m.role !== "system")
    const system = systemMessages.map(m => m.content).join("\n")

    const apiMessages: any[] = []
    if (system) apiMessages.push({ role: "system", content: system })
    for (const m of nonSystemMessages) {
      if (m.role === "assistant" && (m as any).tool_calls) {
        const msg: any = { role: "assistant", content: m.content }
        msg.tool_calls = (m as any).tool_calls
        apiMessages.push(msg)
      } else {
        apiMessages.push({ role: m.role, content: m.content as string })
      }
    }

    const apiTools: any[] = []
    const functionTools: Record<string, any> = {}
    if (tools) {
      for (const [name, def] of Object.entries(tools as Record<string, any>)) {
        if (isServerTool(name)) {
          apiTools.push(serverTool(name))
        } else {
          apiTools.push({
            type: "function",
            function: {
              name,
              description: def.description || "",
              parameters: zodToJsonSchema(def.parameters),
            },
          })
          functionTools[name] = def
        }
      }
    }

    const allMessages = [...apiMessages]
    const maxToolIterations = 25
    let fullResponse = ""

    for (let iter = 0; iter < maxToolIterations; iter++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
      if (fullResponse) onChunk?.("\n\n")

      const body: any = {
        model: this.modelName,
        messages: allMessages,
        stream: true,
      }
      if (apiTools.length > 0) body.tools = apiTools
      if (this.modelName.includes("minimax-m3") || this.modelName.includes("glm-5.1")) {
        body.max_tokens = 8192
      }

      const res = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown error")
        throw new Error(`OpenRouter API ${res.status}: ${errText.slice(0, 500)}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""
      let toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = []
      let finishReason = ""

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
          if (jsonStr === "[DONE]") continue

          try {
            const data = JSON.parse(jsonStr)
            const delta = data.choices?.[0]?.delta
            const finish = data.choices?.[0]?.finish_reason

            if (finish) finishReason = finish

            if (delta?.content) {
              fullResponse += delta.content
              onChunk?.(delta.content)
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCalls.find(t => t.id === tc.id)
                if (existing) {
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
                } else {
                  toolCalls.push({
                    id: tc.id,
                    type: tc.type || "function",
                    function: {
                      name: tc.function?.name || "",
                      arguments: tc.function?.arguments || "",
                    },
                  })
                }
              }
            }
          } catch { /* skip malformed */ }
        }
      }

      if (finishReason === "tool_calls" && toolCalls.length > 0) {
        const assistantMsg: any = { role: "assistant", content: null }
        assistantMsg.tool_calls = toolCalls.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }))
        allMessages.push(assistantMsg)

        for (const tc of toolCalls) {
          const toolName = tc.function.name
          const toolDef = functionTools[toolName]
          let toolResult: string

          if (toolDef?.execute) {
            let args: any = {}
            try { args = JSON.parse(tc.function.arguments || "{}") } catch { /* */ }
            onToolCall?.({ toolName, args })
            try { toolResult = await toolDef.execute(args) } catch (err: any) { toolResult = `Error: ${err.message || String(err)}` }
          } else {
            toolResult = `Tool "${toolName}" is not available locally`
          }

          allMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
          })
        }

        toolCalls = []
        finishReason = ""
        continue
      }

      break
    }

    return {
      content: fullResponse,
      finishResponse: Promise.resolve("stop" as any),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 } as any),
    }
  }

  async getMessage(messages: ModelMessage[], tools?: any) {
    let fullResponse = ""
    await this.sendMessage(messages, (chunk) => { fullResponse += chunk }, tools)
    return fullResponse
  }
}
