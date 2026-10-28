import { z } from "zod"

export const localStatusSchema = z.object({
  account: z.object({ email: z.string().nullable(), planType: z.string() }).nullable(),
  login: z.enum(["idle", "pending", "succeeded", "failed"]), workspace: z.string(), readOnly: z.literal(true),
  profile: z.enum(["existing", "isolated"]),
}).strict()
export type LocalCodexStatus = z.infer<typeof localStatusSchema>
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), content: z.string().max(1_048_576) }).strict(),
  z.object({ type: z.literal("thread"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("finish"), reason: z.enum(["completed", "interrupted", "failed"]) }).strict(),
])
export function isLocalNova(origin: string): boolean {
  try {
    const url = new URL(origin)
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol) && url.origin === origin
  } catch { return false }
}
export function safeCodexLoginUrl(value: string): string {
  const url = new URL(value)
  if (!["https://auth.openai.com", "https://chatgpt.com"].includes(url.origin) || url.username || url.password || url.hash || url.searchParams.has("access_token") || url.searchParams.has("id_token")) throw new Error("Invalid Codex sign-in URL")
  return url.href
}

export async function* readLocalEvents(stream: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = stream.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let buffer = ""
  let bytes = 0
  const abort = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener("abort", abort, { once: true })
  try {
    signal.throwIfAborted()
    while (true) {
      const chunk = await reader.read()
      signal.throwIfAborted()
      bytes += chunk.value?.length ?? 0
      if (bytes > 4_194_304) throw new Error("Local stream exceeded limits")
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      let index: number
      while ((index = buffer.indexOf("\n")) >= 0) {
        if (index > 1_048_576) throw new Error("Local event exceeded limits")
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (!line.trim()) continue
        const event = eventSchema.parse(JSON.parse(line))
        yield event
        if (event.type === "finish") return
      }
      if (buffer.length > 1_048_576) throw new Error("Local event exceeded limits")
      if (chunk.done) throw new Error("Local Codex disconnected before completion")
    }
  } finally {
    signal.removeEventListener("abort", abort)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export class LocalCodexClient {
  private token: string | null = null
  private expires = 0
  private readonly endpoint: string
  constructor(port: number, origin: string, private readonly fetcher: typeof fetch = fetch) {
    if (!isLocalNova(origin) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Local Codex requires locally hosted Nova and a valid port")
    this.endpoint = `http://127.0.0.1:${port}`
  }
  private async request(path: string, value: unknown, signal?: AbortSignal): Promise<Response> {
    if (path !== "/pair" && (!this.token || this.expires <= Date.now())) throw new Error("Restart the companion and pair again")
    let response: Response
    try {
      response = await this.fetcher(`${this.endpoint}${path}`, {
        method: "POST", mode: "cors", credentials: "omit", cache: "no-store", redirect: "error",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: JSON.stringify(value), signal: signal ?? AbortSignal.timeout(35_000),
      })
    } catch {
      if (signal?.aborted) throw new DOMException("Local turn cancelled", "AbortError")
      throw new Error("Cannot reach local Codex. Start the companion and allow local-network access in your browser.")
    }
    if (!response.ok) {
      if (response.status === 401) this.forget()
      throw new Error("Local Codex request failed. Check sign-in or restart the companion and pair again.")
    }
    return response
  }
  private async json(path: string, value: unknown = {}): Promise<unknown> {
    const response = await this.request(path, value)
    // Normalized account/model responses are small; do not buffer an unbounded peer response.
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Empty companion response")
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.length
        if (size > 524_288) throw new Error("Companion response exceeded limits")
        chunks.push(next.value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  }
  async pair(code: string): Promise<void> {
    const result = z.object({ token: z.string().min(32).max(100), expiresAt: z.number().positive() }).strict().parse(await this.json("/pair", { code, confirm: true }))
    this.token = result.token
    this.expires = result.expiresAt
  }
  async status(): Promise<LocalCodexStatus> { return localStatusSchema.parse(await this.json("/status")) }
  async models(): Promise<Array<{ id: string; label: string }>> {
    return z.object({ models: z.array(z.object({ id: z.string().max(200), label: z.string().max(200) }).strict()).max(10_000) }).strict().parse(await this.json("/models")).models
  }
  async login(): Promise<string> {
    return safeCodexLoginUrl(z.object({ authUrl: z.string().max(8192) }).strict().parse(await this.json("/login")).authUrl)
  }
  async cancelLogin(): Promise<void> { await this.json("/cancel-login") }
  async logout(): Promise<void> { await this.json("/logout") }
  async interrupt(): Promise<void> { await this.json("/interrupt") }
  async unpair(): Promise<void> { try { await this.json("/unpair") } finally { this.forget() } }
  forget(): void { this.token = null; this.expires = 0 }
  async *turn(input: { content: string; model: string; thread?: string }, signal: AbortSignal) {
    const response = await this.request("/turn", input, signal)
    if (!response.body || !response.headers.get("content-type")?.startsWith("application/x-ndjson")) throw new Error("Invalid local stream")
    yield* readLocalEvents(response.body, signal)
  }
}
