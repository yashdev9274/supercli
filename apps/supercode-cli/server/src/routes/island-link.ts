import type { Express, Request } from "express"
import { z } from "zod"

import {
  closeIslandLink,
  joinIslandLink,
  openIslandLink,
  postIslandTurn,
  readIslandLink,
  touchIslandLink,
} from "../voice/islandLink"

const idSchema = z.string().uuid()
const sinceSchema = z.coerce.number().int().nonnegative().max(10_000).optional()

/**
 * The voice link between Nova web and the Jarvis dynamic island.
 *
 * Nova opens a link (`POST /api/voice/link`) and polls it. The island joins
 * with the code (`POST /api/voice/link/join`) and polls its own view. Turns
 * posted by either side show up on the next poll of the other.
 */
export function registerIslandLinkRoutes(
  app: Express,
  authenticate: (req: Request) => Promise<{ id: string } | null>,
): void {
  app.post("/api/voice/link", async (req, res) => {
    const user = await authenticate(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }
    res.json(openIslandLink(user.id))
  })

  app.get("/api/voice/link/:id", async (req, res) => {
    const user = await authenticate(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }
    const id = idSchema.safeParse(req.params.id)
    const since = sinceSchema.safeParse(req.query.since)
    if (!id.success || !since.success) { res.status(400).json({ error: "Invalid voice link" }); return }
    const link = readIslandLink(user.id, id.data, since.data ?? 0)
    if (!link) { res.status(404).json({ error: "Voice link not found" }); return }
    res.json(link)
  })

  app.delete("/api/voice/link/:id", async (req, res) => {
    const user = await authenticate(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }
    const id = idSchema.safeParse(req.params.id)
    if (!id.success || !closeIslandLink(user.id, id.data)) { res.status(404).json({ error: "Voice link not found" }); return }
    res.json({ closed: true })
  })

  const joinSchema = z.object({ code: z.string().trim().min(4).max(12) }).strict()
  app.post("/api/voice/link/join", async (req, res) => {
    const user = await authenticate(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }
    const parsed = joinSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: "A voice link code is required" }); return }
    const joined = joinIslandLink(user.id, parsed.data.code)
    if (!joined) { res.status(404).json({ error: "No voice link is waiting for that code" }); return }
    res.json(joined)
  })

  app.get("/api/voice/link/:id/island", async (req, res) => {
    const user = await authenticate(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }
    const id = idSchema.safeParse(req.params.id)
    const since = sinceSchema.safeParse(req.query.since)
    if (!id.success || !since.success) { res.status(400).json({ error: "Invalid voice link" }); return }
    const link = touchIslandLink(user.id, id.data, since.data ?? 0)
    if (!link) { res.status(404).json({ error: "Voice link not found" }); return }
    res.json(link)
  })

  const turnSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4_000),
  }).strict()
  app.post("/api/voice/link/:id/turn", async (req, res) => {
    const user = await authenticate(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }
    const id = idSchema.safeParse(req.params.id)
    const parsed = turnSchema.safeParse(req.body)
    if (!id.success || !parsed.success) { res.status(400).json({ error: "Invalid voice turn" }); return }
    const result = postIslandTurn(user.id, id.data, parsed.data.role, parsed.data.content)
    if (!result.ok) {
      res.status(result.reason === "not-live" ? 409 : 404).json({ error: result.reason === "not-live" ? "The island has not joined yet" : "Voice link not found" })
      return
    }
    res.json({ accepted: true, cursor: result.cursor })
  })
}
