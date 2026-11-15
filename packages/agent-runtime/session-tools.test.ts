import { expect, test } from "bun:test"
import { createSessionTools } from "./session-tools"
import type { AgentTransport } from "./types"

test("parallel session graphs keep child receipts distinct and serialize write-capable children", async () => {
  const saved = new Map<string, unknown>()
  const starts: string[] = []
  let active = 0
  let maximum = 0
  const transport: AgentTransport = async function* (input) {
    const name = String(input.messages.find((message) => message.role === "user")?.content)
    if (name === "write") expect(active).toBe(0)
    active++
    maximum = Math.max(maximum, active)
    starts.push(name)
    await Promise.resolve()
    active--
    yield { type: "text", content: name }
    yield { type: "finish", reason: "stop" }
  }
  const tools = createSessionTools({
    transport, tools: () => [], mode: "agent",
    saveState: async (key, value) => { saved.set(key, value) },
  })
  const task = tools.find((tool) => tool.schema.function.name === "task")!
  const result = await task.execute({
    parallel: true,
    items: ["a", "b", "c", "write", "d", "e", "f", "g"].map((name) => ({ task: name, agent: name === "write" ? "general" : "explore" })),
  }, { callId: "parent" }) as { results: Array<{ summary: string }> }
  expect(maximum).toBe(3)
  expect(starts).toEqual(["a", "b", "c", "write", "d", "e", "f", "g"])
  expect(result.results.map((child) => child.summary)).toEqual(starts)
  expect([...saved.keys()].sort()).toEqual(Array.from({ length: 8 }, (_, index) => `child-${index + 1}`))
})

test("the child budget is checked before starting another graph", async () => {
  let calls = 0
  const transport: AgentTransport = async function* () {
    calls++
    yield { type: "text", content: "done" }
  }
  const tools = createSessionTools({ transport, tools: () => [], mode: "agent" })
  const delegate = tools.find((tool) => tool.schema.function.name === "delegate")!
  const task = tools.find((tool) => tool.schema.function.name === "task")!
  await delegate.execute({ task: "first" }, { callId: "first" })
  await expect(task.execute({ parallel: true, items: Array.from({ length: 8 }, () => ({ task: "later" })) }, { callId: "batch" })).rejects.toThrow("child budget")
  expect(calls).toBe(1)
})

test("truncated child output is not a successful loop completion", async () => {
  let saved = false
  const transport: AgentTransport = async function* () {
    yield { type: "text", content: "partial answer" }
    yield { type: "finish", reason: "length" }
  }
  const tools = createSessionTools({
    transport, tools: () => [], mode: "agent",
    saveState: async () => { saved = true },
  })
  await expect(tools.find((tool) => tool.schema.function.name === "delegate")!
    .execute({ task: "investigate" }, { callId: "child" })).rejects.toThrow("before completing (length)")
  expect(saved).toBe(false)
})

test("parent cancellation reaches active child loops and prevents queued children", async () => {
  const controller = new AbortController()
  let ready!: () => void
  const started = new Promise<void>((resolve) => { ready = resolve })
  let calls = 0
  let stopped = 0
  const transport: AgentTransport = async function* (input) {
    calls++
    if (calls === 3) ready()
    await new Promise<void>((resolve) => input.signal!.addEventListener("abort", () => { stopped++; resolve() }, { once: true }))
    input.signal!.throwIfAborted()
    yield { type: "text", content: "not reached" }
  }
  const tools = createSessionTools({ transport, tools: () => [], mode: "agent" })
  const task = tools.find((tool) => tool.schema.function.name === "task")!
  const result = task.execute({ parallel: true, items: Array.from({ length: 8 }, () => ({ task: "read" })) }, { callId: "batch", signal: controller.signal })
  await started
  controller.abort(new Error("cancelled graph"))
  await expect(result).rejects.toThrow("cancelled graph")
  expect(calls).toBe(3)
  expect(stopped).toBe(3)
})
