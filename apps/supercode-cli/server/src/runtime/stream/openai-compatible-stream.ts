// Shared SSE stream handler for OpenAI-compatible chat completions.
// Used by every server provider path (openrouter, nvidia, mergedev,
// orcarouter, concentrateai, supercode) so MiniMax-style inline tool
// descriptors and reasoning deltas are handled the same way regardless
// of model, tier, or environment.

import type { Response } from "express"
import {
  parseStreamedContent,
  KNOWN_TOOL_NAMES,
  type EmbeddedToolCall,
} from "./embedded-tool-calls"
import {
  createThinkSplitter,
  finalizeAnswerVsProcess,
  splitThinkContent,
} from "./split-think-content"

/** Built-in tools + any request-scoped names (MCP, custom). */
export function mergeKnownTools(extra?: Iterable<string> | null): Set<string> {
  const set = new Set(KNOWN_TOOL_NAMES)
  if (extra) {
    for (const name of extra) {
      if (name) set.add(name)
    }
  }
  return set
}

export interface StreamUsage {
  inputTokens: number
  outputTokens: number
}

export interface StreamChatResult {
  fullContent: string
  reasoningContent: string
  emittedToolCalls: boolean
  usage: StreamUsage
}

// Structural type: callers pass `response.body.getReader()` whose concrete
// type varies across runtimes (Bun vs DOM libs disagree on `readMany`).
export interface StreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>
}

export interface StreamChatOptions {
  res: Response
  reader: StreamReader
  /** When true, also accept reasoning-only empty turns without erroring. */
  surfaceReasoningAsText?: boolean
  /** Extra tool names to accept in bare-JSON descriptors (e.g. MCP tools). */
  knownTools?: Set<string>
  /**
   * When true, do not write an empty-response error event. Use this when the
   * caller will retry non-streaming or surface its own fallback so the client
   * never sees a hard error that races a successful recovery.
   */
  suppressEmptyError?: boolean
}

function joinTextParts(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    return value.map((part) => joinTextParts(part)).join("")
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    if (typeof obj.text === "string") return obj.text
    if (typeof obj.content === "string") return obj.content
    if (typeof obj.summary === "string") return obj.summary
  }
  return ""
}

/** Visible assistant text from an OpenAI/OpenRouter stream delta. */
export function extractDeltaContent(delta: any): string {
  if (!delta) return ""
  return joinTextParts(delta.content)
}

/**
 * Reasoning / thinking text from an OpenAI/OpenRouter stream delta.
 * Ox Alpha (and other stealth reasoning models) put tokens in
 * `reasoning_details[]` rather than `content` or `reasoning_content`.
 */
export function extractDeltaReasoning(delta: any): string {
  if (!delta) return ""
  const chunks: string[] = []
  const direct = joinTextParts(delta.reasoning_content) || joinTextParts(delta.reasoning)
  if (direct) chunks.push(direct)
  if (Array.isArray(delta.reasoning_details)) {
    for (const detail of delta.reasoning_details) {
      const text = joinTextParts(detail)
      if (text) chunks.push(text)
    }
  }
  return chunks.join("")
}

/** Flatten AI-SDK / OpenAI message content (string or parts array) for upstream APIs. */
export function serializeChatContent(content: unknown): string {
  return joinTextParts(content)
}

function streamErrorMessage(data: any): string | null {
  const err = data?.error ?? data?.choices?.[0]?.error
  if (!err) return null
  if (typeof err === "string") return err
  if (typeof err?.message === "string") return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return "Upstream stream error"
  }
}

/**
 * Read an OpenAI-compatible SSE body, write NDJSON events to `res`, and
 * return summary stats. Handles:
 *   - delta.content (with embedded MiniMax/Kimi tool-call recovery)
 *   - delta.reasoning / delta.reasoning_content
 *   - delta.tool_calls (structured, streamed args)
 *   - finish_reason tool_calls flush + EOF flush of pending calls
 */
