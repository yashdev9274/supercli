import { createHash } from "node:crypto"
import { isIP } from "node:net"
import { z } from "zod"

import { PublicReviewError } from "./public-review-errors"

const bodySchema = z.strictObject({ url: z.string().min(1).max(2048) })
const MAX_BODY_BYTES = 4096

export function publicReviewSubject(request: Request): string {
  const forwarded = process.env.VERCEL === "1" ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined
  const address = forwarded && isIP(forwarded) ? forwarded : "shared-unidentified-client"
  return createHash("sha256").update(`public-review:${address}`).digest("hex")
}

export function assertPublicReviewSameOrigin(request: Request): void {
  const url = new URL(request.url)
  const origin = request.headers.get("origin")
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") {
    throw new PublicReviewError("Start a public review from this website.", 403)
  }
  if (origin === url.origin) return
  if (!origin && process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return
  throw new PublicReviewError("Start a public review from this website.", 403)
}

export async function readPublicReviewBody(request: Request): Promise<{ url: string }> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json" || request.headers.has("content-encoding")) {
    throw new PublicReviewError("Send a JSON body containing a GitHub pull request URL.", 415)
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new PublicReviewError("The request body is too large.", 413)
  const reader = request.body?.getReader()
  if (!reader) throw new PublicReviewError("Enter a GitHub pull request URL.", 400)
  let timeout: ReturnType<typeof setTimeout> | undefined
  const read = async () => {
    const chunks: Uint8Array[] = []
    let bytes = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) throw new PublicReviewError("The request body is too large.", 413)
      chunks.push(value)
    }
    const data = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {
      data.set(chunk, offset)
      offset += chunk.length
    }
    const result = bodySchema.safeParse(JSON.parse(new TextDecoder().decode(data)))
    if (!result.success) throw new PublicReviewError("Send a JSON body containing only a GitHub pull request URL.", 400)
    return result.data
  }
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          void reader.cancel().catch(() => {})
          reject(new PublicReviewError("The request body timed out.", 408))
        }, 10_000)
      }),
    ])
  } catch (error) {
    await reader.cancel().catch(() => {})
    if (error instanceof PublicReviewError) throw error
    throw new PublicReviewError("Send a valid JSON body containing a GitHub pull request URL.", 400)
  } finally {
    if (timeout) clearTimeout(timeout)
    reader.releaseLock()
  }
}
