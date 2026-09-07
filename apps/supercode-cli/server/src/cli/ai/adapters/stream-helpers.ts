import type { ModelMessage } from "ai"
import { recordUsage } from "../../../lib/track-usage"
import { computeCost } from "../../../lib/pricing"
import { stripOrphanToolCalls } from "../sanitize-messages"

export type SplitMessages = {
  system: string
  messages: ModelMessage[]
}

/** Drop orphan tool_calls and split system vs non-system messages. */
export function prepareMessages(messages: ModelMessage[]): SplitMessages {
  const sanitized = stripOrphanToolCalls(messages)
  const systemMessages = sanitized.filter((m) => m.role === "system")
  const nonSystemMessages = sanitized.filter((m) => m.role !== "system")
  const system = systemMessages
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join("\n")
  return { system, messages: nonSystemMessages }
}

export function hasTools(tools: unknown): boolean {
  return !!(tools && typeof tools === "object" && Object.keys(tools as object).length > 0)
}

export type UsageLike = {
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  inputTokenDetails?: { cacheReadTokens?: number | null }
}

/** Record usage via track-usage + pricing (opaque billing helpers). */
export function trackProviderUsage(opts: {
  provider: string
  model: string
  usage: UsageLike
  durationMs?: number | null
}): void {
  const input = opts.usage.inputTokens ?? 0
  const output = opts.usage.outputTokens ?? 0
  const cached = opts.usage.inputTokenDetails?.cacheReadTokens ?? 0
  recordUsage({
    provider: opts.provider,
    model: opts.model,
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cached,
    totalTokens: opts.usage.totalTokens ?? input + output,
    costUsd: computeCost(opts.model, input, output, cached),
    durationMs: opts.durationMs ?? null,
  })
}

/**
 * Combine parent AbortSignal with a wall-clock timeout (and optional first-token timeout).
 * Returns controller + cleanup + markActivity for first-token tracking.
 */
export function createStreamGuard(opts: {
  signal?: AbortSignal
  /** Overall stream timeout ms (default 120_000). Set 0 to disable. */
  timeoutMs?: number
  /** First-token timeout ms (default 0 = off). */
  firstTokenMs?: number
}): {
  controller: AbortController
  markActivity: () => void
  get sawActivity(): boolean
  cleanup: () => void
  firstTokenTimedOut: () => boolean
} {
  const controller = new AbortController()
  const timeoutMs = opts.timeoutMs ?? 120_000
  const firstTokenMs = opts.firstTokenMs ?? 0
  let sawActivity = false
  let firstTokenTimedOut = false

  const streamTimeout =
    timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null

  const firstTokenTimeout =
    firstTokenMs > 0
      ? setTimeout(() => {
          if (!sawActivity && !controller.signal.aborted) {
            firstTokenTimedOut = true
            controller.abort()
          }
        }, firstTokenMs)
      : null

  const onParentAbort = opts.signal
    ? () => controller.abort()
    : undefined
  if (onParentAbort && opts.signal) {
    opts.signal.addEventListener("abort", onParentAbort, { once: true })
  }

  return {
    controller,
    markActivity: () => {
      if (!sawActivity) {
        sawActivity = true
        if (firstTokenTimeout) clearTimeout(firstTokenTimeout)
      }
    },
    get sawActivity() {
      return sawActivity
    },
    firstTokenTimedOut: () => firstTokenTimedOut,
    cleanup: () => {
      if (streamTimeout) clearTimeout(streamTimeout)
      if (firstTokenTimeout) clearTimeout(firstTokenTimeout)
      if (onParentAbort && opts.signal) {
        opts.signal.removeEventListener("abort", onParentAbort)
      }
    },
  }
}

/** Map generic 5xx gateway errors into a friendly message. */
export function friendlyGatewayError(
  providerLabel: string,
  error: unknown,
): Error | null {
  const msg = error instanceof Error ? error.message : String(error)
  // Escape label for RegExp; use string concat so `\s` / `\d` survive the template.
  const escaped = providerLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const labeled5xx = new RegExp(escaped + "\\s+(?:API\\s+)?5\\d\\d", "i")
  const is5xx =
    labeled5xx.test(msg) ||
    /status code 5\d\d/i.test(msg) ||
    /HTTP 5\d\d/i.test(msg)
  if (!is5xx) return null
  return new Error(
    `${providerLabel} gateway error (HTTP 5xx). This is upstream — not your request. ` +
      `Try again, or run /model to switch providers.\n  ${msg}`,
  )
}

export async function drainReasoningStream(
  result: any,
  onReasoning?: (chunk: string) => void,
): Promise<void> {
  if (!onReasoning) return
  const stream = result?.reasoningStream || result?.reasoningText
  if (!stream || typeof stream !== "object") {
    if (typeof stream === "string" && stream.length > 0) onReasoning(stream)
    return
  }
  try {
    if (Symbol.asyncIterator in stream) {
      for await (const chunk of stream) {
        onReasoning(typeof chunk === "string" ? chunk : String(chunk))
      }
    }
  } catch {
    // reasoning stream may not be supported
  }
}
