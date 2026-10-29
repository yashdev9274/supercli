import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { z } from "zod"
import type { LocalCodexRuntime } from "./runtime"

export function localOrigin(value: string): string {
  const url = new URL(value)
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.origin !== value || url.username || url.password) {
    throw new Error("Nova native login requires a locally hosted Nova origin")
  }
  return url.origin
}
const digest = (value: string) => createHash("sha256").update(value).digest()
const matches = (a: string, b: string) => timingSafeEqual(digest(a), digest(b))

async function body(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk)
    size += bytes.length
    if (size > 65_536) throw new Error("Request too large")
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}
function json(res: ServerResponse, value: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(value))
}

export async function startCompanion(options: { origin: string; port: number; runtime: LocalCodexRuntime; now?: () => number }) {
  const origin = localOrigin(options.origin)
  const now = options.now ?? Date.now
  const pairingCode = randomBytes(24).toString("base64url")
  const pairExpiry = now() + 300_000
  let used = false
  let attempts = 0
  let credential: string | null = null
  let expires = 0
  let owner = ""
  let activeController: AbortController | null = null
  let inFlight = 0
  let port = 0
  const server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")
    if (req.headers.host !== `127.0.0.1:${port}` || req.headers.origin !== origin || !["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")) {
      json(res, { error: "Companion request denied" }, 403)
      return
    }
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
    if (req.method === "OPTIONS") {
      const headers = String(req.headers["access-control-request-headers"] ?? "").toLowerCase().split(",").map((value) => value.trim()).filter(Boolean)
      if (req.headers["access-control-request-method"] !== "POST" || headers.some((header) => !["authorization", "content-type"].includes(header))) {
        json(res, { error: "Preflight denied" }, 403)
        return
      }
      res.setHeader("Access-Control-Allow-Methods", "POST")
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
      res.setHeader("Access-Control-Allow-Private-Network", "true")
      res.writeHead(204).end()
      return
    }
    if (req.method !== "POST" || req.headers["content-type"] !== "application/json" || !req.url || !/^\/[a-z-]+$/.test(req.url)) {
      json(res, { error: "Invalid request" }, 400)
      return
    }
    const path = req.url
    if (path === "/pair") {
      attempts++
      if (used || attempts > 5 || now() >= pairExpiry) { json(res, { error: "Restart companion to pair again" }, 403); return }
    } else if (!credential || now() >= expires || !matches(req.headers.authorization ?? "", `Bearer ${credential}`)) {
      if (now() >= expires) activeController?.abort()
      json(res, { error: "Pairing expired; restart companion" }, 401)
      return
    }
    if (inFlight >= 8) { json(res, { error: "Companion busy" }, 429); return }
    inFlight++
    void (async () => {
      try {
        const value = await body(req)
        if (path === "/pair") {
          const input = z.object({ code: z.string().max(100), confirm: z.literal(true) }).strict().parse(value)
          if (used || now() >= pairExpiry || !matches(input.code, pairingCode)) { json(res, { error: "Pairing denied" }, 403); return }
          used = true
          credential = randomBytes(32).toString("base64url")
          owner = randomBytes(16).toString("hex")
          expires = now() + 3_600_000
          json(res, { token: credential, expiresAt: expires })
          return
        }
        // Reading the body yields: unpair/expiry may have revoked this request meanwhile.
        if (!credential || now() >= expires || !matches(req.headers.authorization ?? "", `Bearer ${credential}`)) {
          json(res, { error: "Pairing expired; restart companion" }, 401)
          return
        }
        if (path === "/turn") {
          if (activeController) throw new Error("busy")
          const controller = new AbortController()
          activeController = controller
          const expiry = setTimeout(() => controller.abort(), Math.max(0, expires - now()))
          const onClose = () => { if (!res.writableEnded) controller.abort() }
          res.on("close", onClose)
          res.writeHead(200, { "Content-Type": "application/x-ndjson" })
          let terminal = false
          try {
            await options.runtime.turn(value, owner, controller.signal, (event) => {
              if (res.destroyed || res.writableLength > 262_144) { controller.abort(); throw new Error("Stream overflow") }
              if (terminal) return
              if (event.type === "finish") terminal = true
              res.write(`${JSON.stringify(event)}\n`)
            })
          } catch {
            if (!res.destroyed && !terminal) res.write(`${JSON.stringify({ type: "finish", reason: "failed" })}\n`)
          } finally {
            clearTimeout(expiry)
            res.off("close", onClose)
            activeController = null
            res.end()
          }
          return
        }
        z.object({}).strict().parse(value)
        switch (path) {
          case "/status": json(res, await options.runtime.status()); break
          case "/models": json(res, { models: await options.runtime.models() }); break
          case "/login": json(res, await options.runtime.login()); break
          case "/cancel-login": await options.runtime.cancelLogin(); json(res, { ok: true }); break
          case "/logout": await options.runtime.logout(); json(res, { ok: true }); break
          case "/interrupt": await options.runtime.interrupt(); json(res, { ok: true }); break
          case "/unpair":
            activeController?.abort()
            credential = null
            options.runtime.unpair(owner)
            await options.runtime.cancelLogin()
            json(res, { ok: true })
            break
          default: json(res, { error: "Not found" }, 404)
        }
      } catch {
        if (!res.headersSent) json(res, { error: "Local Codex request failed. Check Codex installation, sign-in, or restart the companion." }, 400)
        else res.end()
      } finally { inFlight-- }
    })()
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 10_000
  server.maxConnections = 16
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Companion could not listen")
  port = address.port
  return {
    port, pairingCode,
    close: async () => {
      credential = null
      activeController?.abort()
      options.runtime.close()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
