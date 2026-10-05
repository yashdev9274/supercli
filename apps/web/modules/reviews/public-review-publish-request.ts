import { z } from "zod"

import { PublicReviewError } from "./public-review-errors"

const schema = z.strictObject({
  url: z.string().min(1).max(2048),
  headSha: z.string().regex(/^[a-f\d]{40}$/i).transform((value) => value.toLowerCase()),
  reviewHash: z.string().regex(/^[a-f\d]{64}$/i).transform((value) => value.toLowerCase()),
})

export type PublicReviewPublishInput = z.infer<typeof schema>

export async function readPublicReviewPublishBody(request: Request, timeoutMs = 10_000): Promise<PublicReviewPublishInput> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json" || request.headers.has("content-encoding")) {
    throw new PublicReviewError("Send a JSON body containing the URL, head SHA, and review hash.", 415)
  }
  if (Number(request.headers.get("content-length") ?? 0) > 4096) throw new PublicReviewError("The request body is too large.", 413)
  const reader = request.body?.getReader()
  if (!reader) throw new PublicReviewError("Send the URL, head SHA, and review hash.", 400)
  let timeout: ReturnType<typeof setTimeout> | undefined
  const read = async () => {
    const chunks: Uint8Array[] = []
    let bytes = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 4096) throw new PublicReviewError("The request body is too large.", 413)
      chunks.push(value)
    }
    const data = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {
      data.set(chunk, offset)
      offset += chunk.length
    }
    const result = schema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)))
    if (!result.success) throw new PublicReviewError("Send only a URL, a 40-character head SHA, and a SHA-256 review hash.", 400)
    return result.data
  }
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          void reader.cancel().catch(() => {})
          reject(new PublicReviewError("The request body timed out.", 408))
        }, timeoutMs)
      }),
    ])
  } catch (error) {
    void reader.cancel().catch(() => {})
    if (error instanceof PublicReviewError) throw error
    throw new PublicReviewError("Send a valid JSON publish request.", 400)
  } finally {
    if (timeout) clearTimeout(timeout)
    reader.releaseLock()
  }
}
