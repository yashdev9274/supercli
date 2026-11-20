import { BrowserCreationRejectedError, BrowserError, LIVE_VIEW_TTL_SECONDS, type BrowserProvider } from "./contracts"
import { browserLiveViewUrl } from "@/modules/nova-web/browser-view"

export function browserConfigured(): boolean {
  return Boolean(process.env.BROWSERBASE_API_KEY?.trim() && process.env.BROWSERBASE_PROJECT_ID?.trim())
}

export function validateProviderUrl(value: unknown, kind: "live" | "cdp"): string {
  try {
    if (typeof value !== "string" || value.length > 4096) throw new Error()
    const url = new URL(value)
    const host = url.hostname
    const allowed = kind === "live"
      ? host === "www.browserbase.com" || host === "browserbase.com"
      : host === "connect.browserbase.com" || /^connect\.(us-west-2|us-east-1|eu-central-1|ap-southeast-1)\.browserbase\.com$/.test(host)
    if (!allowed || url.protocol !== (kind === "live" ? "https:" : "wss:") || url.username || url.password || url.port || (kind === "live" && !browserLiveViewUrl(value))) throw new Error()
    return url.toString()
  } catch {
    throw new BrowserError("Browser provider returned an invalid URL", 502)
  }
}

export function createBrowserbaseProvider(
  config: { apiKey: string; projectId: string },
  fetcher: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = fetch,
): BrowserProvider {
  async function request(path: string, body?: object): Promise<Record<string, unknown>> {
    try {
      const response = await fetcher(`https://api.browserbase.com/v1/sessions${path}`, {
        method: body ? "POST" : "GET",
        headers: { "X-BB-API-Key": config.apiKey.trim(), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(body && path === "" ? 30_000 : 8_000),
      })
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).toLowerCase()
        let message = "Browserbase request failed; retry later"
        let status = 502
        if (response.status === 401) {
          message = "Browserbase rejected the API key; check the deployed BROWSERBASE_API_KEY"
          status = 503
        } else if ((response.status === 400 || response.status === 403 || response.status === 402) && /keep.?alive/.test(detail)) {
          message = "Browserbase requires a paid plan with keep-alive support for Nova's shared browser"
          status = 503
        } else if (response.status === 402) {
          message = "Browserbase billing or credits are required; check the Browserbase project's plan and balance"
          status = 503
        } else if (response.status === 403 || response.status === 404) {
          message = "Browserbase denied access; verify the API key has access to the configured project and session"
          status = 503
        } else if (response.status === 429) {
          message = "Browserbase concurrency or usage limit reached; stop unused sessions or check the Browserbase plan"
          status = 429
        } else if (response.status === 400 || response.status === 422) {
          message = "Browserbase rejected the session settings; verify the project ID and plan support for a 15-minute keep-alive session"
          status = 503
        }
        console.error("[nova/browser] Browserbase request failed", { operation: body && path === "" ? "create" : body ? "release" : "read", status: response.status })
        const ErrorType = body && path === "" && [400, 401, 402, 403, 404, 422, 429].includes(response.status)
          ? BrowserCreationRejectedError : BrowserError
        throw new ErrorType(message, status)
      }
      const data: unknown = await response.json()
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error()
      return data as Record<string, unknown>
    } catch (error) {
      if (error instanceof BrowserError) throw error
      // Never propagate response bodies, fetch errors, CDP endpoints or keys.
      throw new BrowserError("Browserbase connection failed or timed out; session creation may still have succeeded. Check status or stop the session before retrying", 502)
    }
  }
  function sessionPath(id: string): string {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(id)) throw new BrowserError("Invalid browser provider session", 502)
    return `/${id}`
  }
  return {
    async create(claimId) {
      const data = await request("", {
        projectId: config.projectId.trim(),
        timeout: 900,
        keepAlive: true,
        browserSettings: { recordSession: false, logSession: false, solveCaptchas: false, viewport: { width: 1280, height: 800 } },
        userMetadata: { novaBrowserClaim: claimId },
        // No persistent context is supplied: the session owns its ephemeral context.
      })
      if (typeof data.id !== "string") throw new BrowserError("Browser creation could not be confirmed; wait for expiry", 502)
      sessionPath(data.id)
      return { id: data.id }
    },
    async release(id) {
      const data = await request(sessionPath(id), { status: "REQUEST_RELEASE", projectId: config.projectId.trim() })
      return ["COMPLETED", "ERROR", "TIMED_OUT"].includes(String(data.status))
    },
    async liveView(id) {
      const data = await request(`${sessionPath(id)}/debug?expiresIn=${LIVE_VIEW_TTL_SECONDS}`)
      // Use the browser chrome, not the viewport-only fullscreen surface:
      // Browserbase supplies the address bar, history, tabs and reload controls.
      return validateProviderUrl(data.debuggerUrl, "live")
    },
    async connection(id) {
      const data = await request(sessionPath(id))
      if (data.status !== "RUNNING") throw new BrowserError("Browser is not running", 409)
      return validateProviderUrl(data.connectUrl, "cdp")
    },
  }
}
