import { getStoredToken } from "src/lib/token"
import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import { isEmptyToolResult, isDeniedToolResult, summarizeToolResult } from "./tool-result"
import { appendProxyUsage } from "src/lib/token-budget"
import { parseStreamedContent, KNOWN_TOOL_NAMES } from "src/lib/embedded-tool-calls"
import prisma from "src/lib/prisma"
import { stripOrphanToolCalls } from "./sanitize-messages"
import { serializeToolsForHttp } from "./tools-util"
import { getSupercodeServerUrl } from "src/lib/load-env"

const MAX_STEPS = 8

async function getUserIdFromToken(): Promise<string | null> {
  const token = await getStoredToken()
  if (!token?.access_token) return null
  try {
    // Bound DB lookup — never stall the turn waiting on Prisma/Neon.
    const lookup = prisma.session.findUnique({
      where: { token: token.access_token as string },
      select: { userId: true },
    })
    const session = await Promise.race([
      lookup,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ])
    return session?.userId ?? null
  } catch {
    return null
  }
}

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
    // Shared helper converts AI SDK 6 `inputSchema` (Zod) → JSON Schema.
    return serializeToolsForHttp(tools) ?? tools
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

    // Safety timeout: even though the server now bounds the upstream work,
    // don't let a stalled server hang the turn forever on the client side.
    // Separate first-token timeout so a silent stream fails with a clear error.
    // Default 90s: Concentrate TTFT + tool-heavy prompts often exceed 45s even
    // when the cloud is healthy; status heartbeats still reset this timer.
    const controller = new AbortController()
    const timeoutMs = Number(process.env.SUPERCODE_REQUEST_TIMEOUT_MS) || 180_000
    const firstTokenMs = Number(process.env.SUPERCODE_FIRST_TOKEN_TIMEOUT_MS) || 90_000
    let sawActivity = false
    const timeoutId = setTimeout(() => {
      if (!signal?.aborted) controller.abort(new Error("Request timed out"))
    }, timeoutMs)
    const firstTokenId = setTimeout(() => {
      if (!sawActivity && !signal?.aborted && !controller.signal.aborted) {
        controller.abort(
          new Error(
            `No response from model within ${Math.round(firstTokenMs / 1000)}s. ` +
              "The provider may be overloaded — try again or run /model to switch.",
          ),
        )
      }
    }, firstTokenMs)
    const onAbort = () => controller.abort()
    if (signal) {
      if (signal.aborted) controller.abort()
      else signal.addEventListener("abort", onAbort, { once: true })
    }
    const cleanup = () => {
      clearTimeout(timeoutId)
      clearTimeout(firstTokenId)
      if (signal) signal.removeEventListener("abort", onAbort)
    }

