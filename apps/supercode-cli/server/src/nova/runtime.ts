import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { CodexRpc, NativeMessage } from "./codex-rpc"
import type { CodexProfileMode } from "./profile"

const accountSchema = z.object({ account: z.object({
  type: z.literal("chatgpt"), email: z.string().max(320).nullable(), planType: z.string().max(100),
}).nullable() })
const modelsSchema = z.object({ data: z.array(z.object({
  model: z.string().min(1).max(200), displayName: z.string().max(200), hidden: z.boolean().optional(),
})).max(1000), nextCursor: z.string().nullable().optional() })
export type LocalStatus = { account: { email: string | null; planType: string } | null; login: "idle" | "pending" | "succeeded" | "failed"; workspace: string; readOnly: true; profile: CodexProfileMode }
export type LocalEvent = { type: "text"; content: string } | { type: "thread"; id: string } | { type: "finish"; reason: "completed" | "interrupted" | "failed" }
export const turnInput = z.object({
  content: z.string().trim().min(1).max(32_000), model: z.string().min(1).max(200),
  thread: z.string().uuid().optional(),
}).strict()

export function loginUrl(value: string): string {
  const url = new URL(value)
  if (!["https://auth.openai.com", "https://chatgpt.com"].includes(url.origin) || url.username || url.password || url.hash || url.searchParams.has("access_token") || url.searchParams.has("id_token")) {
    throw new Error("Invalid Codex login URL")
  }
  return url.href
}

export class LocalCodexRuntime {
  private loginId: string | null = null
  private loginState: LocalStatus["login"] = "idle"
  private threads = new Map<string, { native: string; owner: string }>()
  private identity: string | null = null
  private busy = false
  private active: { thread: string; turn?: string; stop(): void } | null = null
  private generation = 0
  private unsubscribe: () => void

  constructor(private rpc: CodexRpc, private readonly workspace: string, private readonly workspaceName: string, private readonly profile: CodexProfileMode = "existing") {
    this.unsubscribe = rpc.subscribe((message) => {
      if (message.method === "account/updated") {
        this.generation++
        this.threads.clear()
        this.identity = null
        if (this.active) { this.active.stop(); this.rpc.close() }
      }
      if (message.method === "account/login/completed" && message.params?.loginId === this.loginId) {
        this.loginState = message.params?.success === true ? "succeeded" : "failed"
        this.loginId = null
      }
    })
  }

  async status(): Promise<LocalStatus> {
    const raw = await this.rpc.request("account/read", { refreshToken: false })
    const parsed = accountSchema.safeParse(raw)
    if (!parsed.success) throw new Error("Nova requires a ChatGPT account, not API-key authentication")
    const account = parsed.data.account
    const identity = account ? JSON.stringify(account) : null
    if (this.identity !== identity) {
      this.threads.clear()
      this.identity = identity
      if (this.active) { this.active.stop(); this.rpc.close() }
    }
    return { account: account ? { email: account.email, planType: account.planType } : null, login: this.loginState, workspace: this.workspaceName, readOnly: true, profile: this.profile }
  }

  async login(): Promise<{ authUrl: string }> {
    this.assertIsolated()
    if (this.busy || this.loginId) throw new Error("Codex is busy")
    this.busy = true
    try {
      const result = z.object({ loginId: z.string(), authUrl: z.string() }).parse(
        await this.rpc.request("account/login/start", { type: "chatgpt" }),
      )
      this.loginId = result.loginId
      this.loginState = "pending"
      return { authUrl: loginUrl(result.authUrl) }
    } finally { this.busy = false }
  }

  async cancelLogin(): Promise<void> {
    if (!this.loginId) return
    this.assertIsolated()
    if (this.busy) throw new Error("Codex is busy")
    const id = this.loginId
    await this.rpc.request("account/login/cancel", { loginId: id })
    this.loginId = null
    this.loginState = "idle"
  }

  async models(): Promise<Array<{ id: string; label: string }>> {
    if (!(await this.status()).account) return []
    const generation = this.generation
    const models: Array<{ id: string; label: string }> = []
    let cursor: string | undefined
    for (let page = 0; page < 10; page++) {
      const result = modelsSchema.parse(await this.rpc.request("model/list", { cursor, limit: 100 }))
      models.push(...result.data.filter((entry) => !entry.hidden).map((entry) => ({ id: entry.model, label: entry.displayName })))
      if (generation !== this.generation) throw new Error("Codex account changed")
      if (!result.nextCursor) return models
      cursor = result.nextCursor
    }
    throw new Error("Codex catalog exceeded limits")
  }

  private assertIsolated(): void {
    if (this.profile !== "isolated") throw new Error("Manage your shared Codex login in the terminal with codex login or codex logout")
  }

  async logout(): Promise<void> {
    this.assertIsolated()
    if (this.busy) throw new Error("Stop the active turn before signing out")
    this.busy = true
    try {
      if (this.loginId) await this.rpc.request("account/login/cancel", { loginId: this.loginId })
      await this.rpc.request("account/logout", {})
      this.loginId = null
      this.loginState = "idle"
      this.threads.clear()
      this.identity = null
    } finally { this.busy = false }
  }

