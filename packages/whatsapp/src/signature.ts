import { createHmac, timingSafeEqual } from "node:crypto"

export function verifyWebhookSignature(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const expectedBuffer = Buffer.from(expected, "utf8")
  const signatureBuffer = Buffer.from(signature, "utf8")

  return (
    expectedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedBuffer, signatureBuffer)
  )
}
