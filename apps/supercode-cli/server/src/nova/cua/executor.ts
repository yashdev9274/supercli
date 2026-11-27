import { createHash, randomBytes, sign, type KeyObject } from "node:crypto"

type Adapter = { call(name: string, args: unknown, options: { signal: AbortSignal }): Promise<unknown> }
type Request = (endpoint: "poll" | "claim" | "start" | "complete", proof: object) => Promise<unknown>

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export class CuaExecutor {
  private busy = false
  private seen = new Set<string>()

  constructor(private readonly deviceId: string, private readonly key: KeyObject, private readonly request: Request, private readonly adapter: Adapter) {
    if (!deviceId || key.type !== "private" || key.asymmetricKeyType !== "ed25519") throw new Error("Invalid device credentials")
  }

  private proof(operation: "claim" | "start" | "complete", commandId: string, fence: string | null, result: unknown) {
    const timestamp = Date.now()
    const nonce = randomBytes(32).toString("base64url")
    const message = ["nova-desktop-request-v1", this.deviceId, operation, commandId, fence, result, timestamp, nonce]
    return { deviceId: this.deviceId, operation, commandId, fence, result, timestamp, nonce, signature: sign(null, Buffer.from(JSON.stringify(message)), this.key).toString("base64url") }
  }

  async poll() {
    if (this.busy) throw new Error("Executor is already running")
    this.busy = true
    try {
      const timestamp = Date.now()
      const nonce = randomBytes(32).toString("base64url")
      const message = ["nova-desktop-poll-v1", this.deviceId, timestamp, nonce]
      const response = await this.request("poll", { deviceId: this.deviceId, timestamp, nonce, signature: sign(null, Buffer.from(JSON.stringify(message)), this.key).toString("base64url") })
      if (!object(response) || !Array.isArray(response.commands) || response.commands.length > 50) throw new Error("Invalid poll response")
      for (const item of response.commands) {
        if (!object(item) || typeof item.id !== "string" || !item.id || item.id.length > 128 || this.seen.has(item.id)) continue
        this.seen.add(item.id)
        await this.execute(item.id)
      }
    } finally { this.busy = false }
  }

  private async execute(id: string) {
    const claim = await this.request("claim", this.proof("claim", id, null, null))
    if (!object(claim) || typeof claim.fence !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(claim.fence) || !object(claim.command)) throw new Error("Invalid claim")
    const command = claim.command
    if (command.id !== id || typeof command.toolName !== "string" || command.capability !== `nova-harness:${command.toolName}` || !object(command.arguments) || typeof command.expiresAt !== "string") throw new Error("Invalid command")
    const args = command.arguments
    const keys = Object.keys(args).sort()
    const valid = (command.toolName === "list_apps" || command.toolName === "list_windows") ? keys.length === 0 : command.toolName === "get_window_state" && keys.join(",") === "pid,window_id" && Number.isSafeInteger(args.pid) && Number(args.pid) > 0 && Number(args.pid) <= 2147483647 && Number.isSafeInteger(args.window_id) && Number(args.window_id) >= 0 && Number(args.window_id) <= 4294967295
    const canonical = JSON.stringify(Object.fromEntries(keys.map(key => [key, args[key]])))
    if (!valid || createHash("sha256").update(canonical).digest("hex") !== command.argsHash) throw new Error("Invalid command arguments")
    const expiry = Date.parse(command.expiresAt)
    if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 120_000) throw new Error("Command expired")
    const start = await this.request("start", this.proof("start", id, claim.fence, null))
    if (!object(start) || start.ok !== true || expiry <= Date.now()) throw new Error("Command start denied or expired")
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(0, expiry - Date.now()))
    try {
      const result = await this.adapter.call(command.toolName, args, { signal: controller.signal })
      if (controller.signal.aborted || Date.now() >= expiry) throw new Error("Command expired")
      const completed = await this.request("complete", this.proof("complete", id, claim.fence, result))
      if (!object(completed) || completed.ok !== true) throw new Error("Command completion denied")
    } finally { clearTimeout(timer) }
  }
}
