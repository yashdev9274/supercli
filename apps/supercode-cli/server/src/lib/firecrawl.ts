import { loadEnvOnce } from "./load-env"
import { proxyToolCall } from "./proxy-tools"

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2"

export interface FirecrawlOptions {
  /** Firecrawl API endpoint path (e.g. "/search", "/scrape", "/map") */
  apiPath: string
  /** Proxy endpoint path prefix (e.g. "firecrawl-search" — constructs /api/tools/firecrawl-search) */
  proxyAction: string
  body: Record<string, unknown>
  timeout?: number
}

export interface FirecrawlResult {
  ok: boolean
  data?: any
  error?: string
  hint?: string
  status?: number
}

function statusHint(status: number): string | undefined {
  if (status === 429) return "Rate limited. Try again later."
  if (status === 402) return "Firecrawl account requires payment. Check your credit balance."
  if (status === 401 || status === 403) return "Invalid FIRECRAWL_API_KEY. Check your API key."
  return undefined
}

export async function firecrawlFetch({
  apiPath,
  proxyAction,
  body,
  timeout = 30000,
}: FirecrawlOptions): Promise<FirecrawlResult> {
  loadEnvOnce()
  const apiKey = process.env.FIRECRAWL_API_KEY

    if (!apiKey) {
    const proxy = await proxyToolCall(`/api/tools/${proxyAction}`, body)
    if (proxy.ok) return { ok: true, data: proxy.data }
    return {
      ok: false,
      error: `Firecrawl proxy failed: ${proxy.error}. Set FIRECRAWL_API_KEY environment variable locally, or fix the proxy issue above.`,
      hint: `Proxy error: ${proxy.error}. Try web_search or url_fetch as a fallback.`,
    }
  }

  try {
    const res = await fetch(`${FIRECRAWL_BASE}${apiPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })

    const data = await res.json()

    if (!res.ok) {
      return {
        ok: false,
        error: `Firecrawl returned HTTP ${res.status}`,
        hint: statusHint(res.status),
        status: res.status,
      }
    }

    return { ok: true, data }
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError"
    return {
      ok: false,
      error: isTimeout ? "Request timed out" : (err.message || String(err)),
      hint: isTimeout ? "Site may be slow or unreachable. Try url_fetch instead." : undefined,
    }
  }
}
