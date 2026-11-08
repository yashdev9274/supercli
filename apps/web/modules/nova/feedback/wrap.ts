import {
  ActiveNovaFeedbackRecorder,
  NoopNovaFeedbackRecorder,
} from "./recorder"

import type {
  NovaExchangeContext,
  NovaFeedbackEventInput,
  NovaFeedbackRecorder,
} from "./types"

/** Map an existing `HarnessAgentEvent` from `apps/web/modules/nova/harness/agent`
 *  into a normalized feedback event. Read-only; never mutates the original. */
export function adaptHarnessEventToFeedback(
  event: Record<string, unknown>,
): NovaFeedbackEventInput | null {
  const type = typeof event["type"] === "string" ? (event["type"] as string) : ""
  switch (type) {
    case "status": {
      const phase = typeof event["phase"] === "string" ? event["phase"] : undefined
      const message = typeof event["message"] === "string" ? event["message"] : ""
      return {
        type: "status",
        ts: Date.now(),
        sequence: 0,
        payload: { phase: phase ?? null, message },
      }
    }
    case "text": {
      const content = typeof event["content"] === "string" ? event["content"] : ""
      return { type: "text", ts: Date.now(), sequence: 0, payload: { content } }
    }
    case "reasoning": {
      const content = typeof event["content"] === "string" ? event["content"] : ""
      return { type: "reasoning", ts: Date.now(), sequence: 0, payload: { content } }
    }
    case "tool-call": {
      const toolName = typeof event["toolName"] === "string" ? event["toolName"] : ""
      const toolCallId = typeof event["toolCallId"] === "string" ? event["toolCallId"] : ""
      const args = isObject(event["args"]) ? (event["args"] as Record<string, unknown>) : {}
      return {
        type: "tool_call",
        ts: Date.now(),
        sequence: 0,
        payload: { toolName, toolCallId, args },
      }
    }
    case "tool-result": {
      const toolName = typeof event["toolName"] === "string" ? event["toolName"] : ""
      const toolCallId = typeof event["toolCallId"] === "string" ? event["toolCallId"] : ""
      const status = typeof event["status"] === "string" ? event["status"] : "completed"
      const message = typeof event["message"] === "string" ? event["message"] : ""
      const args = isObject(event["args"]) ? (event["args"] as Record<string, unknown>) : {}
      const content = typeof event["content"] === "string" ? event["content"] : ""
      return {
        type: "tool_result",
        ts: Date.now(),
        sequence: 0,
        payload: { toolName, toolCallId, status, message, args, content },
      }
    }
    case "finish": {
      const reason = typeof event["reason"] === "string" ? event["reason"] : "stop"
      const usage = isObject(event["usage"]) ? (event["usage"] as Record<string, unknown>) : null
      return {
        type: "finish",
        ts: Date.now(),
        sequence: 0,
        payload: { reason, usage },
      }
    }
    case "error": {
      const message = typeof event["message"] === "string" ? event["message"] : ""
      return { type: "error", ts: Date.now(), sequence: 0, payload: { message } }
    }
    default:
      return null
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** Wraps an existing async generator so the harness sees the original
 *  events unchanged while every event is also recorded through the recorder. */
export async function* withFeedbackRecording<T extends Record<string, unknown>>(
  source: AsyncGenerator<T>,
  recorder: NovaFeedbackRecorder,
): AsyncGenerator<T> {
  // Do not dispose here — closeout must run after the stream, then the caller disposes.
  for await (const event of source) {
    try {
      const mapped = adaptHarnessEventToFeedback(event as Record<string, unknown>)
      if (mapped) {
        recorder.record(mapped)
      }
    } catch {
      // never let feedback observation interfere with the response path
    }
    yield event
  }
}

/** Resolves a recorder instance for the given context. */
export function buildRecorder(
  override: "active" | "noop" | undefined,
): ActiveNovaFeedbackRecorder | NoopNovaFeedbackRecorder {
  if (override === "active") return new ActiveNovaFeedbackRecorder()
  if (override === "noop") return new NoopNovaFeedbackRecorder()
  const flag = (process.env.NOVA_FEEDBACK_ENABLED ?? "true").toLowerCase()
  if (flag === "false" || flag === "0" || flag === "off") {
    return new NoopNovaFeedbackRecorder()
  }
  return new ActiveNovaFeedbackRecorder()
}

export type { NovaExchangeContext }