export async function streamOpenAICompatibleChat(
  opts: StreamChatOptions,
): Promise<StreamChatResult> {
  const { res, reader, knownTools, suppressEmptyError } = opts
  const decoder = new TextDecoder()
  let buffer = ""
  let inputTokens = 0
  let outputTokens = 0
  let fullContent = ""
  let reasoningContent = ""
  let sawToolCalls = false
  let emittedToolCalls = false
  let pendingToolCalls: Record<number, { id: string; name: string; args: string }> = {}
const embedded = parseStreamedContent({
    knownTools: mergeKnownTools(knownTools),
  })
  // DeepSeek / MiniMax / similar models embed private CoT inside <think>
  // (or </mm:think>) tags on the text channel. Split those into reasoning
  // so Result never shows the scratch pad.
  const thinkSplit = createThinkSplitter()
  const emittedKeys = new Set<string>()

  const emitToolCall = (name: string, args: Record<string, unknown>, id?: string) => {
    const key = `${name}:${JSON.stringify(args)}`
    if (emittedKeys.has(key)) return
    emittedKeys.add(key)
    sawToolCalls = true
    emittedToolCalls = true
    res.write(
      JSON.stringify({
        type: "tool-call",
        toolName: name,
        args,
        toolCallId: id || `call_${Date.now()}_${emittedKeys.size}`,
      }) + "\n",
    )
  }

  const flushPending = () => {
    for (const [, call] of Object.entries(pendingToolCalls)) {
      if (!call.name) continue
      // Models often finish tool_calls with empty / whitespace-only args for
      // zero-arg tools, or stream only the name before EOF. Treat missing or
      // blank args as `{}` so the call still executes instead of empty-error.
      const raw = (call.args ?? "").trim()
      try {
        const parsed = raw ? JSON.parse(raw) : {}
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          emitToolCall(call.name, parsed as Record<string, unknown>, call.id || undefined)
        } else {
          emitToolCall(call.name, {}, call.id || undefined)
        }
      } catch {
        // Partial JSON that never closed — still surface the name so the
        // client can retry rather than hard-fail as blank.
        sawToolCalls = true
      }
    }
    pendingToolCalls = {}
  }

  const emitEmbedded = (calls: EmbeddedToolCall[]) => {
    for (const call of calls) {
      emitToolCall(call.name, call.args, call.id || undefined)
    }
  }

  // Keep the NDJSON pipe warm while waiting on the first/next SSE chunk so
  // cloud clients (45s body-stall) don't abort during slow upstream TTFT.
  const heartbeatMs = Number(process.env.SUPERCODE_UPSTREAM_HEARTBEAT_MS) || 12_000
  let lastActivity = Date.now()
  let hbTicks = 0
  const heartbeatId = setInterval(() => {
    if (Date.now() - lastActivity < heartbeatMs - 500) return
    hbTicks += 1
    try {
      res.write(
        JSON.stringify({
          type: "status",
          phase: "upstream_wait",
          message: `waiting for model tokens · ${hbTicks * Math.round(heartbeatMs / 1000)}s`,
        }) + "\n",
      )
      // @ts-expect-error flush exists on some Node response wrappers
      if (typeof (res as any).flush === "function") (res as any).flush()
    } catch {
      /* response closed */
    }
  }, heartbeatMs)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      lastActivity = Date.now()
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
          const errMsg = streamErrorMessage(data)
          if (errMsg) {
            res.write(JSON.stringify({ type: "error", message: errMsg }) + "\n")
            continue
          }
          const delta = data.choices?.[0]?.delta

