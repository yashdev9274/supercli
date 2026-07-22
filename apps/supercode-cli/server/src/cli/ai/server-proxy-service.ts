import { getStoredToken } from "src/lib/token"
import { zodToJsonSchema } from "zod-to-json-schema"
import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import { isEmptyToolResult, isDeniedToolResult, summarizeToolResult } from "./tool-result"

const BASE_URL = process.env.SUPERCODE_SERVER_URL || "https://supercode-8w7e.onrender.com"

const MAX_STEPS = 8

export class ServerProxyService {
  readonly modelName: string
  readonly providerName: string
  private readonly apiKey?: string

  constructor(provider: string, model?: string, apiKey?: string) {
    this.providerName = provider
    this.modelName = model || "default"
    this.apiKey = apiKey
  }

  private collectedToolCalls: Array<{ toolName: string; args: Record<string, unknown>; toolCallId: string }> = []

  /**
   * Convert the local AI-SDK tool objects (which carry live Zod
   * `inputSchema`s) into a plain-JSON definitions map before sending them
   * to the server. The server forwards these definitions to the model's
   * OpenAI-compatible API, which requires JSON Schema — NOT a Zod object.
   *
   * Sending the raw Zod schema is doubly broken: JSON.stringify drops the
   * `shape()` function inside `_def`, so the schema arrives as a ZodObject
   * with no fields, and the server's `toolParams` then emits an empty
   * `{ type: "object", properties: {} }`. The model never learns what
   * arguments a tool needs, so every call fails argument validation.
   *
   * Converting here (while the Zod schema is still intact) produces a
   * correct JSON Schema with `required`/`properties`, so the model can
   * call tools with the right parameters.
   */
  private serializeTools(tools: any): any {
    if (!tools || typeof tools !== "object") return tools
    const out: Record<string, { description: string; parameters: object }> = {}
    for (const [name, fn] of Object.entries(tools)) {
      const def = fn as any
      const schema = def.inputSchema ?? def.parameters
      let parameters: object = { type: "object", properties: {} }
      if (schema) {
        if (typeof schema === "object" && "_def" in schema) {
          const json = zodToJsonSchema(schema, { $refStrategy: "none" }) as any
          if (json && typeof json === "object" && "$schema" in json) {
            delete json.$schema
          }
          parameters = json ?? parameters
        } else {
          parameters = schema
        }
      }
      out[name] = { description: def.description || "", parameters }
    }
    return out
  }

