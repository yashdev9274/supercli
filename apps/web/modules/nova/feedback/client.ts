import type { NovaFeedbackEnvelope } from "@super/nova"

import {
  attachNovaFeedbackUserFeedback,
  closeoutNovaFeedback,
  ingestNovaFeedbackBatch,
  openNovaFeedback,
} from "./service"

/**
 * In-process client the harness recorder uses to ship envelopes to
 * `/api/nova/feedback` (HTTP) or the feedback service (direct, server default).
 * Always:
 *  - runs detached from any caller awaiting
 *  - retries with exponential backoff capped at six attempts (HTTP only)
 *  - never throws
 */
export type NovaFeedbackClientOptions = {
  endpoint?: string
  fetchImpl?: typeof fetch
  /** Bearer token for server-to-server (desktop / CLI) callers. */
  token?: string | null
  /** Max retry attempts; default 6. */
  maxAttempts?: number
  /**
   * `direct` calls the feedback service in-process (no HTTP/auth).
   * Default on the server when no custom fetchImpl is provided.
   * `http` always POSTs (tests + external callers).
   */
  transport?: "http" | "direct"
}

export type NovaFeedbackClientResult = {
  ok: boolean
  status: number
  feedbackId?: string
  error?: string
}

const DEFAULT_ENDPOINT = "/api/nova/feedback"
const DEFAULT_MAX_ATTEMPTS = 6
const BASE_BACKOFF_MS = 250

export class NovaFeedbackClient {
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch
  private readonly token: string | null
  private readonly maxAttempts: number
  private readonly transport: "http" | "direct"

  constructor(options: NovaFeedbackClientOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT
    this.fetchImpl = options.fetchImpl ?? fetch
    this.token = options.token ?? process.env.NOVA_FEEDBACK_TOKEN ?? null
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    if (options.transport) {
      this.transport = options.transport
    } else if (options.fetchImpl) {
      this.transport = "http"
    } else if (typeof window === "undefined") {
      this.transport = "direct"
    } else {
      this.transport = "http"
    }
  }

  async send(envelope: NovaFeedbackEnvelope, signal?: AbortSignal): Promise<NovaFeedbackClientResult> {
    if (this.transport === "direct") {
      return this.sendDirect(envelope)
    }
    return this.sendHttp(envelope, signal)
  }

  private async sendDirect(envelope: NovaFeedbackEnvelope): Promise<NovaFeedbackClientResult> {
    try {
      switch (envelope.kind) {
        case "open": {
          if (!envelope.organizationId || envelope.organizationId === "unscoped") {
            return { ok: false, status: 400, error: "missing_organization_id" }
          }
          const result = await openNovaFeedback(envelope)
          return result.ok
            ? { ok: true, status: 201, feedbackId: result.feedbackId }
            : { ok: false, status: 502, error: result.error }
        }
        case "batch": {
          const result = await ingestNovaFeedbackBatch(envelope)
          return result.ok
            ? { ok: true, status: 202, feedbackId: result.feedbackId }
            : { ok: false, status: 404, error: result.error }
        }
        case "closeout": {
          const result = await closeoutNovaFeedback(envelope)
          return result.ok
            ? { ok: true, status: 200, feedbackId: result.feedbackId }
            : { ok: false, status: 404, error: result.error }
        }
        case "user_feedback": {
          const result = await attachNovaFeedbackUserFeedback(envelope)
          return result.ok
            ? { ok: true, status: 200, feedbackId: result.feedbackId }
            : { ok: false, status: 404, error: result.error }
        }
        default: {
          const _exhaustive: never = envelope
          return { ok: false, status: 400, error: "unsupported_kind" }
        }
      }
    } catch (error) {
      return {
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message.slice(0, 200) : "direct_dispatch_failed",
      }
    }
  }

  private async sendHttp(
    envelope: NovaFeedbackEnvelope,
    signal?: AbortSignal,
  ): Promise<NovaFeedbackClientResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    const url = resolveEndpoint(this.endpoint)
    let attempt = 0
    let lastError: string | undefined
    let lastStatus = 0
    while (attempt < this.maxAttempts) {
      attempt++
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers,
          body: JSON.stringify(envelope),
          signal,
          cache: "no-store",
        })
        lastStatus = response.status
        if (response.status >= 200 && response.status < 300) {
          const json = await safeJson(response)
          return {
            ok: true,
            status: response.status,
            feedbackId: typeof json?.feedbackId === "string" ? json.feedbackId : undefined,
          }
        }
        if (response.status === 400 || response.status === 401 || response.status === 404) {
          const json = await safeJson(response)
          const jsonError = typeof json?.error === "string" ? json.error : `http ${response.status}`
          return {
            ok: false,
            status: response.status,
            error: jsonError,
          }
        }
        await response.body?.cancel().catch(() => {})
        lastError = `http ${response.status}`
      } catch (error) {
        lastError = error instanceof Error ? error.message.slice(0, 200) : "feedback_post_failed"
      }
      if (attempt < this.maxAttempts) {
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
        await sleep(delay).catch(() => {})
        if (signal?.aborted) {
          return { ok: false, status: lastStatus, error: lastError ?? "aborted" }
        }
      }
    }
    return { ok: false, status: lastStatus, error: lastError ?? "feedback_post_exhausted" }
  }
}

function resolveEndpoint(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint
  const base =
    process.env.NOVA_FEEDBACK_BASE_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://127.0.0.1:3003"
  const normalized = base.replace(/\/$/, "")
  return `${normalized}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