try {
      const serverUrl = getSupercodeServerUrl()
      const res = await fetch(`${serverUrl}/api/ai/chat`, {
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
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        if (text.includes("Insufficient Funds") || text.includes("Credit usage at configured limit")) {
          cleanup()
          return {
            content: "You've used your limits. Resets in 24hrs.",
            finishReason: "stop" as FinishReason,
            usage: {
              inputTokens: 0,
              inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
              outputTokens: 0,
              outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
              totalTokens: 0,
            },
            toolCalls: [],
          }
        }
        cleanup()
        throw new Error(text || "AI proxy request failed")
      }

      // Headers arrived — count as activity so first-token timer doesn't fire
      // while the body is still empty (server may still be waiting on upstream).
      // Prefer explicit NDJSON status/reasoning/text events below for UI labels.
      if (!sawActivity) {
        sawActivity = true
        clearTimeout(firstTokenId)
      }

      const reader = res.body?.getReader()
      if (!reader) {
        cleanup()
        throw new Error("No response body")
      }

      const decoder = new TextDecoder()
      let buffer = ""
      let fullResponse = ""
      let finishReason: FinishReason = "stop"
      let serverError: string | null = null
      let usage: LanguageModelUsage = {
        inputTokens: 0,
        inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokens: 0,
        outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
        totalTokens: 0,
      }
      // Client-side safety net: MiniMax (and other models) sometimes leak tool
      // calls as raw text. Recover them here for every provider/tier, even when
      // the remote server hasn't been redeployed with the latest parser.
      const known = new Set(KNOWN_TOOL_NAMES)
      if (tools && typeof tools === "object") {
        for (const name of Object.keys(tools)) known.add(name)
      }
      const embedded = parseStreamedContent({ knownTools: known })
      const pushEmbeddedCall = (name: string, args: Record<string, unknown>, id?: string) => {
        const toolCallId = id || `call_${Date.now()}_${toolCalls.length}`
        // Dedupe against structured tool-call events already received.
        const key = `${name}:${JSON.stringify(args)}`
        if (toolCalls.some((c) => `${c.toolName}:${JSON.stringify(c.args)}` === key)) return
        toolCalls.push({ toolName: name, args, toolCallId })
        onToolCall?.({ toolName: name, args })
      }

      // Soft body-stall watchdog: if headers came back but no model activity
      // (text/reasoning/tool) arrives for firstTokenMs, abort with a clear error.
let sawModelActivity = false
      let bodyStallId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (!sawModelActivity && !signal?.aborted && !controller.signal.aborted) {
          controller.abort(
            new Error(
              `No model output within ${Math.round(firstTokenMs / 1000)}s after connecting. ` +
                "The provider may be overloaded — try again or run /model to switch.",
            ),
          )
        }
      }, firstTokenMs)
      const clearBodyStall = () => {
        if (bodyStallId) clearTimeout(bodyStallId)
        bodyStallId = null
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
case "status": {
                // Server progress heartbeats (connecting / plan-gate / upstream).
                // Reset body-stall timer so long gate/upstream waits don't abort
                // while the server is still making progress, and surface via
                // onReasoning so the TUI status row can show real phases.
                const msg =
                  typeof event.message === "string"
                    ? event.message
                    : typeof event.phase === "string"
                      ? event.phase
                      : "cloud working"
                clearBodyStall()
                // re-arm stall from this heartbeat
                bodyStallId = setTimeout(() => {
                  if (!sawModelActivity && !signal?.aborted && !controller.signal.aborted) {
                    controller.abort(
                      new Error(
                        `No model output within ${Math.round(firstTokenMs / 1000)}s after last server status. ` +
                          "The provider may be overloaded — try again or run /model to switch.",
                      ),
                    )
                  }
                }, firstTokenMs)
                onReasoning?.(`[status] ${msg}`)
                break
              }
              case "text": {
                // Route through the embedded parser so MiniMax junk never
                // reaches the TUI, and any inline tool descriptors become
                // real tool-call events.
                if (!sawModelActivity) {
                  sawModelActivity = true
                  clearBodyStall()
                }
                const blk = embedded.push(typeof event.content === "string" ? event.content : "")
                if (blk.text) {
                  fullResponse += blk.text
                  onChunk?.(blk.text)
                }
                for (const call of blk.calls) {
                  pushEmbeddedCall(call.name, call.args, call.id || undefined)
                }
                break
              }
              case "reasoning":
                if (!sawModelActivity) {
                  sawModelActivity = true
                  clearBodyStall()
                }
                onReasoning?.(event.content)
                break
              case "tool-call":
                if (!sawModelActivity) {
                  sawModelActivity = true
                  clearBodyStall()
                }
                toolCalls.push({
                  toolName: event.toolName,
                  args: event.args,
                  toolCallId: event.toolCallId || `call_${Date.now()}_${toolCalls.length}`,
                })
                onToolCall?.({ toolName: event.toolName, args: event.args })
                break
              case "error":
                // The server surfaces explicit upstream/empty-result failures
                // as an error event. Throw so the caller's error handling runs
                // instead of silently reporting an empty turn.
                serverError = event.message || "AI proxy error"
                break
              case "finish":
                finishReason = event.reason || "stop"
                if (event.usage) usage = event.usage
                break
            }
          } catch { /* skip malformed */ }
        }
      }
      clearBodyStall()

      // Flush any trailing prose / completed descriptors held by the parser.
      const flushed = embedded.flush()
      if (flushed.text) {
        fullResponse += flushed.text
        onChunk?.(flushed.text)
      }
      for (const call of flushed.calls) {
        pushEmbeddedCall(call.name, call.args, call.id || undefined)
      }
      if (toolCalls.length > 0 && finishReason === "stop") {
        finishReason = "tool-calls" as FinishReason
      }

      cleanup()
      if (serverError) throw new Error(serverError)
      return { content: fullResponse, finishReason, usage, toolCalls }
    } catch (err: any) {
      cleanup()
      // Prefer abort reason when fetch throws a generic AbortError with no message.
      const reason = (controller.signal as any).reason
      if (reason instanceof Error && reason.message) throw reason
      if (typeof reason === "string" && reason) throw new Error(reason)
      throw err
    }
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
    // Strip orphan tool_calls from history before forwarding to the upstream
    // model. An assistant message with `tool_calls` but no following `tool`
    // message with the matching `tool_call_id` causes ConcentrateAI (and most
    // OpenAI-compatible providers) to 400 with "function_call ... missing
    // function_call_output". This can happen when:
    //   - a prior turn streamed tool-call events but errored/closed before
    //     the matching tool result was emitted,
    //   - the chat UI dropped/stripped tool messages during compaction or
    //     history replay (formatMessagesForAI flattens them to prose), or
    //   - the client re-fetched a stale conversation snapshot mid-turn.
    //
    // We never strip a tool_calls entry whose paired tool message is missing
    // from THIS same forwarding call — we only drop orphans (any tool_call_id
    // that isn't echoed by a subsequent `tool` message in the same array).
    let currentMessages: ModelMessage[] = stripOrphanToolCalls(messages as ModelMessage[])
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
// Never block the first request on Prisma — resolve userId in parallel and
    // only need it for post-turn usage accounting.
    const userIdPromise = getUserIdFromToken()

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

const userId = await userIdPromise.catch(() => null)
    if (userId && (usage.totalTokens ?? 0) > 0) {
      appendProxyUsage({
        provider: this.providerName,
        model: this.modelName,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        userId,
        timestamp: Date.now(),
      }).catch((e) => console.error("[proxy-usage] Failed to record:", e?.message))
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

const res = await fetch(`${getSupercodeServerUrl()}/api/ai/generate-object`, {
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
      if (text.includes("Insufficient Funds") || text.includes("Credit usage at configured limit")) {
        return {
          object: { message: "You've used your limits. Resets in 24hrs." },
        }
      }
      throw new Error(text || "AI proxy generate-object request failed")
    }

    return res.json() as Promise<{ object: unknown }>
  }
}
