import type { Express, Request } from "express"
import { z } from "zod"
import { BridgeService } from "../nova-bridge/service"
import { BRIDGE_VERSION, startSchema } from "../nova-bridge/protocol"

export function registerNovaHarnessRoutes(app: Express, authenticate: (req: Request) => Promise<{ id: string } | null>, service = new BridgeService()): void {
  app.post("/api/nova/harness/turn", async (req, res) => {
    const user = await authenticate(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }
    const parsed = startSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: "Invalid CLI harness protocol", version: BRIDGE_VERSION }); return }
    res.setHeader("Content-Type", "application/x-ndjson")
    res.setHeader("Cache-Control", "no-store, no-transform")
    res.setHeader("X-Accel-Buffering", "no")
    let run: ReturnType<BridgeService["start"]> | undefined
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(JSON.stringify({ type: "status", phase: "harness", message: "CLI harness running" }) + "\n") }, 10_000)
    const cleanup = () => { clearInterval(heartbeat); run?.close() }
    res.once("close", cleanup)
    try {
      run = service.start(user.id, parsed.data, (event) => { if (!res.destroyed) res.write(JSON.stringify(event) + "\n") }, () => { clearInterval(heartbeat); res.end() })
      res.write(JSON.stringify({ type: "bridge", version: BRIDGE_VERSION, runId: run.id }) + "\n")
    } catch {
      clearInterval(heartbeat)
      res.write(JSON.stringify({ type: "error", message: "CLI harness bridge unavailable or at capacity" }) + "\n")
      res.end()
    }
  })
  const replySchema = z.object({ id: z.string().uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/), value: z.unknown(), error: z.string().max(1000).optional() }).strict()
  app.post("/api/nova/harness/:runId/reply", async (req, res) => {
    const user = await authenticate(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }
    const parsed = replySchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: "Invalid handoff reply" }); return }
    const { id, hash, value, error } = parsed.data
    if (!service.reply(user.id, String(req.params.runId), id, hash, value, error)) { res.status(409).json({ error: "Handoff expired, mismatched or already consumed" }); return }
    res.json({ accepted: true })
  })
}
