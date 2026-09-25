/**
 * Cloud AI proxy client.
 *
 * POST /api/ai/chat → NDJSON stream (status/text/reasoning/tool-call/error/finish).
 * Local multi-step tool execution with empty/denial/repetition guards.
 * Final-summary request when the step budget is exhausted without text.
 */
import { getStoredToken } from "src/lib/token"
import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"
import {
  DenialLoopGuard,
  ToolCallRepetitionGuard,
  denialLoopNotice,
  isEmptyToolResult,
  repetitionNotice,
  summarizeToolResult,
} from "./tool-result"
import { appendProxyUsage } from "src/lib/token-budget"
import { parseStreamedContent, KNOWN_TOOL_NAMES } from "src/lib/embedded-tool-calls"
import prisma from "src/lib/prisma"
import { stripOrphanToolCalls } from "./sanitize-messages"
import { serializeToolsForHttp, validateToolArgs } from "./tools-util"
import { getSupercodeServerUrl } from "src/lib/load-env"

const MAX_STEPS = 8

function emptyUsage(): LanguageModelUsage {
  return {
    inputTokens: 0,
    inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    outputTokens: 0,
    outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    totalTokens: 0,
  }
}

type ToolCall = {
  toolName: string
  args: Record<string, unknown>
  toolCallId: string
}

type StreamCallbacks = {
  onChunk?: (chunk: string) => void
  onToolCall?: (call: { id?: string; toolName: string; args: Record<string, unknown> }) => void
  onReasoning?: (chunk: string) => void
  signal?: AbortSignal
}

type RequestResult = {
  content: string
  finishReason: FinishReason
  usage: LanguageModelUsage
  toolCalls: ToolCall[]
}

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

function creditLimitMessage(): string {
  return "You've used your limits. Resets in 24hrs."
}

function isCreditLimitError(text: string): boolean {
  return text.includes("Insufficient Funds") || text.includes("Credit usage at configured limit")
}

function stepBudgetNotice(stepCount: number): string | null {
  if (stepCount === MAX_STEPS - 1) {
    return (
      `SYSTEM NOTICE: This is your ${stepCount === 1 ? "first" : `${stepCount}th`} ` +
      `tool-call round, but the maximum is ${MAX_STEPS}. ` +
      `After this round you get 1 more, then you MUST produce a text response. ` +
      "If you call more tools after the next round the system will stop you. " +
      "Analyze what you have now and plan your final response."
    )
  }
  if (stepCount === MAX_STEPS) {
    return (
      `SYSTEM NOTICE: This is your LAST round (${MAX_STEPS}). ` +
      "You MUST produce a text response now. Do not call any tools. " +
      "Summarize what you found so far. If you call tools now, " +
      "your response will be discarded and the user sees 'no analysis'."
    )
  }
  return null
}

