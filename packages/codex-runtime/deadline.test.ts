import { expect, test } from "bun:test"
import { setTimeout as delay } from "node:timers/promises"
import { inferenceDeadline } from "./deadline"
import { readResponsesSSE } from "./sse"

test("active inference can continue past its initial idle window", async () => {
  const deadline = inferenceDeadline(undefined, { idleMs: 150, totalMs: 1500 })
  try {
    for (let pulse = 0; pulse < 8; pulse++) { await delay(30); deadline.activity(); expect(deadline.signal.aborted).toBe(false) }
  } finally { deadline.dispose() }
})

test("no provider activity aborts with a specific timeout instead of extending forever", async () => {
  const deadline = inferenceDeadline(undefined, { idleMs: 30, totalMs: 1000 })
  try {
    await delay(80)
    expect(deadline.signal.aborted).toBe(true)
    expect(deadline.signal.reason.name).toBe("TimeoutError")
    expect(deadline.signal.reason.message).toContain("stopped sending data")
  } finally { deadline.dispose() }
})

test("activity cannot extend the total response budget and disposal clears both timers", async () => {
  const deadline = inferenceDeadline(undefined, { idleMs: 1000, totalMs: 80 })
  try {
    for (let pulse = 0; pulse < 5; pulse++) { await delay(25); deadline.activity() }
    expect(deadline.signal.reason.message).toContain("response time budget")
  } finally { deadline.dispose() }
  const disposed = inferenceDeadline(undefined, { idleMs: 10, totalMs: 20 })
  disposed.dispose()
  await delay(50)
  expect(disposed.signal.aborted).toBe(false)
})

test("stream cancellation releases a pending body read and preserves the timeout cause", async () => {
  const abort = new AbortController()
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true } })
  const iterator = readResponsesSSE(stream, abort.signal)
  const next = iterator.next()
  const reason = new DOMException("Specific inference timeout", "TimeoutError")
  abort.abort(reason)
  await expect(next).rejects.toBe(reason)
  expect(cancelled).toBe(true)
})