  async turn(value: unknown, owner: string, signal: AbortSignal, emit: (event: LocalEvent) => void): Promise<void> {
    const input = turnInput.parse(value)
    if (this.busy || this.loginId) throw new Error("Codex is busy")
    this.busy = true
    let unsubscribe = () => {}
    let deadline: ReturnType<typeof setTimeout> | undefined
    let abort = () => {}
    try {
      signal.throwIfAborted()
      const generation = this.generation
      const models = await this.models()
      if (!this.identity || !models.some((model) => model.id === input.model)) throw new Error("Model unavailable")
      signal.throwIfAborted()
      if (generation !== this.generation) throw new Error("Codex account changed")
      let thread = input.thread ? this.threads.get(input.thread) : undefined
      if (input.thread && (!thread || thread.owner !== owner)) throw new Error("Thread unavailable")
      if (!thread) {
        if (this.threads.size >= 100) throw new Error("Restart companion to create more threads")
        const started = z.object({ thread: z.object({ id: z.string() }) }).parse(await this.rpc.request("thread/start", {
          cwd: this.workspace, model: input.model, sandbox: "read-only", approvalPolicy: "on-request",
          config: { mcp_servers: {}, web_search: "disabled" },
          developerInstructions: "Read-only Nova session. Do not modify files, request elevated permissions, or use external integrations.",
        }))
        thread = { native: started.thread.id, owner }
        input.thread = randomUUID()
        this.threads.set(input.thread, thread)
      }
      signal.throwIfAborted()
      if (generation !== this.generation) throw new Error("Codex account changed")
      emit({ type: "thread", id: input.thread! })
      const native = thread.native
      let turnId: string | undefined
      let done = false
      let stopping = false
      let bytes = 0
      let resolveFinished!: () => void
      const finished = new Promise<void>((resolve) => { resolveFinished = resolve })
      const finish = (reason: "completed" | "failed" | "interrupted") => {
        if (done) return
        done = true
        try { emit({ type: "finish", reason }) } finally { resolveFinished() }
      }
      abort = () => {
        if (done || stopping) return
        stopping = true
        // Terminating this dedicated process also covers cancellation before turn/start replies.
        this.rpc.close()
        finish("interrupted")
      }
      this.active = { thread: native, stop: abort }
      unsubscribe = this.rpc.subscribe((message: NativeMessage) => {
        if (message.method === "nova/processExited") { finish(stopping ? "interrupted" : "failed"); return }
        const params = message.params
        if (params?.threadId !== native || done) return
        if (message.method === "turn/started") {
          const parsed = z.object({ turn: z.object({ id: z.string() }) }).safeParse(params)
          if (parsed.success) { turnId = parsed.data.turn.id; if (this.active) this.active.turn = turnId }
        }
        if (turnId && params.turnId && params.turnId !== turnId) return
        if (message.method === "item/agentMessage/delta" && typeof params.delta === "string") {
          bytes += Buffer.byteLength(params.delta)
          if (bytes > 2_097_152) { abort(); return }
          try { emit({ type: "text", content: params.delta }) } catch { abort() }
        }
        if (message.method === "turn/completed") {
          const parsed = z.object({ turn: z.object({ id: z.string(), status: z.string() }) }).safeParse(params)
          if (parsed.success && (!turnId || parsed.data.turn.id === turnId)) {
            const status = parsed.data.turn.status
            finish(status === "completed" ? "completed" : status === "interrupted" ? "interrupted" : "failed")
          }
        }
      })
      signal.addEventListener("abort", abort, { once: true })
      deadline = setTimeout(abort, 180_000)
      signal.throwIfAborted()
      const result = z.object({ turn: z.object({ id: z.string() }) }).parse(await this.rpc.request("turn/start", {
        threadId: native, input: [{ type: "text", text: input.content }], model: input.model,
        cwd: this.workspace, approvalPolicy: "on-request", sandboxPolicy: { type: "readOnly" },
      }))
      turnId = result.turn.id
      if (this.active) this.active.turn = turnId
      await finished
    } finally {
      clearTimeout(deadline)
      signal.removeEventListener("abort", abort)
      unsubscribe()
      this.active = null
      this.busy = false
    }
  }

  async interrupt(): Promise<void> {
    const active = this.active
    if (!active) return
    if (!active.turn) { active.stop(); return }
    try { await this.rpc.request("turn/interrupt", { threadId: active.thread, turnId: active.turn }) }
    catch { active.stop() }
  }

  unpair(owner: string): void {
    this.generation++
    if (this.busy) this.active?.stop()
    for (const [id, thread] of this.threads) if (thread.owner === owner) this.threads.delete(id)
  }

  close(): void { this.active?.stop(); this.unsubscribe(); this.rpc.close() }
}
