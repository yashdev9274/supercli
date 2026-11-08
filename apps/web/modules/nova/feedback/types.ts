import type {
  NovaFeedbackEnvelope,
  NovaFeedbackEvent,
  NovaFeedbackEventType,
  NovaFeedbackSeverity,
} from "@super/nova"

/** Information about the current message exchange that the harness owns
 * and the recorder attaches to every event. */
export type NovaExchangeContext = {
  organizationId: string
  agentSessionId: string | null
  runId: string | null
  userMessageId?: string | null
  userId?: string | null
  title: string
  /** Optional harness metadata (provider, model, mode) carried into events. */
  metadata?: Record<string, unknown>
}

export type NovaRecorderStats = {
  queueSize: number
  flushes: number
  drops: number
  successes: number
  failures: number
  openPosts: number
  closeoutPosts: number
  feedbackId: string | null
}

/** Minimal interface every recorder must implement so the harness can
 * swap the active recorder for a no-op in tests and during incidents. */
export type NovaFeedbackRecorder = {
  open(context: NovaExchangeContext): Promise<void>
  record(event: NovaFeedbackEventInput): void
  recordEvent(type: string, payload: Record<string, unknown>, ts?: number): void
  /** Snapshot of recorded events for markdown closeout. */
  events(): NovaFeedbackEventInput[]
  closeout(payload: NovaRecorderCloseout): Promise<void>
  attachUserFeedback(payload: NovaRecorderUserFeedback): Promise<void>
  stats(): NovaRecorderStats
  /** Detaches the recorder, draining any pending work. Call after closeout. */
  dispose(): Promise<void>
}

export type NovaFeedbackEventInput = {
  type: NovaFeedbackEventType
  ts: number
  sequence: number
  payload: Record<string, unknown>
}

export type NovaRecorderCloseout = {
  summary: string
  body: string
  severity: NovaFeedbackSeverity
  improvements: { title: string; detail: string }[]
  perceivedIssues: { kind: string; detail: string; atSequence?: number }[]
  timeTakenMs?: number
  metadata?: Record<string, unknown>
}

export type NovaRecorderUserFeedback = {
  rating?: -1 | 0 | 1
  comment?: string
}

export type NovaFeedbackRecord = {
  id: string
  organizationId: string
  agentSessionId: string | null
  runId: string | null
  filePath: string
  status: string
  issueUrl: string | null
}

export type NovaFeedbackDispatchResult =
  | { ok: true; kind: "open" | "batch" | "closeout" | "user_feedback"; feedbackId: string }
  | { ok: false; error: string }

export type EnvelopeQueued = NovaFeedbackEnvelope & { feedbackId?: string }

export const FEEDBACK_RECORDER_BUFFER_LIMIT = 2000
export const FEEDBACK_RECORDER_FLUSH_EVENTS = 50
export const FEEDBACK_RECORDER_FLUSH_INTERVAL_MS = 1000
