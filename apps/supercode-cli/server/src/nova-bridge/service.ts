import { fork, type ChildProcess } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import type { BridgeStart, Handoff } from "./protocol"

type Run = { owner: string; worker: ChildProcess; pending: Map<string, Handoff>; close: () => void }
export class BridgeService {
  private runs = new Map<string, Run>()
  start(owner: string, input: BridgeStart, emit: (event: Record<string, unknown>) => void, done: () => void): { id: string; close: () => void } {
    if (this.runs.size >= 32 || [...this.runs.values()].filter((run) => run.owner === owner).length >= 3) throw new Error("CLI harness capacity reached")
    const id = randomUUID()
    const worker = fork(fileURLToPath(new URL("./worker.ts", import.meta.url)), [], {
      // Never inherit provider credentials, home-directory config, or DB secrets.
      env: { PATH: process.env.PATH, NODE_ENV: "production", HOME: "/nonexistent" },
      execArgv: [], cwd: fileURLToPath(new URL("../../", import.meta.url)),
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    })
    let closed = false
    let terminal = false
    const timer = setTimeout(() => { emit({ type: "error", message: "CLI harness run expired" }); close() }, 10 * 60_000)
    const close = () => {
      if (closed) return
      closed = true
      clearTimeout(timer)
      this.runs.delete(id)
      worker.kill("SIGKILL")
      done()
    }
    const run: Run = { owner, worker, pending: new Map(), close }
    this.runs.set(id, run)
    worker.on("message", (raw: unknown) => {
      if (closed) return
      const message = raw as Record<string, unknown>
      if (message.type === "rpc") {
        const payload = message.payload as Record<string, unknown>
        const handoff: Handoff = { type: "handoff", id: String(message.id), kind: message.kind as Handoff["kind"], payload, hash: createHash("sha256").update(JSON.stringify([id, message.id, message.kind, payload])).digest("hex") }
        run.pending.set(handoff.id, handoff)
        emit(handoff)
      } else if (message.type === "event" && !terminal) {
        const event = message.event as Record<string, unknown>
        terminal = event.type === "finish" || event.type === "error"
        emit(event)
      } else if (message.type === "done") close()
    })
    worker.on("error", () => { if (!terminal) emit({ type: "error", message: "CLI harness worker unavailable" }); close() })
    worker.on("exit", () => { if (!closed && !terminal) emit({ type: "error", message: "CLI harness worker stopped unexpectedly" }); close() })
    worker.send({ type: "start", input })
    return { id, close }
  }
  reply(owner: string, runId: string, id: string, hash: string, value: unknown, error?: string): boolean {
    const run = this.runs.get(runId)
    const pending = run?.pending.get(id)
    if (!run || run.owner !== owner || !pending || pending.hash !== hash) return false
    run.pending.delete(id)
    run.worker.send({ type: "reply", id, value, error })
    return true
  }
}
