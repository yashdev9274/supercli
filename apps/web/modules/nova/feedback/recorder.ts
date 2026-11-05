import type {
  NovaFeedbackBatch,
  NovaFeedbackCloseout,
  NovaFeedbackEnvelope,
  NovaFeedbackEventType,
  NovaFeedbackOpen,
  NovaFeedbackUserFeedback,
} from "@super/nova"

import { NovaFeedbackClient } from "./client"
import type {
  NovaExchangeContext,
  NovaFeedbackEventInput,
  NovaFeedbackRecorder,
  NovaRecorderCloseout,
  NovaRecorderStats,
  NovaRecorderUserFeedback,
} from "./types"
import {
  FEEDBACK_RECORDER_BUFFER_LIMIT,
  FEEDBACK_RECORDER_FLUSH_EVENTS,
  FEEDBACK_RECORDER_FLUSH_INTERVAL_MS,
} from "./types"

/** Maximum buffered events we hold in-process across all recorders. */
const MAX_TOTAL_BUFFER = 50_000

/** Active recorder. Reads-only listener around `streamAgentTurn`:
 *  - synchronous `record` returns in microseconds; never awaits anything
 *  - batches and POSTs envelopes off the response path
 *  - swallows every thrown error; nothing escapes into the harness loop
 *
 * Set `NOVA_FEEDBACK_ENABLED=false` to swap for the no-op recorder.
 */
export class ActiveNovaFeedbackRecorder implements NovaFeedbackRecorder {
  private context: NovaExchangeContext | null = null
  private feedbackId: string | null = null
  private buffer: NovaFeedbackEventInput[] = []
  private sequenceCursor = 0
  private lastFlushAt = Date.now()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushing = false
  private disposed = false
  private readonly client: NovaFeedbackClient
  private readonly statsState: NovaRecorderStats = {
    queueSize: 0,
    flushes: 0,
    drops: 0,
    successes: 0,
    failures: 0,
    openPosts: 0,
    closeoutPosts: 0,
    feedbackId: null,
  }

  constructor(client: NovaFeedbackClient = new NovaFeedbackClient()) {
    this.client = client
  }

  async open(context: NovaExchangeContext): Promise<void> {
    if (this.disposed) return
    this.context = context
    const envelope: NovaFeedbackOpen = {
      contractVersion: "1",
      kind: "open",
      organizationId: context.organizationId,
      agentSessionId: context.agentSessionId,
      runId: context.runId,
      userMessageId: context.userMessageId ?? null,
      userId: context.userId ?? null,
      title: context.title,
      metadata: context.metadata,
    }
    const result = await this.dispatch(envelope)
    if (result.ok) {
      this.feedbackId = result.feedbackId ?? null
      this.statsState.openPosts += 1
      void this.flushNow().catch(() => undefined)
    }
  }

  record(eventInput: NovaFeedbackEventInput): void {
    if (this.disposed) return
    if (!this.context) return
    if (this.buffer.length >= MAX_TOTAL_BUFFER) {
      this.statsState.drops += 1
      return
    }
    const event: NovaFeedbackEventInput = {
      type: eventInput.type,
      ts: eventInput.ts || Date.now(),
      sequence: eventInput.sequence,
      payload: eventInput.payload,
    }
    this.buffer.push(event)
    this.statsState.queueSize = this.buffer.length
    this.scheduleFlush()
  }

  async closeout(payload: NovaRecorderCloseout): Promise<void> {
    if (this.disposed) return
    if (!this.feedbackId) {
      // No open was acknowledged yet; nothing to close against.
      return
    }
    await this.flushNow()
    const sequenceAtClose = this.sequenceCursor
    const envelope: NovaFeedbackCloseout = {
      contractVersion: "1",
      kind: "closeout",
      feedbackId: this.feedbackId,
      summary: payload.summary,
      body: payload.body,
      improvements: payload.improvements,
      perceivedIssues: payload.perceivedIssues,
      severity: payload.severity,
      metadata: payload.metadata,
      timeTakenMs: payload.timeTakenMs,
    }
    const result = await this.dispatch(envelope)
    if (result.ok) {
      this.statsState.closeoutPosts += 1
    }
    this.sequenceCursor = sequenceAtClose
  }

  async attachUserFeedback(payload: NovaRecorderUserFeedback): Promise<void> {
    if (this.disposed || !this.feedbackId) return
    const envelope: NovaFeedbackUserFeedback = {
      contractVersion: "1",
      kind: "user_feedback",
      feedbackId: this.feedbackId,
      rating: payload.rating,
      comment: payload.comment,
    }
    await this.dispatch(envelope)
  }

