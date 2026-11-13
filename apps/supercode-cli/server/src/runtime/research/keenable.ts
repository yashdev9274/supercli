import { loadEnvOnce } from "../config/load-env"
import { proxyToolCall } from "../stream/proxy-tools"

const KEENABLE_PUBLIC_URL = "https://api.keenable.ai/v1/search/public"
const KEENABLE_KEYED_URL = "https://api.keenable.ai/v1/search"

export interface KeenableOptions {
  query: string
  maxResults?: number
  timeout?: number
}

export interface KeenableResult {
  ok: boolean
  data?: { query?: string; results?: Array<{ title?: string; url?: string; snippet?: string }> }
  error?: string
  hint?: string
  status?: number
}

export function isKeenableEnabled(): boolean {
  const flag = (process.env.KEENABLE_SEARCH || "").trim()
  const key = (process.env.KEENABLE_API_KEY || "").trim()
  return /^(1|true|yes|on)$/i.test(flag) || Boolean(key)
}

function statusHint(status: number): string | undefined {
  if (status === 429) return "Rate limited. Try again later."
  if (status === 401 || status === 403) return "Invalid KEENABLE_API_KEY. Check your API key."
  return undefined
}

async function callKeenableDirect(timeout: number, query: string, maxResults: number): Promise<KeenableResult> {
  const apiKey = (process.env.KEENABLE_API_KEY || "").trim()
  const url = apiKey ? KEENABLE_KEYED_URL : KEENABLE_PUBLIC_URL
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Keenable-Title": "SuperCLI",
  }
  if (apiKey) headers["X-API-Key"] = apiKey

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, max_results: maxResults }),
      signal: AbortSignal.timeout(timeout),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error: `Keenable returned HTTP ${res.status}`,
        hint: statusHint(res.status),
        status: res.status,
      }
    }
    if (!data || typeof data !== "object" || !Array.isArray((data as KeenableResult["data"])?.results)) {
      return { ok: false, error: "Keenable returned a malformed response" }
    }
    return { ok: true, data: data as KeenableResult["data"] }
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError"
    return {
      ok: false,
      error: isTimeout ? "Request timed out" : (err.message || String(err)),
      hint: isTimeout ? "Keenable API may be slow or unreachable." : undefined,
    }
  }
}

export async function keenableFetch({
  query,
  maxResults = 5,
  timeout = 30000,
}: KeenableOptions): Promise<KeenableResult> {
  loadEnvOnce()
  if (!isKeenableEnabled()) {
    return {
      ok: false,
      error: "Keenable is not enabled",
      hint: "Set KEENABLE_SEARCH=true for the keyless endpoint, or set KEENABLE_API_KEY.",
    }
  }

  const direct = await callKeenableDirect(timeout, query, maxResults)
  if (direct.ok) return direct
  if (direct.status && direct.status !== 401 && direct.status !== 403) return direct

  const proxy = await proxyToolCall("/api/tools/keenable-search", { query, maxResults })
  if (proxy.ok) return { ok: true, data: proxy.data }

  return direct.ok === false && direct.error
    ? { ...direct, error: `${direct.error}. Proxy: ${proxy.error}` }
    : { ok: false, error: `Keenable proxy failed: ${proxy.error}` }
}
