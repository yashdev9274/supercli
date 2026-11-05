import type { NovaFeedbackEnvelope } from "@super/nova"

/**
 * In-process HTTP client the harness recorder uses to ship envelopes to
 * `/api/nova-feedback`. Always:
 *  - runs detached from any caller awaiting
 *  - retries with exponential backoff capped at six attempts
 *  - never throws, never logs more than a one-line console.warn
 */
export type NovaFeedbackClientOptions = {
  endpoint?: string
  fetchImpl?: typeof fetch
  /** Bearer token for server-to-server (desktop / CLI) callers. */
  token?: string | null
  /** Max retry attempts; default 6. */
  maxAttempts?: number
}

export type NovaFeedbackClientResult = {
  ok: boolean
  status: number
  feedbackId?: string
  error?: string
}

const DEFAULT_ENDPOINT = "/api/nova-feedback"
const DEFAULT_MAX_ATTEMPTS = 6
const BASE_BACKOFF_MS = 250

export class NovaFeedbackClient {
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch
  private readonly token: string | null
  private readonly maxAttempts: number

  constructor(options: NovaFeedbackClientOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT
    this.fetchImpl = options.fetchImpl ?? fetch
    this.token = options.token ?? process.env.NOVA_FEEDBACK_TOKEN ?? null
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  }

  async send(envelope: NovaFeedbackEnvelope, signal?: AbortSignal): Promise<NovaFeedbackClientResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    let attempt = 0
    let lastError: string | undefined
    let lastStatus = 0
    while (attempt < this.maxAttempts) {
      attempt++
      try {
        const response = await this.fetchImpl(this.endpoint, {
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
        // 5xx and other transient statuses fall through to backoff retry.
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