const contentChunk = extractDeltaContent(delta)
          if (contentChunk) {
            const blk = embedded.push(contentChunk)
            if (blk.text) {
              const split = thinkSplit.push(blk.text)
              if (split.reasoning) {
                reasoningContent += split.reasoning
                res.write(JSON.stringify({ type: "reasoning", content: split.reasoning }) + "\n")
              }
              if (split.text) {
                fullContent += split.text
                res.write(JSON.stringify({ type: "text", content: split.text }) + "\n")
              }
            }
            emitEmbedded(blk.calls)
          }

          const reasoningChunk = extractDeltaReasoning(delta)
          if (reasoningChunk) {
            reasoningContent += reasoningChunk
            res.write(JSON.stringify({ type: "reasoning", content: reasoningChunk }) + "\n")
          }

          if (delta?.tool_calls) {
            sawToolCalls = true
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0
              if (!pendingToolCalls[index]) {
                pendingToolCalls[index] = { id: "", name: "", args: "" }
              }
              if (tc.id) pendingToolCalls[index].id = tc.id
              if (tc.function?.name) pendingToolCalls[index].name = tc.function.name
              if (tc.function?.arguments) pendingToolCalls[index].args += tc.function.arguments
            }
          }

          const finishReason = data.choices?.[0]?.finish_reason
          if (finishReason === "tool_calls") {
            sawToolCalls = true
            flushPending()
          }

          if (data.usage) {
            inputTokens = data.usage.prompt_tokens ?? 0
            outputTokens = data.usage.completion_tokens ?? 0
          }
        } catch {
          /* skip malformed */
        }
      }

      // Stream can end with [DONE]/EOF without finish_reason tool_calls.
      if (sawToolCalls && Object.keys(pendingToolCalls).length > 0) {
        flushPending()
      }
    }
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      res.write(
        JSON.stringify({
          type: "error",
          message: `Upstream failure: ${err?.message ?? String(err)}`,
        }) + "\n",
      )
    }
  } finally {
    clearInterval(heartbeatId)
  }

// Release trailing prose / completed embedded descriptors.
  const flushed = embedded.flush()
  if (flushed.text) {
    const split = thinkSplit.push(flushed.text)
    if (split.reasoning) {
      reasoningContent += split.reasoning
      res.write(JSON.stringify({ type: "reasoning", content: split.reasoning }) + "\n")
    }
    if (split.text) {
      fullContent += split.text
      res.write(JSON.stringify({ type: "text", content: split.text }) + "\n")
    }
  }
  emitEmbedded(flushed.calls)

  // Flush any partial tag held across the last chunk boundary.
  {
    const tail = thinkSplit.flush()
    if (tail.reasoning) {
      reasoningContent += tail.reasoning
      res.write(JSON.stringify({ type: "reasoning", content: tail.reasoning }) + "\n")
    }
    if (tail.text) {
      fullContent += tail.text
      res.write(JSON.stringify({ type: "text", content: tail.text }) + "\n")
    }
  }

  // Final pending structured tool calls (if any remain).
  if (Object.keys(pendingToolCalls).length > 0) flushPending()

  // End-of-stream gate: untagged process monologue still on the text channel
  // (DeepSeek planning sentences without <think> tags) moves to reasoning.
  if (fullContent.trim()) {
    const cleaned = finalizeAnswerVsProcess(fullContent, reasoningContent)
    if (cleaned.reasoning && cleaned.reasoning !== reasoningContent.trim()) {
      const prior = reasoningContent.trim()
      const extra = cleaned.reasoning.startsWith(prior)
        ? cleaned.reasoning.slice(prior.length).trim()
        : cleaned.reasoning
      if (extra) {
        reasoningContent = cleaned.reasoning
        res.write(JSON.stringify({ type: "reasoning", content: extra }) + "\n")
      }
    }
    // We already streamed provisional text chunks; the CLI final gate also
    // re-filters. Keep fullContent as the cleaned answer for callers/stats.
    fullContent = cleaned.text
  }

  // Do NOT copy raw reasoning into the text/Result channel. DeepSeek-style
  // models often finish with only CoT; dumping it as "text" made Result show
  // the same scratch pad as Thinking. Keep reasoning on the reasoning stream;
  // empty visible answers are handled by the soft empty-response path below.

