import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import type { CodexProfileMode } from "./profile"

export type NativeMessage = { id?: number | string; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown }
export interface CodexRpc {
  request(method: string, params: unknown): Promise<unknown>
  subscribe(listener: (message: NativeMessage) => void): () => void
  close(): void
}

export class StdioCodex implements CodexRpc {
  private nextId = 0
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  private listeners = new Set<(message: NativeMessage) => void>()
  private buffer = ""
  private closed = false
  private ready: Promise<void>

  constructor(private readonly process: ChildProcessWithoutNullStreams, private readonly timeout = 30_000) {
    process.stdout.setEncoding("utf8")
    process.stdout.on("data", (chunk: string) => this.receive(chunk))
    process.stderr.resume()
    process.on("error", () => this.close())
    process.on("exit", () => this.close())
    process.stdin.on("error", () => this.close())
    this.ready = this.sendRequest("initialize", {
      clientInfo: { name: "nova_local", title: "Nova Local", version: "0.1.0" },
    }).then(() => { this.write({ method: "initialized", params: {} }) })
    void this.ready.catch(() => this.close())
  }

  private write(message: NativeMessage): void {
    if (this.closed || this.process.stdin.writableLength > 1_048_576) throw new Error("Codex is unavailable")
    this.process.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    if (this.closed || this.pending.size >= 32) return Promise.reject(new Error("Codex is unavailable"))
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.close() }, this.timeout)
      this.pending.set(id, { resolve, reject, timer })
      try { this.write({ id, method, params: params as Record<string, unknown> }) } catch { this.close() }
    })
  }

  async request(method: string, params: unknown): Promise<unknown> {
    await this.ready
    return this.sendRequest(method, params)
  }

  private receive(chunk: string): void {
    if (this.closed) return
    this.buffer += chunk
    try {
      let end: number
      while ((end = this.buffer.indexOf("\n")) >= 0) {
        if (end > 1_048_576) throw new Error("size")
        const line = this.buffer.slice(0, end)
        this.buffer = this.buffer.slice(end + 1)
        if (!line.trim()) continue
        const message = JSON.parse(line) as NativeMessage
        if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("message")
        if (message.method && message.id !== undefined) {
          // Unsupported server requests must never gain execution or permissions.
          this.write({ id: message.id, error: { code: -32601, message: "Unsupported in Nova read-only mode" } })
        } else if (message.id !== undefined) {
          const pending = typeof message.id === "number" ? this.pending.get(message.id) : undefined
          if (!pending) continue
          this.pending.delete(message.id as number)
          clearTimeout(pending.timer)
          if ("error" in message) pending.reject(new Error("Codex request failed"))
          else if ("result" in message) pending.resolve(message.result)
          else pending.reject(new Error("Invalid Codex response"))
        } else if (typeof message.method === "string") {
          for (const listener of this.listeners) listener(message)
        }
      }
      if (this.buffer.length > 1_048_576) throw new Error("size")
    } catch { this.close() }
  }

  subscribe(listener: (message: NativeMessage) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error("Codex stopped or timed out"))
    }
    this.pending.clear()
    for (const listener of this.listeners) listener({ method: "nova/processExited" })
    this.listeners.clear()
    this.buffer = ""
    this.process.kill("SIGTERM")
    const kill = setTimeout(() => this.process.kill("SIGKILL"), 2000)
    kill.unref()
  }
}

export function codexLaunchArgs(mode: CodexProfileMode): string[] {
  return [
    "app-server", "--listen", "stdio://",
    // Existing mode must preserve the CLI's file/keyring credential backend.
    ...(mode === "isolated" ? ["-c", 'cli_auth_credentials_store="file"'] : []),
    "-c", 'forced_login_method="chatgpt"',
    "-c", 'sandbox_mode="read-only"',
    "-c", 'approval_policy="on-request"',
    "-c", "mcp_servers={}",
    "-c", "analytics.enabled=false",
  ]
}

export function spawnCodex(profile: string, cwd: string, mode: CodexProfileMode = "existing"): StdioCodex {
  const env: NodeJS.ProcessEnv = { CODEX_HOME: profile }
  for (const key of ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "LANG"]) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return new StdioCodex(spawn("codex", codexLaunchArgs(mode), { cwd, env, stdio: ["pipe", "pipe", "pipe"], shell: false }))
}
