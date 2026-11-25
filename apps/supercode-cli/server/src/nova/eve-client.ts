export type EveEvent = { type: string; content?: string; message?: string; [key: string]: unknown }
export type EveAdmission = { runtime: "eve"; runId: string; userMessage: unknown; latestSequence: number; eventsPath: string }

type Options = {
  origin: string
  token: string
  fetch?: typeof fetch
  delay?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  now?: () => number
}

export function eveOrigin(value: string): string {
  const url = new URL(value)
  if (/[\s?#]/.test(value) || url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || (url.protocol === "http:" && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/.test(value))
    || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Nova origin must be an HTTPS origin or an exact loopback HTTP origin")
  }
  return url.origin
}

function identifier(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("Invalid Nova session or run ID")
  return value
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function cursor(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(value)
}

async function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason) }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve() }, milliseconds)
    signal?.addEventListener("abort", abort, { once: true })
  })
}

export function createEveClient(options: Options) {
  const origin = eveOrigin(options.origin)
  if (!options.token || /\s/.test(options.token)) throw new Error("Sign in with supercode login first")
  const fetcher = options.fetch ?? fetch
  const delay = options.delay ?? pause
  const now = options.now ?? Date.now
  const sessionPath = (sessionId: string) => `/api/desktop/nova/sessions/${identifier(sessionId)}/eve`
  const runPath = (sessionId: string, runId: string) => `${sessionPath(sessionId)}/${identifier(runId)}`

  async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    const response = await fetcher(`${origin}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${options.token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      redirect: "error",
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)]),
    }).catch(() => {
      signal?.throwIfAborted()
      throw new TypeError("Nova network request failed")
    })
    const expected = init.method === "POST" ? 202 : init.method === "DELETE" ? [200, 202, 204] : 200
    if (Array.isArray(expected) ? !expected.includes(response.status) : response.status !== expected) {
      if (response.status === 401) throw new Error("Nova authentication failed; run supercode login again")
      if (response.status === 403) throw new Error("Nova Eve canary access denied")
      throw new Error(`Nova Eve request failed (HTTP ${response.status})`)
    }
    if (init.method === "DELETE") return undefined
    try { return await response.json() } catch { throw new Error("Invalid Nova Eve response") }
  }

  return {
    async admit(sessionId: string, input: { content: string; clientMessageId: string; provider: string; model: string; effort?: string }, signal?: AbortSignal): Promise<EveAdmission> {
      if (!input.content.trim() || input.content.length > 20_000
        || !/^[A-Za-z0-9_-]{1,128}$/.test(input.clientMessageId)
        || !input.provider.trim() || input.provider.length > 64 || !input.model.trim() || input.model.length > 128
        || (input.effort !== undefined && !["none", "minimal", "low", "medium", "high", "xhigh"].includes(input.effort))) throw new Error("Invalid Eve message or model selection")
      const result = await request(sessionPath(sessionId), { method: "POST", body: JSON.stringify({ ...input, mode: "chat" }) }, signal)
      if (!record(result) || result.runtime !== "eve" || typeof result.runId !== "string"
        || !Number.isSafeInteger(result.latestSequence) || (result.latestSequence as number) < 0 || typeof result.eventsPath !== "string") throw new Error("Invalid Nova Eve admission")
      const expected = `${runPath(sessionId, result.runId)}/events`
      let target: URL
      try { target = new URL(result.eventsPath, origin) } catch { throw new Error("Invalid Nova Eve event path") }
      if (target.origin !== origin || target.username || target.password || target.hash || target.pathname !== expected
        || [...target.searchParams.keys()].some(key => key !== "after") || target.searchParams.getAll("after").length > 1
        || (target.searchParams.has("after") && !cursor(target.searchParams.get("after")))) throw new Error("Invalid Nova Eve event path")
      return { ...result, eventsPath: expected } as EveAdmission
    },
    async *follow(sessionId: string, runId: string, signal?: AbortSignal): AsyncGenerator<{ cursor: string; event: EveEvent }> {
      const path = `${runPath(sessionId, runId)}/events`
      const deadline = now() + 15 * 60_000
      let after = ""
      let retries = 0
      while (now() < deadline) {
        signal?.throwIfAborted()
        let result: unknown
        try {
          result = await request(`${path}${after ? `?after=${encodeURIComponent(after)}` : ""}`, { method: "GET" }, signal)
          retries = 0
        } catch (error) {
          signal?.throwIfAborted()
          if (!(error instanceof TypeError || error instanceof DOMException && error.name === "TimeoutError")) throw error
          if (++retries > 5) throw new Error("Nova observation interrupted; the run may still be running")
          await delay(Math.min(1000 * 2 ** (retries - 1), 10_000), signal)
          continue
        }
        if (!record(result) || !Array.isArray(result.events) || typeof result.terminal !== "boolean") throw new Error("Invalid Nova Eve events")
        for (const item of result.events) {
          if (!record(item) || !cursor(item.cursor) || !record(item.event) || typeof item.event.type !== "string") throw new Error("Invalid Nova Eve event")
          if (item.cursor <= after) continue
          after = item.cursor
          yield { cursor: after, event: item.event as EveEvent }
        }
        if (result.terminal) return
        await delay(1000, signal)
      }
      throw new Error("Nova observation timed out; the run may still be running")
    },
    async cancel(sessionId: string, runId: string, signal?: AbortSignal): Promise<void> {
      await request(runPath(sessionId, runId), { method: "DELETE" }, signal)
    },
  }
}
