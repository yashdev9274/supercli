import { expect, test } from "bun:test"
import { executeToolBatch, READ_TOOL_CONCURRENCY } from "../tool-batch"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test("read workers stay bounded and commit in call order before a write barrier", async () => {
  const count = READ_TOOL_CONCURRENCY + 2
  const gates = Array.from({ length: count }, deferred)
  const started: number[] = []
  const committed: number[] = []
  const nextStarted = deferred()
  let active = 0
  let peak = 0
  let wrote = false
  const calls = [
    ...gates.map((_, id) => ({ toolName: "read_file", id })),
    { toolName: "write_file", id: count },
  ]
  const run = executeToolBatch(calls, async (call) => {
    if (call.toolName === "write_file") {
      expect(active).toBe(0)
      expect(committed).toEqual(gates.map((_, id) => id))
      wrote = true
      return call.id
    }
    started.push(call.id)
    active++
    peak = Math.max(peak, active)
    if (call.id === READ_TOOL_CONCURRENCY) nextStarted.resolve()
    await gates[call.id]!.promise
    active--
    return call.id
  }, (_call, result) => { committed.push(result) })
  expect(started).toEqual(Array.from({ length: READ_TOOL_CONCURRENCY }, (_, id) => id))
  expect(wrote).toBe(false)
  gates[1]!.resolve()
  await nextStarted.promise
  expect(started).toHaveLength(READ_TOOL_CONCURRENCY + 1)
  expect(committed).toEqual([])
  expect(wrote).toBe(false)
  for (const gate of gates) gate.resolve()
  await run
  expect(peak).toBe(READ_TOOL_CONCURRENCY)
  expect(committed).toEqual(calls.map((call) => call.id))
  expect(wrote).toBe(true)
})

test("unknown, state, write and execute tools are ordered barriers between reads", async () => {
  const barriers = ["custom_read", "todowrite", "question", "write_file", "edit_file", "run_command", "code_exec", "delegate"]
  let active = 0
  const committed: string[] = []
  const calls = barriers.flatMap((toolName, index) => [
    { toolName: "web_search", id: `read-${index}` },
    { toolName, id: `barrier-${index}` },
  ])
  await executeToolBatch(calls, async (call) => {
    expect(active).toBe(0)
    expect(committed).toEqual(calls.slice(0, calls.indexOf(call)).map((prior) => prior.id))
    active++
    await Promise.resolve()
    active--
    return call.id
  }, (_call, result) => { committed.push(result) })
  expect(committed).toEqual(calls.map((call) => call.id))
})

test("abort reaches active reads, drains them and prevents queued reads and barriers", async () => {
  const controller = new AbortController()
  const started: number[] = []
  const ended: number[] = []
  const committed: number[] = []
  const calls = Array.from({ length: READ_TOOL_CONCURRENCY + 2 }, (_, id) => ({ toolName: "read_file", id }))
  calls.push({ toolName: "write_file", id: calls.length })
  const run = executeToolBatch(calls, async (call) => {
    started.push(call.id)
    await new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve(), { once: true }))
    ended.push(call.id)
    return call.id
  }, (_call, result) => { committed.push(result) }, controller.signal).catch((error) => error)
  controller.abort()
  expect(await run).toBe(controller.signal.reason)
  expect(started).toHaveLength(READ_TOOL_CONCURRENCY)
  expect(ended).toEqual(started)
  expect(committed).toEqual([])
})

test("a failed worker drains siblings before rejecting and never starts a barrier", async () => {
  const sibling = deferred()
  const failed = deferred()
  const calls = [{ toolName: "read_file", id: 0 }, { toolName: "read_file", id: 1 }, { toolName: "write_file", id: 2 }]
  const started: number[] = []
  let settled = false
  const failure = new Error("fixture failure")
  const run = executeToolBatch(calls, async (call) => {
    started.push(call.id)
    if (call.id === 0) { failed.resolve(); throw failure }
    await sibling.promise
    return call.id
  }, () => {}).catch((error) => { settled = true; return error })
  await failed.promise
  expect(settled).toBe(false)
  sibling.resolve()
  expect(await run).toBe(failure)
  expect(started).not.toContain(2)
})