  stats(): NovaRecorderStats {
    return { ...this.statsState, queueSize: this.buffer.length, feedbackId: this.feedbackId }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    await this.flushNow().catch(() => undefined)
  }

  /** Public synchronous method harness calls for every event. */
  recordEvent(type: NovaFeedbackEventType, payload: Record<string, unknown>, ts = Date.now()): void {
    if (this.disposed) return
    if (!this.context) return
    this.sequenceCursor += 1
    this.record({
      type,
      ts,
      sequence: this.sequenceCursor,
      payload,
    })
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.disposed) return
    const elapsed = Date.now() - this.lastFlushAt
    const interval = elapsed >= FEEDBACK_RECORDER_FLUSH_INTERVAL_MS ? 0 : FEEDBACK_RECORDER_FLUSH_INTERVAL_MS - elapsed
    if (
      this.buffer.length >= FEEDBACK_RECORDER_FLUSH_EVENTS &&
      typeof setImmediate === "function"
    ) {
      setImmediate(() => {
        void this.flushNow().catch(() => undefined)
      })
      return
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flushNow().catch(() => undefined)
    }, interval)
  }

  async flushNow(): Promise<void> {
    if (this.flushing) return
    if (this.buffer.length === 0) return
    if (!this.feedbackId) {
      // Wait for the open acknowledgement before flushing events.
      return
    }
    this.flushing = true
    try {
      while (this.buffer.length > 0) {
        const drained = this.buffer.splice(0, FEEDBACK_RECORDER_FLUSH_EVENTS)
        if (drained.length === 0) break
        const envelope: NovaFeedbackBatch = {
          contractVersion: "1",
          kind: "batch",
          feedbackId: this.feedbackId,
          events: drained.map((event) => ({
            sequence: event.sequence,
            type: event.type,
            ts: event.ts,
            payload: event.payload,
          })),
        }
        const result = await this.dispatch(envelope)
        if (result.ok) {
          this.statsState.successes += 1
          this.statsState.flushes += 1
        } else {
          this.statsState.failures += 1
        }
        this.lastFlushAt = Date.now()
        if (!result.ok) {
          // Re-append the drained events at the front to retry on the next flush.
          this.buffer.unshift(...drained.slice(0, FEEDBACK_RECORDER_BUFFER_LIMIT))
          break
        }
      }
    } finally {
      this.flushing = false
      this.statsState.queueSize = this.buffer.length
    }
  }

  private async dispatch(envelope: NovaFeedbackEnvelope) {
    try {
      const result = await this.client.send(envelope)
      return result.ok
        ? { ok: true as const, kind: envelope.kind, feedbackId: result.feedbackId ?? "" }
        : { ok: false as const, error: result.error ?? "unknown" }
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message.slice(0, 200) : "dispatch_failed",
      }
    }
  }
}

/** Factory: returns the active recorder or a no-op based on env.
 *  - Explicit `NOVA_FEEDBACK_ENABLED=false` always disables.
 *  - In tests (`NODE_ENV === "test"`) we default to noop so unrelated tests
 *    don't make real HTTP calls to `/api/nova-feedback` or hang on retries. */
export function createNovaFeedbackRecorder(force: "active" | "noop" | null = null): NovaFeedbackRecorder {
  if (force === "noop") return new NoopNovaFeedbackRecorder()
  if (force === "active") return new ActiveNovaFeedbackRecorder()
  const envFlag = process.env.NOVA_FEEDBACK_ENABLED
  if (envFlag !== undefined) {
    const v = envFlag.toLowerCase()
    if (v === "false" || v === "0" || v === "off") return new NoopNovaFeedbackRecorder()
    if (v === "true" || v === "1" || v === "on") return new ActiveNovaFeedbackRecorder()
  }
  if (process.env.NODE_ENV === "test") return new NoopNovaFeedbackRecorder()
  return new ActiveNovaFeedbackRecorder()
}

/** No-op recorder used when feedback is disabled or in tests. */
export class NoopNovaFeedbackRecorder implements NovaFeedbackRecorder {
  readonly #stats: NovaRecorderStats = {
    queueSize: 0,
    flushes: 0,
    drops: 0,
    successes: 0,
    failures: 0,
    openPosts: 0,
    closeoutPosts: 0,
    feedbackId: null,
  }
  async open(_context: NovaExchangeContext): Promise<void> {}
  record(_event: NovaFeedbackEventInput): void {}
  recordEvent(_type: string, _payload: Record<string, unknown>, _ts?: number): void {}
  async closeout(_payload: NovaRecorderCloseout): Promise<void> {}
  async attachUserFeedback(_payload: NovaRecorderUserFeedback): Promise<void> {}
  stats(): NovaRecorderStats {
    return { ...this.#stats }
  }
  async dispose(): Promise<void> {}
}
