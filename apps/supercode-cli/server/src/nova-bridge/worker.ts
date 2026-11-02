import { randomUUID } from "node:crypto"
import { runBridgeTurn } from "./runner"
import { startSchema } from "./protocol"

const controller = new AbortController()
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
let started = false
process.on("disconnect", () => { controller.abort(); process.exit(0) })
process.on("message", async (raw: unknown) => {
  const message = raw as Record<string, unknown>
  if (message.type === "reply") {
    const item = pending.get(String(message.id))
    if (!item) return
    pending.delete(String(message.id))
    if (message.error) item.reject(new Error(String(message.error)))
    else item.resolve(message.value)
  } else if (message.type === "start" && !started) {
    started = true
    try {
      const input = startSchema.parse(message.input)
      await runBridgeTurn(input, (kind, payload) => new Promise((resolve, reject) => {
        const id = randomUUID()
        pending.set(id, { resolve, reject })
        process.send?.({ type: "rpc", id, kind, payload })
      }), (event) => process.send?.({ type: "event", event }), controller.signal)
    } catch (error) {
      process.send?.({ type: "event", event: { type: "error", message: error instanceof Error ? error.message : "CLI harness failed" } })
    } finally {
      process.send?.({ type: "done" })
      process.disconnect?.()
    }
  }
})
