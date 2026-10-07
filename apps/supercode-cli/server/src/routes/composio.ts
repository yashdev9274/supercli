import { createHmac, timingSafeEqual } from "node:crypto"
import type { Express, Request, Response } from "express"
import { z } from "zod"

import { ServerComposioService } from "../lib/composio"

type Authenticate = (req: Request) => Promise<{ id: string } | null>

const slugSchema = z.string().regex(/^[a-z0-9_-]{1,64}$/)
const connectSchema = z.object({ slug: slugSchema, returnTo: z.enum(["desktop", "nova"]).default("desktop") })
const disconnectSchema = z.object({ connectedAccountId: z.string().min(1).max(256) })
const toolNameSchema = z.string().min(1).max(256)
const executeSchema = z.object({
  toolName: toolNameSchema.optional(),
  name: toolNameSchema.optional(),
  arguments: z.record(z.unknown()).default({}),
}).refine((input) => Boolean(input.toolName || input.name) && (!input.toolName || !input.name || input.toolName === input.name))
  .transform((input) => ({ name: input.toolName ?? input.name ?? "", arguments: input.arguments }))
const stateSchema = connectSchema.extend({ userId: z.string().min(1), expiresAt: z.number() })

function stateSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw Object.assign(new Error("BETTER_AUTH_SECRET is required on the CLI server"), { statusCode: 503 })
  return secret
}

function verifyState(state: unknown): z.infer<typeof stateSchema> | null {
  if (typeof state !== "string") return null
  const [payload, signature, extra] = state.split(".")
  if (!payload || !signature || extra) return null
  const expected = createHmac("sha256", stateSecret()).update(payload).digest()
  const received = Buffer.from(signature, "base64url")
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null
  try {
    const result = stateSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")))
    return result.success && result.data.expiresAt > Date.now() ? result.data : null
  } catch {
    return null
  }
}

function completionUrl(returnTo: "desktop" | "nova", slug: string, error?: string): URL {
  const novaUrl = process.env.NOVA_WEB_URL
    || (process.env.NODE_ENV === "production" ? "https://nova.supercodeai.tech" : "http://nova.localhost:3003")
  const url = returnTo === "nova" ? new URL("/connections", novaUrl) : new URL("supercode://composio/connected")
  url.searchParams.set(returnTo === "nova" ? "connected" : "provider", slug)
  if (error) {
    url.searchParams.delete("connected")
    url.searchParams.set(returnTo === "nova" ? "integration_error" : "error", error)
  }
  return url
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid Composio request" })
    return
  }
  const value = error as { statusCode?: number }
  const status = value?.statusCode ?? 502
  res.status(status).json({
    error: status === 502 ? "The CLI server could not complete the Composio request" : error instanceof Error ? error.message : "Composio request failed",
  })
}

export function registerComposioRoutes(
  app: Express,
  authenticate: Authenticate,
  service = new ServerComposioService(),
): void {
  for (const action of ["session", "apps", "connect", "disconnect", "tools", "execute"] as const) {
    app.post(`/api/composio/${action}`, async (req, res) => {
      res.setHeader("Cache-Control", "no-store")
      try {
        const user = await authenticate(req)
        if (!user) {
          res.status(401).json({ error: "Unauthorized" })
          return
        }
        switch (action) {
          case "session":
            res.json(await service.createSession(user.id))
            return
          case "apps":
            res.json({ apps: await service.listApps(user.id) })
            return
          case "tools":
            res.json({ tools: await service.listTools(user.id) })
            return
          case "connect": {
            const input = connectSchema.parse(req.body)
            const payload = Buffer.from(JSON.stringify({ ...input, userId: user.id, expiresAt: Date.now() + 10 * 60 * 1000 })).toString("base64url")
            const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url")
            const serverUrl = process.env.BETTER_AUTH_URL || process.env.SUPERCODE_SERVER_URL
            if (!serverUrl) throw Object.assign(new Error("The CLI server public URL is not configured"), { statusCode: 503 })
            const callback = new URL("/api/composio/callback", serverUrl)
            callback.searchParams.set("state", `${payload}.${signature}`)
            res.json(await service.connect(user.id, input.slug, callback.toString()))
            return
          }
          case "disconnect": {
            const input = disconnectSchema.parse(req.body)
            await service.disconnect(user.id, input.connectedAccountId)
            res.json({ success: true })
            return
          }
          case "execute": {
            const input = executeSchema.parse(req.body)
            res.json(await service.executeTool(user.id, input.name, input.arguments))
          }
        }
      } catch (error) {
        sendError(res, error)
      }
    })
  }

  app.get("/api/composio/callback", async (req, res) => {
    res.setHeader("Cache-Control", "no-store")
    try {
      const state = verifyState(req.query.state)
      if (!state) {
        res.status(400).json({ error: "Invalid or expired Composio OAuth state" })
        return
      }
      const status = req.query.status ?? req.query.connection_status
      if (req.query.error || (status && status !== "success" && status !== "ACTIVE")) {
        res.redirect(303, completionUrl(state.returnTo, state.slug, "oauth_denied").toString())
        return
      }
      const accountId = req.query.connected_account_id ?? req.query.connectedAccountId
      try {
        const valid = typeof accountId === "string" && await service.verifyConnection(state.userId, state.slug, accountId)
        res.redirect(303, completionUrl(state.returnTo, state.slug, valid ? undefined : "connection_invalid").toString())
      } catch {
        res.redirect(303, completionUrl(state.returnTo, state.slug, "connect_failed").toString())
      }
    } catch (error) {
      sendError(res, error)
    }
  })
}