  private async request(
    messages: ModelMessage[],
    tools?: any,
    onChunk?: (chunk: string) => void,
    onToolCall?: (call: { toolName: string; args: Record<string, unknown> }) => void,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
  ): Promise<{
    content: string
    finishReason: FinishReason
    usage: LanguageModelUsage
    toolCalls: Array<{ toolName: string; args: Record<string, unknown>; toolCallId: string }>
  }> {
    const toolCalls: Array<{ toolName: string; args: Record<string, unknown>; toolCallId: string }> = []
    const token = await getStoredToken()
    if (!token?.access_token) {
      throw new Error("Not authenticated. Please login first.")
    }

    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify({
        messages,
        provider: this.providerName,
        model: this.modelName,
        tools,
        ...(this.apiKey && this.providerName === "concentrateai" ? { concentrateAiKey: this.apiKey } : {}),
      }),
      signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || "AI proxy request failed")
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""
    let fullResponse = ""
    let finishReason: FinishReason = "stop"
    let usage: LanguageModelUsage = {
      inputTokens: 0,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokens: 0,
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
      totalTokens: 0,
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const event = JSON.parse(trimmed)
          switch (event.type) {
            case "text":
              fullResponse += event.content
              onChunk?.(event.content)
              break
            case "reasoning":
              onReasoning?.(event.content)
              break
            case "tool-call":
              toolCalls.push({
                toolName: event.toolName,
                args: event.args,
                toolCallId: event.toolCallId || `call_${Date.now()}_${toolCalls.length}`,
              })
              onToolCall?.({ toolName: event.toolName, args: event.args })
              break
            case "finish":
              finishReason = event.reason || "stop"
              if (event.usage) usage = event.usage
              break
          }
        } catch { /* skip malformed */ }
      }
    }

    return { content: fullResponse, finishReason, usage, toolCalls }
  }

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: (call: { toolName: string; args: Record<string, unknown> }) => void,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
    onToolResult?: (params: { toolName: string; args: unknown; result: string }) => void,
    onStepFinish?: (params: { stepNumber: number; toolCalls: Array<{ toolName: string; args: unknown }>; toolResults: Array<{ toolName: string; args: unknown; result: string }> }) => void,
  ) {
    let currentMessages = [...messages]
    let accumulatedContent = ""
    let finishReason: FinishReason = "stop"
    let usage: LanguageModelUsage = {
      inputTokens: 0,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokens: 0,
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
      totalTokens: 0,
    }

    this.collectedToolCalls = []
    let stepCount = 0
    const seenStepResults: Array<{ toolName: string; result: string }> = []
    const deniedCounts = new Map<string, number>()
    const toolCallHistory: Array<{ toolName: string; argsKey: string }> = []

    // Convert tools to JSON-schema definitions ONCE (while the Zod schemas
    // are still intact) so the server can hand valid parameter schemas to
    // the model API. See serializeTools for why this is required.
    const serializedTools = this.serializeTools(tools)

    // Multi-turn loop: keep calling the server as long as the AI requests tool calls
    while (true) {
      stepCount++

      // Hard stop: don't make another API call if we've exceeded the budget.
      // The previous round already injected the final notice.
      if (stepCount > MAX_STEPS) break

      // Inject "final round" notice on the last allowed step so the model
      // can choose to produce text instead of calling more tools.
      if (stepCount === MAX_STEPS - 1) {
        currentMessages.push({
          role: "system" as const,
          content:
            `SYSTEM NOTICE: This is your ${stepCount === 1 ? "first" : `${stepCount}th`} ` +
            `tool-call round, but the maximum is ${MAX_STEPS}. ` +
            `After this round you get 1 more, then you MUST produce a text response. ` +
            "If you call more tools after the next round the system will stop you. " +
            "Analyze what you have now and plan your final response.",
        })
      }
      // Final notice — this is your absolute last chance to produce text.
      if (stepCount === MAX_STEPS) {
        currentMessages.push({
          role: "system" as const,
          content:
            `SYSTEM NOTICE: This is your LAST round (${MAX_STEPS}). ` +
            "You MUST produce a text response now. Do not call any tools. " +
            "Summarize what you found so far. If you call tools now, " +
            "your response will be discarded and the user sees 'no analysis'.",
        })
      }

      // Inject empty-result sentinel if previous step's tools all returned empty.
      if (seenStepResults.length > 0) {
        const allEmpty = seenStepResults.every((r) => isEmptyToolResult(r.result))
        if (allEmpty) {
          const summary = seenStepResults
            .map((r) => `- ${r.toolName}: ${summarizeToolResult(r.result)}`)
            .join("\n")
          currentMessages.push({
            role: "system" as const,
            content:
              "SYSTEM NOTICE: All tool calls in the previous round returned empty or error results. " +
              "You have NO source material to answer with. Do NOT invent facts. " +
              "Tell the user which tools failed and what you need to proceed.\n\nTool outcomes:\n" + summary,
          })
        }
      }
      // Inject repetition/denial sentinel if applicable.
      const last3 = [...toolCallHistory]
      let repeated = false
      for (const h of last3) {
        let count = 0
        for (const h2 of last3) {
          if (h2.toolName === h.toolName && h2.argsKey === h.argsKey) count++
        }
        if (count >= 3) {
          repeated = true
          break
        }
      }
      if (repeated) {
        currentMessages.push({
          role: "system" as const,
          content:
            "SYSTEM NOTICE: You have called the same tool with the same arguments " +
            "multiple times without making progress. Stop repeating yourself. " +
            "Analyze what you already have and respond to the user.",
        })
      }
      let sawDenial = false
      for (const [, count] of deniedCounts) {
        if (count >= 2) {
          sawDenial = true
          break
        }
      }
      if (sawDenial) {
        currentMessages.push({
          role: "system" as const,
          content:
            "SYSTEM NOTICE: You have called the same permission-protected tool multiple " +
            "times after the user denied it. Stop calling it. Respond to the user with " +
            "what you have so far and ask for guidance.",
        })
      }

      const result = await this.request(currentMessages, serializedTools, onChunk, onToolCall, signal, onReasoning)

      accumulatedContent += result.content
      finishReason = result.finishReason
      usage = result.usage

      if (result.toolCalls.length === 0) break

      // Execute each tool and build the continuation messages
      const stepResults: Array<{ toolName: string; args: unknown; result: string }> = []
      for (const call of result.toolCalls) {
        const toolFn = tools?.[call.toolName]
        let toolResult: string

        if (toolFn?.execute) {
          // Validate tool args against the Zod inputSchema before executing.
          // The remote AI may return tool calls with missing or malformed args
          // (e.g. run_command with no "command" field), which would produce
          // confusing output like "$ undefined" and near-instant failures.
          let validated = call.args
          if (toolFn.inputSchema) {
            const parsed = (toolFn.inputSchema as any).safeParse(call.args)
            if (parsed?.success) {
              validated = parsed.data
            } else {
              toolResult = JSON.stringify({
                error: `Invalid arguments for ${call.toolName}`,
                issues: parsed?.error?.issues || [],
                received: call.args,
              })
              stepResults.push({ toolName: call.toolName, args: call.args, result: toolResult })
              if (onToolResult) {
                onToolResult({ toolName: call.toolName, args: call.args, result: toolResult })
              }
              // Skip execution — send the validation error back to the AI
              currentMessages.push({
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: call.toolCallId,
                    type: "function",
                    function: { name: call.toolName, arguments: JSON.stringify(call.args) },
                  },
                ],
              } as any)
              currentMessages.push({
                role: "tool",
                tool_call_id: call.toolCallId,
                content: toolResult,
              } as any)
              this.collectedToolCalls.push(call)
              continue
            }
          }
          try {
            toolResult = await toolFn.execute(validated)
          } catch (err: any) {
            toolResult = JSON.stringify({ error: err.message || "Tool execution failed" })
          }
        } else {
          toolResult = JSON.stringify({ error: `Tool "${call.toolName}" is not available locally` })
        }

        stepResults.push({ toolName: call.toolName, args: call.args, result: toolResult })

        if (onToolResult) {
          onToolResult({ toolName: call.toolName, args: call.args, result: toolResult })
        }

        // Add the assistant's tool call request to the message history
        currentMessages.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: call.toolCallId,
              type: "function",
              function: {
                name: call.toolName,
                arguments: JSON.stringify(call.args),
              },
            },
          ],
        } as any)

        // Add the tool execution result
        currentMessages.push({
          role: "tool",
          tool_call_id: call.toolCallId,
          content: toolResult,
        } as any)

        this.collectedToolCalls.push(call)
      }

      // Track per-step results for empty-result sentinel (next iteration).
      seenStepResults.length = 0
      for (const sr of stepResults) {
        seenStepResults.push({ toolName: sr.toolName, result: sr.result })
        if (isDeniedToolResult(sr.result)) {
          const prev = deniedCounts.get(sr.toolName) ?? 0
          deniedCounts.set(sr.toolName, prev + 1)
        } else {
          deniedCounts.set(sr.toolName, 0)
        }
      }
      // Track tool call repetition.
      for (const call of result.toolCalls) {
        const argsKey = JSON.stringify(call.args, Object.keys(call.args).sort())
        toolCallHistory.push({ toolName: call.toolName, argsKey })
      }
      if (toolCallHistory.length > 12) {
        toolCallHistory.splice(0, toolCallHistory.length - 12)
      }

      // Per-step finish notification for the chat loop's live per-step UI.
      if (onStepFinish && result.toolCalls.length > 0) {
        onStepFinish({
          stepNumber: this.collectedToolCalls.length,
          toolCalls: result.toolCalls.map((c: any) => ({ toolName: c.toolName, args: c.args })),
          toolResults: stepResults,
        })
      }
    }

    // If the loop exhausted its budget but tools ran and no text was produced,
    // make one final non-streaming request asking the model to summarize what
    // it found so far. Without this, the user sees "no analysis" despite the
    // model having gathered useful information.
    if (!accumulatedContent.trim() && this.collectedToolCalls.length > 0) {
      const finalMessages = [
        ...currentMessages,
        {
          role: "system" as const,
          content:
            "SYSTEM NOTICE: You have used all available tool-call rounds without producing a text response. " +
            "You MUST now produce a text summary based on the tool results you already have. " +
            "Do not call any more tools. Analyze what you found and respond to the user.",
        },
      ]
      try {
        const finalResult = await this.request(finalMessages, undefined, onChunk, undefined, signal, onReasoning)
        if (finalResult.content.trim()) {
          accumulatedContent = finalResult.content
          finishReason = finalResult.finishReason
          usage = finalResult.usage
        }
      } catch (err: any) {
        // Don't mask a user abort as a fallback message.
        if (err?.name === "AbortError" || signal?.aborted) throw err
        // Surface the failure instead of silently returning empty content
        // (which would otherwise show as "no analysis text returned").
        const count = this.collectedToolCalls.length
        const detail = err?.message ? `: ${err.message}` : ""
        const fallback = `(Ran ${count} tool call${count === 1 ? "" : "s"} but couldn't generate a final summary${detail}.)`
        onChunk?.(fallback)
        accumulatedContent = fallback
      }
    }

    return {
      content: accumulatedContent,
      finishReason,
      usage,
    }
  }

  async getMessage(messages: ModelMessage[]) {
    let fullResponse = ""
    await this.sendMessage(messages, (chunk) => {
      fullResponse += chunk
    })
    return fullResponse
  }

  async generateObject(schema: any, prompt: string) {
    const token = await getStoredToken()
    if (!token?.access_token) {
      throw new Error("Not authenticated. Please login first.")
    }

    const res = await fetch(`${BASE_URL}/api/ai/generate-object`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify({
        provider: this.providerName,
        model: this.modelName,
        schema,
        prompt,
        ...(this.apiKey && this.providerName === "concentrateai" ? { concentrateAiKey: this.apiKey } : {}),
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || "AI proxy generate-object request failed")
    }

    return res.json() as Promise<{ object: unknown }>
  }
}
