import { z } from "zod"

import { BrowserError } from "./contracts"

export function assertBrowserOrigin(request: Request): void {
  const origin = request.headers.get("origin")
  const site = request.headers.get("sec-fetch-site")
  const url = new URL(request.url)
  const allowed = new Set([url.origin])
  const host = request.headers.get("host")
  // Match the existing Nova custom-host dev setup, without forwarded headers.
  if (host && /^[a-zA-Z0-9.:[\]-]+$/.test(host)) {
    try { allowed.add(new URL(`${url.protocol}//${host}`).origin) } catch { /* Ignore invalid hosts. */ }
  }
  if (!origin || !allowed.has(origin) || (site && site !== "same-origin")) throw new BrowserError("Same-origin request required", 403)
}

export async function parseBrowserControl(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new BrowserError("JSON request required", 415)
  const reader = request.body?.getReader()
  if (!reader) throw new BrowserError("Invalid browser request", 400)
  try {
    let text = ""
    const decoder = new TextDecoder()
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 256) throw new BrowserError("Browser request too large", 413)
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    const result = z.object({ control: z.enum(["user", "agent"]) }).strict().safeParse(JSON.parse(text))
    if (!result.success) throw new Error()
    return result.data.control
  } catch (error) {
    if (error instanceof BrowserError) throw error
    throw new BrowserError("Invalid browser request", 400)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export function browserErrorResponse(error: unknown): Response {
  return Response.json({ error: error instanceof BrowserError ? error.message : "Browser unavailable; check server configuration and database setup" }, {
    status: error instanceof BrowserError ? error.status : 503,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  })
}
