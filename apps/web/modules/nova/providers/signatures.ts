import { createHmac, timingSafeEqual } from "node:crypto"

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function verifySlackSignature(input: {
  rawBody: string
  signature: string | null
  timestamp: string | null
  secret: string
  now?: number
}): boolean {
  if (!input.signature || !input.timestamp || !/^\d+$/.test(input.timestamp)) return false
  const timestampMs = Number(input.timestamp) * 1000
  if (!Number.isSafeInteger(timestampMs)) return false
  if (Math.abs((input.now ?? Date.now()) - timestampMs) > MAX_WEBHOOK_AGE_MS) return false
  const expected = `v0=${createHmac("sha256", input.secret)
    .update(`v0:${input.timestamp}:${input.rawBody}`)
    .digest("hex")}`
  return safeEqual(expected, input.signature)
}

export function verifyGitHubSignature(input: {
  rawBody: string
  signature: string | null
  secret: string
}): boolean {
  if (!input.signature?.startsWith("sha256=")) return false
  const expected = `sha256=${createHmac("sha256", input.secret).update(input.rawBody).digest("hex")}`
  return safeEqual(expected, input.signature)
}

export function verifyLinearSignature(input: {
  rawBody: string
  signature: string | null
  timestamp: string | null
  secret: string
  now?: number
}): boolean {
  if (!input.signature) return false
  if (input.timestamp) {
    if (!/^\d+$/.test(input.timestamp)) return false
    const timestampMs = Number(input.timestamp)
    if (!Number.isSafeInteger(timestampMs)) return false
    if (Math.abs((input.now ?? Date.now()) - timestampMs) > MAX_WEBHOOK_AGE_MS) return false
  }
  const expected = createHmac("sha256", input.secret).update(input.rawBody).digest("hex")
  return safeEqual(expected, input.signature)
}
