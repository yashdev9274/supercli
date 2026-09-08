import { loadEnvOnce } from "../config/load-env"
import { proxyToolCall } from "../stream/proxy-tools"

const EXA_BASE = "https://api.exa.ai"

export interface ExaOptions {
  apiPath: string
  proxyAction: string
  body: Record<string, unknown>
  timeout?: number
}

export interface ExaResult {
  ok: boolean
  data?: any
  error?: string
  hint?: string
  status?: number
}

function statusHint(status: number): string | undefined {
  if (status === 429) return "Rate limited. Try again later."
  if (status === 402) return "Exa account requires payment. Check your credit balance."
  if (status === 401 || status === 403) return "Invalid EXA_API_KEY. Check your API key."
  return undefined
}

function isAuthFailure(status?: number): boolean {
  return status === 401 || status === 403
}

async function callExaDirect(
  apiKey: string,
  apiPath: string,
  body: Record<string, unknown>,
  timeout: number,
): Promise<ExaResult> {
  try {
    const res = await fetch(`${EXA_BASE}${apiPath}`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return {
        ok: false,
        error: `Exa returned HTTP ${res.status}`,
        hint: statusHint(res.status),
        status: res.status,
      }
    }

    if (!data || typeof data !== "object" || (apiPath === "/search" && !Array.isArray(data.results))) {
      return { ok: false, error: "Exa returned a malformed response" }
    }
    return { ok: true, data }
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError"
    return {
      ok: false,
      error: isTimeout ? "Request timed out" : (err.message || String(err)),
      hint: isTimeout ? "Exa API may be slow or unreachable. Try url_fetch instead." : undefined,
    }
  }
}

export async function exaFetch({
  apiPath,
  proxyAction,
  body,
  timeout = 30000,
}: ExaOptions): Promise<ExaResult> {
  loadEnvOnce()
  const apiKey = process.env.EXA_API_KEY

  // Prefer local key; on missing/invalid key fall back to authenticated server proxy.
  if (apiKey) {
    const direct = await callExaDirect(apiKey, apiPath, body, timeout)
    if (direct.ok) return direct
    if (!isAuthFailure(direct.status)) return direct
  }

  const proxy = await proxyToolCall(`/api/tools/${proxyAction}`, body)
  if (proxy.ok) return { ok: true, data: proxy.data }

  if (apiKey) {
    return {
      ok: false,
      error: `Exa returned HTTP 401/403 and server proxy also failed: ${proxy.error}`,
      hint: "Local EXA_API_KEY is invalid. Fix EXA_API_KEY or ensure the server proxy has a valid key.",
      status: 401,
    }
  }

  return {
    ok: false,
    error: `Exa proxy failed: ${proxy.error}. Set EXA_API_KEY environment variable locally, or fix the proxy issue above.`,
    hint: `Proxy error: ${proxy.error}. Try firecrawl_search or url_fetch as a fallback.`,
  }
}
