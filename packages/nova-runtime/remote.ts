import { Client, type SessionStreamEvent } from "eve/client"
import { signNovaScope, type NovaScope } from "./scope"

export type EveRemoteConfig = { origin: string; secret: string }

export function remoteConfig(env: Record<string, string | undefined> = process.env): EveRemoteConfig {
  const url = new URL(env.NOVA_EVE_URL ?? "http://invalid")
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(local && url.protocol === "http:" && env.NODE_ENV !== "production"))) throw new Error("Configure a trusted Eve HTTPS origin (loopback HTTP is development-only)")
  if (!env.NOVA_EVE_SCOPE_SECRET || Buffer.byteLength(env.NOVA_EVE_SCOPE_SECRET) < 32) throw new Error("Eve scope signing is not configured")
  return { origin: url.origin, secret: env.NOVA_EVE_SCOPE_SECRET }
}

function client(config: EveRemoteConfig, scope: NovaScope) {
  return new Client({ baseUrl: config.origin, headers: { authorization: `Bearer ${signNovaScope(scope, { secret: config.secret })}` }, redirect: "error" })
}

export async function submitRemoteTurn(config: EveRemoteConfig, scope: NovaScope, content: string, operationId: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!/^[A-Za-z0-9_:-]{1,256}$/.test(operationId)) throw new Error("Invalid Nova operation identity")
  const response = await fetcher(`${config.origin}/eve/v1/session`, {
    method: "POST", headers: { "Content-Type": "application/json", authorization: `Bearer ${signNovaScope(scope, { secret: config.secret })}` },
    body: JSON.stringify({ message: content, operationId }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
  })
  let body: unknown = null
  try { body = await response.json() } catch { await response.body?.cancel().catch(() => {}) }
  const id = response.headers.get("x-eve-session-id") ?? (body && typeof body === "object" && "sessionId" in body ? String(body.sessionId) : null)
  if (!response.ok || !id || !/^[A-Za-z0-9_-]{1,256}$/.test(id)) throw new Error(`Eve admission unavailable (HTTP ${response.status})`)
  return id
}

export async function readRemoteBatch(config: EveRemoteConfig, scope: NovaScope, sessionId: string, startIndex: number, afterIndex = -1): Promise<{ events: SessionStreamEvent[]; nextLine: number; nextIndex: number }> {
  const timeout = AbortSignal.timeout(35_000)
  const flush = new AbortController()
  const signal = AbortSignal.any([timeout, flush.signal])
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  const events: SessionStreamEvent[] = []
  let nextLine = startIndex
  let nextIndex = afterIndex
  try {
    const session = client(config, scope).sessions.attach(sessionId, { streamIndex: startIndex })
    for await (const event of session.stream({ signal, reconnect: false })) {
      if (event.meta.position.line === startIndex && event.meta.position.index <= afterIndex) continue
      events.push(event)
      flushTimer ??= setTimeout(() => flush.abort(), 1500)
      nextLine = event.meta.position.line
      nextIndex = event.meta.position.index
      if (event.meta.endOfLine) { nextLine = event.meta.next ?? event.meta.position.line + 1; nextIndex = -1 }
      if (event.type === "turn.settled" || event.type === "turn.paused" || event.type === "session.ended" || events.length >= 200) break
    }
  } catch (error) {
    if (!signal.aborted) throw error
  } finally { clearTimeout(flushTimer) }
  return { events, nextLine, nextIndex }
}

export async function controlRemoteTurn(config: EveRemoteConfig, scope: NovaScope, sessionId: string, action: "cancel" | "end", fetcher: typeof fetch = fetch): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(sessionId)) throw new Error("Invalid Eve session identity")
  const response = await fetcher(`${config.origin}/eve/v1/session/${sessionId}/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json", authorization: `Bearer ${signNovaScope(scope, { secret: config.secret })}` },
    body: "{}", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
  })
  await response.body?.cancel()
  if (!response.ok) throw new Error(`Eve ${action} unavailable (HTTP ${response.status})`)
}
