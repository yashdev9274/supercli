import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export function hashWebhookToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function createWebhookCredential(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashWebhookToken(token) }
}

export function verifyWebhookToken(authorization: string | null, hash: string | null): boolean {
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
  if (!token || !hash || !/^[a-f0-9]{64}$/.test(hash)) return false
  return timingSafeEqual(Buffer.from(hashWebhookToken(token), "hex"), Buffer.from(hash, "hex"))
}

export async function readBoundedBody(request: Request, maxBytes = 32_768): Promise<string> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw Object.assign(new Error("Payload too large"), { statusCode: 413 })
  const reader = request.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel()
        throw Object.assign(new Error("Payload too large"), { statusCode: 413 })
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks).toString("utf8")
}
