import type { TurnEvent } from "./api"

export function eveCommand(content: string): { content: string; runId?: string; resume?: boolean; defaultEffort: boolean } | null {
  const resume = /^\/eve-resume(?:\s+([A-Za-z0-9_-]{1,128}))?\s*$/.exec(content.trim())
  if (resume) return { content: "", runId: resume[1], resume: true, defaultEffort: false }
  if (/^\/eve-resume(?:\s|$)/.test(content.trim())) throw new Error("Use /eve-resume with an optional valid run ID")
  if (!/^\/eve(?:\s|$)/.test(content.trim())) return null
  let text = content.trim().slice(4).trim()
  const defaultEffort = /^--default-effort(?:\s|$)/.test(text)
  if (defaultEffort) text = text.slice("--default-effort".length).trim()
  if (!text) throw new Error("Use /eve <read-only question>, or /eve --default-effort <question>")
  return { content: text, defaultEffort }
}

function path(sessionId: string, runId?: string) {
  for (const id of [sessionId, ...(runId ? [runId] : [])]) if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid Nova session or run")
  return `/api/nova/sessions/${sessionId}/eve${runId ? `/${runId}` : ""}`
}

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal?.throwIfAborted()
  const abort = () => { clearTimeout(timer); reject(signal?.reason) }
  const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve() }, ms)
  signal?.addEventListener("abort", abort, { once: true })
})

export async function* followEveEvents(sessionId: string, runId: string, options: { fetch?: typeof fetch; delay?: (ms: number, signal?: AbortSignal) => Promise<void>; now?: () => number; signal?: AbortSignal } = {}): AsyncGenerator<TurnEvent> {
  const fetcher = options.fetch ?? fetch
  const delay = options.delay ?? pause
  const now = options.now ?? Date.now
  const deadline = now() + 15 * 60_000
  let after = ""
  let failures = 0
  yield { type: "status", runId, phase: "eve", message: "Eve · read-only background execution" }
  while (now() < deadline) {
    options.signal?.throwIfAborted()
    let value: { events: Array<{ cursor: string; event: Record<string, unknown> }>; terminal: boolean }
    try {
      const response = await fetcher(`${path(sessionId, runId)}/events${after ? `?after=${encodeURIComponent(after)}` : ""}`, { cache: "no-store", signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(options.signal ? [options.signal] : [])]) })
      if (response.status >= 500) throw new TypeError("Nova event service unavailable")
      if (!response.ok) throw new Error(`Nova Eve event access failed (HTTP ${response.status})`)
      value = await response.json()
      if (!Array.isArray(value.events) || typeof value.terminal !== "boolean") throw new Error("Invalid Eve event response")
      failures = 0
    } catch (error) {
      options.signal?.throwIfAborted()
      if (!(error instanceof TypeError || error instanceof DOMException && error.name === "TimeoutError") || ++failures > 5) throw error
      await delay(Math.min(1000 * 2 ** (failures - 1), 10_000), options.signal)
      continue
    }
    for (const item of value.events) {
      const prefix = `nova-eve:${runId}:event:`
      if (typeof item.cursor !== "string" || !item.cursor.startsWith(prefix) || !/^\d{12}:\d{6}$/.test(item.cursor.slice(prefix.length)) || !item.event || typeof item.event.type !== "string") throw new Error("Invalid Eve event identity")
      if (item.cursor <= after) continue
      after = item.cursor
      if (item.event.type === "heartbeat") continue
      if ((item.event.type === "text" || item.event.type === "reasoning") && typeof item.event.content === "string"
        || (item.event.type === "status" || item.event.type === "error") && typeof item.event.message === "string"
        || item.event.type === "finish" && typeof item.event.reason === "string") yield item.event as TurnEvent
      else throw new Error("Invalid Eve event payload")
    }
    if (value.terminal) return
    await delay(1000, options.signal)
  }
  throw new Error("Observation timed out; Eve may still be running. Resume observation or cancel explicitly.")
}

export async function* submitEveTurn(sessionId: string, input: { content: string; clientMessageId?: string; provider?: string; model?: string; effort?: string; mode?: string; references?: unknown[]; localAttachments?: unknown[]; observationSignal?: AbortSignal }, fetcher: typeof fetch = fetch): AsyncGenerator<TurnEvent> {
  if (!input.provider || !input.model || (input.mode !== "chat" && input.mode !== "plan") || input.references?.length || input.localAttachments?.length) throw new Error("Eve canary requires explicit model/provider and text-only chat/plan mode; no attachments or mutations")
  const response = await fetcher(path(sessionId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: input.content, clientMessageId: input.clientMessageId ?? crypto.randomUUID(), provider: input.provider, model: input.model, effort: input.effort, mode: input.mode }), signal: input.observationSignal })
  const admitted = await response.json()
  if (response.status !== 202) throw new Error(typeof admitted.error === "string" ? admitted.error : "Eve admission failed")
  if (admitted.runtime !== "eve" || typeof admitted.runId !== "string" || !admitted.userMessage || !Number.isSafeInteger(admitted.latestSequence)) throw new Error("Invalid Eve admission response")
  path(sessionId, admitted.runId)
  yield { type: "user_message", message: admitted.userMessage, runId: admitted.runId, latestSequence: admitted.latestSequence }
  yield* followEveEvents(sessionId, admitted.runId, { fetch: fetcher, signal: input.observationSignal })
}

export async function cancelEveTurn(sessionId: string, runId: string): Promise<void> {
  const response = await fetch(path(sessionId, runId), { method: "DELETE", headers: { "Content-Type": "application/json" } })
  if (!response.ok) throw new Error("Eve cancellation could not be requested; the run may still be active")
}

export async function* resumeEveEvents(sessionId: string, runId?: string, signal?: AbortSignal): AsyncGenerator<TurnEvent> {
  if (!runId) {
    const response = await fetch(path(sessionId), { cache: "no-store", signal })
    if (!response.ok) throw new Error("No accessible active Eve run to resume")
    const current = await response.json()
    if (current.runtime !== "eve" || typeof current.runId !== "string") throw new Error("Invalid active Eve run")
    yield* followEveEvents(sessionId, current.runId, { signal })
    return
  }
  yield* followEveEvents(sessionId, runId, { signal })
}
