import { BrowserError, LIVE_VIEW_TTL_SECONDS, type BrowserProvider } from "./contracts"
import { browserLiveViewUrl } from "@/modules/nova-web/browser-view"

export function browserConfigured(): boolean {
  return Boolean(process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID)
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
        headers: { "X-BB-API-Key": config.apiKey, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) throw new Error()
      const data: unknown = await response.json()
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error()
      return data as Record<string, unknown>
    } catch {
      // Never propagate response bodies, fetch errors, CDP endpoints or keys.
      throw new BrowserError("Browser provider unavailable; retry status or Stop", 502)
    }
  }
  function sessionPath(id: string): string {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(id)) throw new BrowserError("Invalid browser provider session", 502)
    return `/${id}`
  }
  return {
    async create(claimId) {
      const data = await request("", {
        projectId: config.projectId,
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
      const data = await request(sessionPath(id), { status: "REQUEST_RELEASE", projectId: config.projectId })
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