// DeepSeek/MiniMax sometimes emit only DSML/control tokens with no recoverable
  // tool call. Callers that retry non-streaming (concentrate/supercode) should
  // pass suppressEmptyError so this does not race a successful fallback.
  // Otherwise emit a soft retry hint — never a silent blank finish.
  if (!fullContent.trim() && !emittedToolCalls && !suppressEmptyError) {
    const soft =
      sawToolCalls || Object.keys(pendingToolCalls).length > 0
        ? "The model started a tool call but did not finish it. Retry the turn, or switch models with /model."
        : "Model returned an empty response. Try again or switch models with /model."
    res.write(
      JSON.stringify({
        type: "error",
        message: soft,
      }) + "\n",
    )
  }

  return {
    fullContent,
    reasoningContent,
    emittedToolCalls,
    usage: { inputTokens, outputTokens },
  }
}

/**
 * Parse a non-streaming OpenAI chat completion message into clean text +
 * tool calls (structured + embedded). Writes events to `res`.
 */
export function emitFromNonStreamingMessage(
  res: Response,
  message: any,
  reasoningFallback = "",
  knownTools?: Set<string>,
): { fullContent: string; emittedToolCalls: boolean } {
  let fullContent = ""
  let emittedToolCalls = false
  const content = message?.content ?? message?.reasoning_content ?? ""

if (content) {
    const parser = parseStreamedContent({
      knownTools: mergeKnownTools(knownTools),
    })
    const blk = parser.push(String(content))
    const flushed = parser.flush()
    const cleanText = `${blk.text}${flushed.text}`
    if (cleanText) {
      const split = finalizeAnswerVsProcess(cleanText)
      if (split.reasoning) {
        res.write(JSON.stringify({ type: "reasoning", content: split.reasoning }) + "\n")
      }
      if (split.text) {
        fullContent = split.text
        res.write(JSON.stringify({ type: "text", content: split.text }) + "\n")
      }
    }
    for (const call of [...blk.calls, ...flushed.calls]) {
      emittedToolCalls = true
      res.write(
        JSON.stringify({
          type: "tool-call",
          toolName: call.name,
          args: call.args,
          toolCallId: call.id || `call_fb_${Date.now()}`,
        }) + "\n",
      )
    }
  } else if (reasoningFallback.trim()) {
    // Prefer structured reasoning over dumping CoT into Result.
    const split = splitThinkContent(reasoningFallback)
    if (split.reasoning || !split.text) {
      const reason = split.reasoning || reasoningFallback
      res.write(JSON.stringify({ type: "reasoning", content: reason }) + "\n")
    }
    if (split.text) {
      fullContent = split.text
      res.write(JSON.stringify({ type: "text", content: split.text }) + "\n")
    }
  }

  const toolCalls = message?.tool_calls
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      const name = tc?.function?.name
      if (!name) continue
      let args: Record<string, unknown> = {}
      try {
        args =
          typeof tc.function.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : (tc.function.arguments ?? {})
      } catch {
        /* leave empty */
      }
      emittedToolCalls = true
      res.write(
        JSON.stringify({
          type: "tool-call",
          toolName: name,
          args,
          toolCallId: tc.id || `call_fb_${Date.now()}`,
        }) + "\n",
      )
    }
  }

  return { fullContent, emittedToolCalls }
}

export function writeFinish(
  res: Response,
  opts: {
    emittedToolCalls: boolean
    inputTokens: number
    outputTokens: number
  },
) {
  const { emittedToolCalls, inputTokens, outputTokens } = opts
  res.write(
    JSON.stringify({
      type: "finish",
      reason: emittedToolCalls ? "tool_calls" : "stop",
      usage: {
        inputTokens,
        outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 },
        outputTokens,
        inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        totalTokens: inputTokens + outputTokens,
      },
    }) + "\n",
  )
  res.end()
}
