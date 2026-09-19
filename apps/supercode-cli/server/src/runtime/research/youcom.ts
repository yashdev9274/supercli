import { loadEnvOnce } from "../config/load-env"

const YOUCOM_BASE = "https://api.ydc-index.io"

export interface YoucomOptions {
  apiPath: string
  body: Record<string, unknown>
  timeout?: number
  /** Optional caller-provided abort signal (e.g. the tool execution signal); combined with the timeout. */
  signal?: AbortSignal
}

export interface YoucomResult {
  ok: boolean
  data?: any
  error?: string
  hint?: string
  status?: number
}

function statusHint(status: number): string | undefined {
  if (status === 429) return "Rate limited. Try again later."
  if (status === 401 || status === 403) return "Invalid YDC_API_KEY. Check your You.com API key."
  return undefined
}

/** Combine an optional external signal with a timeout, following the AbortController pattern used across the repo. */
function withTimeoutSignal(timeout: number, signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener("abort", onAbort)
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener("abort", onAbort)
    },
  }
}

export function youcomFetch({
  apiPath,
  body,
  timeout = 30000,
  signal,
}: YoucomOptions): Promise<YoucomResult> {
  loadEnvOnce()
  const apiKey = process.env.YDC_API_KEY

  if (!apiKey) {
    return Promise.resolve({
      ok: false,
      error: "YDC_API_KEY is not set",
      hint: "Set YDC_API_KEY to use youcom_search, or use exa_search / firecrawl_search instead.",
    })
  }

  return callYoucomDirect(apiKey, apiPath, body, timeout, signal)
}

async function callYoucomDirect(
  apiKey: string,
  apiPath: string,
  body: Record<string, unknown>,
  timeout: number,
  signal?: AbortSignal,
): Promise<YoucomResult> {
  const timeoutSignal = withTimeoutSignal(timeout, signal)
  try {
    const res = await fetch(`${YOUCOM_BASE}${apiPath}`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: timeoutSignal.signal,
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return {
        ok: false,
        error: `You.com returned HTTP ${res.status}`,
        hint: statusHint(res.status),
        status: res.status,
      }
    }

    const results = data?.results
    const hasWebOrNews = Array.isArray(results?.web) || Array.isArray(results?.news)
    if (!data || typeof data !== "object" || (apiPath === "/v1/search" && !hasWebOrNews)) {
      return { ok: false, error: "You.com returned a malformed response" }
    }
    return { ok: true, data }
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError"
    return {
      ok: false,
      error: isTimeout ? "Request timed out" : (err.message || String(err)),
      hint: isTimeout ? "You.com API may be slow or unreachable. Try exa_search, firecrawl_search, or url_fetch instead." : undefined,
    }
  } finally {
    timeoutSignal.cleanup()
  }
}
