import { loadEnvOnce } from "../config/load-env"

const SPECSTREAM_SEARCH_URL = "https://api.specstream.ai/v1/web-search"

export interface SpecStreamOptions {
  query: string
  maxResults?: number
  timeout?: number
}

export interface SpecStreamSource {
  title?: string
  url?: string
  snippet?: string
  published?: string
}

export interface SpecStreamResult {
  ok: boolean
  data?: { query?: string; results: SpecStreamSource[] }
  error?: string
  hint?: string
  status?: number
}

function apiKey(): string {
  return (process.env.SPECSTREAM_API_KEY || "").trim()
}

export function isSpecStreamEnabled(): boolean {
  return Boolean(apiKey())
}

function statusHint(status: number): string | undefined {
  if (status === 429) return "Rate limited. Try again later."
  if (status === 401 || status === 403) return "Invalid SPECSTREAM_API_KEY. Check your API key."
  if (status === 402) return "The SpecStream account has no credit left."
  return undefined
}

/**
 * GET the SpecStream Search API with the key as a Bearer token. Redirects are
 * not followed, so the Authorization header never leaves the API host.
 */
export async function specstreamFetch({
  query,
  maxResults = 5,
  timeout = 30000,
}: SpecStreamOptions): Promise<SpecStreamResult> {
  loadEnvOnce()
  const key = apiKey()
  if (!key) {
    return { ok: false, error: "SpecStream is not enabled", hint: "Set SPECSTREAM_API_KEY." }
  }
  const num = Math.min(Math.max(Math.trunc(maxResults) || 5, 1), 10)
  const url = `${SPECSTREAM_SEARCH_URL}?${new URLSearchParams({ q: query, num: String(num) })}`

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) {
      return {
        ok: false,
        error: `SpecStream returned HTTP ${res.status}`,
        hint: statusHint(res.status),
        status: res.status,
      }
    }
    const body = (await res.json().catch(() => null)) as { data?: { query?: string; sources?: unknown } } | null
    const sources = body?.data?.sources
    if (!Array.isArray(sources)) {
      return { ok: false, error: "SpecStream returned a malformed response" }
    }
    const results = (sources as SpecStreamSource[]).filter((s) => typeof s?.url === "string" && s.url !== "")
    return { ok: true, data: { query: body?.data?.query ?? query, results } }
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError"
    return {
      ok: false,
      error: isTimeout ? "Request timed out" : (err?.message || String(err)),
      hint: isTimeout ? "SpecStream API may be slow or unreachable." : undefined,
    }
  }
}
