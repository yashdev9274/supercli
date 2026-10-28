import type { HarnessStreamEvent } from "../harness/client"
import { ResponsesAccumulator, type CompletedResponse } from "./responses"

const MAX_FRAME_CHARS = 1_048_576
const MAX_STREAM_BYTES = 16_777_216

/** Byte-stream contract only. No fetch or production adapter is provided.
 * Caller must set a deadline signal; cancellation also releases a pending read.
 */
export async function* readResponsesSSE(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<HarnessStreamEvent, CompletedResponse> {
  signal.throwIfAborted()
  const reader = stream.getReader()
  const accumulator = new ResponsesAccumulator()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let buffer = ""
  let data: string[] = []
  let frameSize = 0
  let bytes = 0
  const abort = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener("abort", abort, { once: true })
  try {
    while (true) {
      if (signal.aborted) throw new Error("cancelled")
      const chunk = await reader.read()
      if (signal.aborted) throw new Error("cancelled")
      bytes += chunk.value?.byteLength ?? 0
      if (bytes > MAX_STREAM_BYTES) throw new Error("size")
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      while (true) {
        const match = /[\r\n]/.exec(buffer)
        if (!match || (buffer[match.index] === "\r" && match.index === buffer.length - 1 && !chunk.done)) break
        const line = buffer.slice(0, match.index)
        const separator = buffer.startsWith("\r\n", match.index) ? 2 : 1
        buffer = buffer.slice(match.index + separator)
        frameSize += line.length + separator
        if (frameSize > MAX_FRAME_CHARS) throw new Error("size")
        if (line === "") {
          const payload = data.join("\n")
          data = []
          frameSize = 0
          if (!payload) continue
          if (payload === "[DONE]") return accumulator.completed()
          let parsed: unknown
          try { parsed = JSON.parse(payload) } catch { throw new Error("payload") }
          const events = accumulator.accept(parsed)
          for (const event of events) {
            if (signal.aborted) throw new Error("cancelled")
            yield event
            if (event.type === "error") throw new Error("provider failure")
          }
          if (events.some((event) => event.type === "finish")) return accumulator.completed()
        } else if (line === "data" || line.startsWith("data:")) {
          const value = line === "data" ? "" : line.slice(5).replace(/^ /, "")
          data.push(value)
        }
      }
      if (buffer.length + frameSize > MAX_FRAME_CHARS) throw new Error("size")
      if (chunk.done) {
        // SSE events require a blank-line terminator; EOF alone is not completion.
        return accumulator.completed()
      }
    }
  } catch {
    if (signal.aborted) throw new DOMException("ChatGPT stream cancelled", "AbortError")
    throw new Error("ChatGPT stream did not complete successfully")
  } finally {
    signal.removeEventListener("abort", abort)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
