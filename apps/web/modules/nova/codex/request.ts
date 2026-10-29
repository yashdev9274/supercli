import { z } from "zod"
import { CodexError } from "./provider"

export function assertCodexOrigin(request: Request): void {
  const origin = request.headers.get("origin")
  const site = request.headers.get("sec-fetch-site")
  const url = new URL(request.url)
  const host = request.headers.get("host")
  // Next dev may normalize request.url to localhost while retaining the
  // browser-facing nova.localhost Host. Never trust arbitrary forwarded hosts.
  const allowedOrigins = new Set([url.origin])
  if (host && /^[a-zA-Z0-9.:[\]-]+$/.test(host)) {
    try {
      const publicUrl = new URL(`${url.protocol}//${host}`)
      if (publicUrl.host === host.toLowerCase()) allowedOrigins.add(publicUrl.origin)
      if (host.toLowerCase() === "nova.supercodeai.tech") allowedOrigins.add("https://nova.supercodeai.tech")
    } catch { /* Invalid Host must not create an allowed origin. */ }
  }
  if (!origin || !allowedOrigins.has(origin) || (site && site !== "same-origin")) {
    throw new CodexError("Same-origin request required", 403)
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new CodexError("JSON request required", 415)
  }
}
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("poll"), attemptId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("cancel"), attemptId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
])

export async function parseCodexAction(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new CodexError("Invalid Codex request", 400)
  let text = ""
  const decoder = new TextDecoder()
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > 1024) throw new CodexError("Codex request too large", 413)
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    const result = actionSchema.safeParse(JSON.parse(text))
    if (!result.success) throw new Error()
    return result.data
  } catch (error) {
    if (error instanceof CodexError) throw error
    throw new CodexError("Invalid Codex request", 400)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