function pushAssistantToolCall(messages: ModelMessage[], call: ToolCall) {
  messages.push({
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
}

function pushToolResult(messages: ModelMessage[], call: ToolCall, content: string) {
  messages.push({
    role: "tool",
    tool_call_id: call.toolCallId,
    content,
  } as any)
}

export class ServerProxyService {
  readonly modelName: string
  readonly providerName: string
  private readonly apiKey?: string
  private collectedToolCalls: ToolCall[] = []

  constructor(provider: string, model?: string, apiKey?: string) {
    this.providerName = provider
    this.modelName = model || "default"
    this.apiKey = apiKey
  }

  /** Convert live Zod tool schemas → JSON Schema for the HTTP body. */
  private serializeTools(tools: any): any {
    return serializeToolsForHttp(tools) ?? tools
  }

  private authBodyExtras(): Record<string, string> {
    if (this.apiKey && this.providerName === "concentrateai") {
      return { concentrateAiKey: this.apiKey }
    }
    return {}
  }

  /**
   * Single NDJSON stream request to the cloud proxy.
   * Does not run tools — callers handle multi-step execution.
   */
  private async request(
    messages: ModelMessage[],
    tools?: any,
    onChunk?: (chunk: string) => void,
    onToolCall?: (call: { id?: string; toolName: string; args: Record<string, unknown> }) => void,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
  ): Promise<RequestResult> {
    const toolCalls: ToolCall[] = []
    const token = await getStoredToken()
    if (!token?.access_token) {
      throw new Error("Not authenticated. Please login first.")
    }

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
          ...this.authBodyExtras(),
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        cleanup()
        if (isCreditLimitError(text)) {
          return {
            content: creditLimitMessage(),
            finishReason: "stop" as FinishReason,
            usage: emptyUsage(),
            toolCalls: [],
          }
        }
        throw new Error(text || "AI proxy request failed")
      }

      // Headers arrived — count as activity so first-token timer doesn't fire
      // while the body is still empty (server may still be waiting on upstream).
      if (!sawActivity) {
        sawActivity = true
        clearTimeout(firstTokenId)
      }

      return await this.readNdjsonStream(res, {
        tools,
        toolCalls,
        onChunk,
        onToolCall,
        onReasoning,
        signal,
        controller,
        firstTokenMs,
        cleanup,
      })
    } catch (err: any) {
      cleanup()
      const reason = (controller.signal as any).reason
      if (reason instanceof Error && reason.message) throw reason
      if (typeof reason === "string" && reason) throw new Error(reason)
      throw err
    }
  }

  private async readNdjsonStream(
    res: Response,
    opts: {
      tools?: any
      toolCalls: ToolCall[]
      onChunk?: (chunk: string) => void
      onToolCall?: (call: { id?: string; toolName: string; args: Record<string, unknown> }) => void
      onReasoning?: (chunk: string) => void
      signal?: AbortSignal
      controller: AbortController
      firstTokenMs: number
      cleanup: () => void
    },
  ): Promise<RequestResult> {
    const {
      tools,
      toolCalls,
      onChunk,
      onToolCall,
      onReasoning,
      signal,
      controller,
      firstTokenMs,
      cleanup,
    } = opts

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
    let usage: LanguageModelUsage = emptyUsage()

    // Client-side safety net: MiniMax (and others) sometimes leak tool calls as text.
    const known = new Set(KNOWN_TOOL_NAMES)
    if (tools && typeof tools === "object") {
      for (const name of Object.keys(tools)) known.add(name)
    }
    const embedded = parseStreamedContent({ knownTools: known })

    const pushEmbeddedCall = (name: string, args: Record<string, unknown>, id?: string) => {
      const toolCallId = id || `call_${Date.now()}_${toolCalls.length}`
      const key = `${name}:${JSON.stringify(args)}`
      if (toolCalls.some((c) => `${c.toolName}:${JSON.stringify(c.args)}` === key)) return
      toolCalls.push({ toolName: name, args, toolCallId })
      onToolCall?.({ id: toolCallId, toolName: name, args })
    }

    // Soft body-stall watchdog after headers.
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

    const markModelActivity = () => {
      if (!sawModelActivity) {
        sawModelActivity = true
        clearBodyStall()
      }
    }

    const rearmStallFromHeartbeat = () => {
      clearBodyStall()
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
              const msg =
                typeof event.message === "string"
                  ? event.message
                  : typeof event.phase === "string"
                    ? event.phase
                    : "cloud working"
              rearmStallFromHeartbeat()
              onReasoning?.(`[status] ${msg}`)
              break
            }
            case "text": {
              markModelActivity()
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
              markModelActivity()
              onReasoning?.(event.content)
              break
            case "tool-call":
              markModelActivity()
              toolCalls.push({
                toolName: event.toolName,
                args: event.args,
                toolCallId: event.toolCallId || `call_${Date.now()}_${toolCalls.length}`,
              })
              onToolCall?.({ id: toolCalls[toolCalls.length - 1]?.toolCallId, toolName: event.toolName, args: event.args })
              break
            case "error":
              serverError = event.message || "AI proxy error"
              break
            case "finish":
              finishReason = event.reason || "stop"
              if (event.usage) usage = event.usage
              break
          }
        } catch {
          /* skip malformed */
        }
      }
    }

    clearBodyStall()

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
  }

  private async executeLocalTools(
    tools: any,
    calls: ToolCall[],
    currentMessages: ModelMessage[],
    onToolResult?: (params: { id?: string; toolName: string; args: unknown; result: string }) => void,
  ): Promise<Array<{ toolName: string; args: unknown; result: string }>> {
    const stepResults: Array<{ toolName: string; args: unknown; result: string }> = []

    for (const call of calls) {
      const toolFn = tools?.[call.toolName]
      let toolResult: string

      if (toolFn?.execute) {
        const validated = validateToolArgs(toolFn, call.args)
        if (!validated.ok) {
          toolResult = JSON.stringify({
            error: `Invalid arguments for ${call.toolName}`,
            issues: validated.issues,
            received: validated.received,
          })
          stepResults.push({ toolName: call.toolName, args: call.args, result: toolResult })
          onToolResult?.({ id: call.toolCallId, toolName: call.toolName, args: call.args, result: toolResult })
          pushAssistantToolCall(currentMessages, call)
          pushToolResult(currentMessages, call, toolResult)
          this.collectedToolCalls.push(call)
          continue
        }

        try {
          toolResult = await toolFn.execute(validated.data)
        } catch (err: any) {
          toolResult = JSON.stringify({ error: err.message || "Tool execution failed" })
        }
      } else {
        toolResult = JSON.stringify({ error: `Tool "${call.toolName}" is not available locally` })
      }

      stepResults.push({ toolName: call.toolName, args: call.args, result: toolResult })
      onToolResult?.({ id: call.toolCallId, toolName: call.toolName, args: call.args, result: toolResult })
      pushAssistantToolCall(currentMessages, call)
      pushToolResult(currentMessages, call, toolResult)
      this.collectedToolCalls.push(call)
    }

    return stepResults
  }

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: (call: { id?: string; toolName: string; args: Record<string, unknown> }) => void,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
    onToolResult?: (params: { id?: string; toolName: string; args: unknown; result: string }) => void,
    onStepFinish?: (params: {
      stepNumber: number
      toolCalls: Array<{ toolName: string; args: unknown }>
      toolResults: Array<{ toolName: string; args: unknown; result: string }>
    }) => void,
  ) {
    // Strip orphan tool_calls before forwarding — unpaired tool_calls 400 most
    // OpenAI-compatible providers (ConcentrateAI especially).
    let currentMessages: ModelMessage[] = stripOrphanToolCalls(messages as ModelMessage[])
    let accumulatedContent = ""
    let finishReason: FinishReason = "stop"
    let usage: LanguageModelUsage = emptyUsage()

    this.collectedToolCalls = []
    let stepCount = 0
    const seenStepResults: Array<{ toolName: string; result: string }> = []
    const denialGuard = new DenialLoopGuard()
    const repetitionGuard = new ToolCallRepetitionGuard()

    // Never block the first request on Prisma — resolve userId in parallel.
    const userIdPromise = getUserIdFromToken()
    const serializedTools = this.serializeTools(tools)

    while (true) {
      stepCount++
      if (stepCount > MAX_STEPS) break

      const budget = stepBudgetNotice(stepCount)
      if (budget) {
        currentMessages.push({ role: "system" as const, content: budget })
      }

      // Empty-result sentinel from previous step.
      if (seenStepResults.length > 0 && seenStepResults.every((r) => isEmptyToolResult(r.result))) {
        const summary = seenStepResults
          .map((r) => `- ${r.toolName}: ${summarizeToolResult(r.result)}`)
          .join("\n")
        currentMessages.push({
          role: "system" as const,
          content:
            "SYSTEM NOTICE: All tool calls in the previous round returned empty or error results. " +
            "You have NO source material to answer with. Do NOT invent facts. " +
            "Tell the user which tools failed and what you need to proceed.\n\nTool outcomes:\n" +
            summary,
        })
      }

      // Repetition / denial sentinels.
      let repeated = false
      for (const h of repetitionGuard.entries) {
        let count = 0
        for (const h2 of repetitionGuard.entries) {
          if (h2.toolName === h.toolName && h2.argsKey === h.argsKey) count++
        }
        if (count >= 3) {
          repeated = true
          break
        }
      }
      if (repeated) {
        currentMessages.push({ role: "system" as const, content: repetitionNotice() })
      }
      if (denialGuard.hasActiveDenial) {
        currentMessages.push({ role: "system" as const, content: denialLoopNotice() })
      }

      const result = await this.request(
        currentMessages,
        serializedTools,
        onChunk,
        onToolCall,
        signal,
        onReasoning,
      )

      accumulatedContent += result.content
      finishReason = result.finishReason
      usage = result.usage

      if (result.toolCalls.length === 0) break

      const stepResults = await this.executeLocalTools(
        tools,
        result.toolCalls,
        currentMessages,
        onToolResult,
      )

      seenStepResults.length = 0
      for (const sr of stepResults) {
        seenStepResults.push({ toolName: sr.toolName, result: sr.result })
        denialGuard.record(sr.toolName, sr.result)
      }
      for (const call of result.toolCalls) {
        repetitionGuard.record(call.toolName, call.args)
      }

      if (onStepFinish && result.toolCalls.length > 0) {
        onStepFinish({
          stepNumber: this.collectedToolCalls.length,
          toolCalls: result.toolCalls.map((c) => ({ toolName: c.toolName, args: c.args })),
          toolResults: stepResults,
        })
      }
    }

    // Budget exhausted with tools but no text → final summary request.
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
        const finalResult = await this.request(
          finalMessages,
          undefined,
          onChunk,
          undefined,
          signal,
          onReasoning,
        )
        if (finalResult.content.trim()) {
          accumulatedContent = finalResult.content
          finishReason = finalResult.finishReason
          usage = finalResult.usage
        }
      } catch (err: any) {
        if (err?.name === "AbortError" || signal?.aborted) throw err
        const count = this.collectedToolCalls.length
        const detail = err?.message ? `: ${err.message}` : ""
        const fallback =
          `(Ran ${count} tool call${count === 1 ? "" : "s"} but couldn't generate a final summary${detail}.)`
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
        ...this.authBodyExtras(),
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      if (isCreditLimitError(text)) {
        return { object: { message: creditLimitMessage() } }
      }
      throw new Error(text || "AI proxy generate-object request failed")
    }

    return res.json() as Promise<{ object: unknown }>
  }
}
