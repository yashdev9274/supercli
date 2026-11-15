import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MockLanguageModelV3 } from "ai/test"
import { agentService } from "src/agents/service"
import type { Agent, GenerateOptions, GenerateResult } from "src/agents/lib/types"
import { getCurrentAgent, setCurrentAgent } from "src/agents/lib/approval"
import { delegateTool, setDelegateRuntime, taskTool } from "src/agents/tools/delegate"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

const model = new MockLanguageModelV3()
let originalAgents: Agent[]
let originalParent: string | undefined
let originalRoot: string | undefined
let root: string

beforeEach(async () => {
  originalAgents = [agentService.get("explore")!, agentService.get("general")!]
  originalParent = getCurrentAgent()
  originalRoot = process.env.SUPERCODE_WORKSPACE_ROOT
  root = await mkdtemp(join(tmpdir(), "cli-task-graph-"))
  process.env.SUPERCODE_WORKSPACE_ROOT = root
  setCurrentAgent("build")
  setDelegateRuntime({ model, allTools: { read_file: {}, write_file: {}, task: {}, delegate: {} }, onChunk: undefined, onToolCall: undefined, onToolResult: undefined, onReasoning: undefined })
})

afterEach(async () => {
  for (const agent of originalAgents) agentService.register(agent)
  setCurrentAgent(originalParent)
  setDelegateRuntime({ model: null, allTools: {}, onChunk: undefined, onToolCall: undefined, onToolResult: undefined, onReasoning: undefined })
  if (originalRoot === undefined) delete process.env.SUPERCODE_WORKSPACE_ROOT
  else process.env.SUPERCODE_WORKSPACE_ROOT = originalRoot
  await rm(root, { recursive: true, force: true })
})

function registerChildren(generate: (options: GenerateOptions) => Promise<GenerateResult>) {
  for (const original of originalAgents) agentService.register({ ...original, generate })
}

test("default sequential task runs all eight children in order without overlap or truncation", async () => {
  let active = 0
  let peak = 0
  const started: string[] = []
  registerChildren(async ({ prompt }) => {
    started.push(prompt!)
    peak = Math.max(peak, ++active)
    await Promise.resolve()
    active--
    return { text: prompt! }
  })
  const items = Array.from({ length: 8 }, (_, index) => ({ task: String(index) }))
  const result = JSON.parse(await taskTool.execute({ items }) as string)
  expect(started).toEqual(items.map((item) => item.task))
  expect(peak).toBe(1)
  expect(result.results.map((child: { index: number }) => child.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  expect(result.success).toBe(true)
  expect(result.parallel).toBe(false)
})

test("parallel explore children use three rolling workers and retain input result order", async () => {
  const gates = Array.from({ length: 8 }, deferred)
  const fourthStarted = deferred()
  const started: number[] = []
  let active = 0
  let peak = 0
  registerChildren(async ({ prompt }) => {
    const index = Number(prompt)
    started.push(index)
    peak = Math.max(peak, ++active)
    if (index === 3) fourthStarted.resolve()
    await gates[index]!.promise
    active--
    return { text: prompt! }
  })
  const run = taskTool.execute({ items: gates.map((_, index) => ({ task: String(index) })), parallel: true })
  expect(started).toEqual([0, 1, 2])
  gates[1]!.resolve()
  await fourthStarted.promise
  expect(started).toEqual([0, 1, 2, 3])
  expect(active).toBe(3)
  for (const gate of gates) gate.resolve()
  const result = JSON.parse(await run as string)
  expect(result.success).toBe(true)
  expect(peak).toBe(3)
  expect(result.results.map((child: { summary: string }) => child.summary)).toEqual(gates.map((_, index) => String(index)))
})

test("general children are exclusive barriers even with a read-only requested tool list", async () => {
  const gates = Array.from({ length: 6 }, deferred)
  const began = Array.from({ length: 6 }, deferred)
  const started: number[] = []
  const active = new Set<number>()
  registerChildren(async ({ prompt }) => {
    const index = Number(prompt)
    if (index === 2 || index === 5) expect(active.size).toBe(0)
    else expect([...active].some((item) => item === 2 || item === 5)).toBe(false)
    active.add(index)
    started.push(index)
    began[index]!.resolve()
    await gates[index]!.promise
    active.delete(index)
    return { text: prompt! }
  })
  const run = taskTool.execute({
    parallel: true,
    items: gates.map((_, index) => ({ task: String(index), agent: index === 2 || index === 5 ? "general" as const : "explore" as const, tools: ["read_file"] })),
  })
  expect(started).toEqual([0, 1])
  gates[0]!.resolve()
  gates[1]!.resolve()
  await began[2]!.promise
  expect(started).toEqual([0, 1, 2])
  gates[2]!.resolve()
  await began[4]!.promise
  expect(started).toEqual([0, 1, 2, 3, 4])
  gates[3]!.resolve()
  gates[4]!.resolve()
  await began[5]!.promise
  gates[5]!.resolve()
  const result = JSON.parse(await run as string)
  expect(result.success).toBe(true)
  expect(result.results).toHaveLength(6)
  expect(started).toEqual([0, 1, 2, 3, 4, 5])
})

test("task rejects more than eight children before starting any child", () => {
  let started = false
  registerChildren(async () => { started = true; return { text: "unexpected" } })
  expect(() => taskTool.execute({ items: Array.from({ length: 9 }, () => ({ task: "inspect" })) })).toThrow()
  expect(started).toBe(false)
})

test("task snapshots parent and runtime, strips recursive tools and namespaces child activity", async () => {
  const replacement = new MockLanguageModelV3()
  const ids: string[] = []
  let starts = 0
  setDelegateRuntime({ onToolCall: ({ id }) => ids.push(id!) })
  registerChildren(async (options) => {
    expect(options.parentAgent).toBe("build")
    expect(options.model).toBe(model)
    expect(options.tools).toHaveProperty("read_file")
    expect(options.tools).not.toHaveProperty("task")
    expect(options.tools).not.toHaveProperty("delegate")
    if (starts === 1) expect(options.tools).toHaveProperty("write_file")
    options.onToolCall?.({ id: "shared", toolName: "read_file" })
    starts++
    setCurrentAgent("explore")
    setDelegateRuntime({ model: replacement, allTools: {}, onToolCall: () => { throw new Error("runtime leaked") } })
    return { text: "inspected" }
  })
  const result = JSON.parse(await taskTool.execute({ items: [
    { task: "first", tools: ["read_file", "task", "delegate"] },
    { task: "second", agent: "general" },
  ] }) as string)
  expect(result.success).toBe(true)
  expect(starts).toBe(2)
  expect(ids).toHaveLength(2)
  expect(new Set(ids).size).toBe(2)
})

test("task cancellation reaches active children, drains them and starts no queued child", async () => {
  const controller = new AbortController()
  const started: string[] = []
  const ended: string[] = []
  registerChildren(async ({ prompt, signal }) => {
    started.push(prompt!)
    await new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve(), { once: true }))
    ended.push(prompt!)
    return { text: "", error: "cancelled" }
  })
  const run = taskTool.execute({ parallel: true, items: Array.from({ length: 8 }, (_, index) => ({ task: String(index) })) }, { signal: controller.signal }).catch((error) => error)
  expect(started).toEqual(["0", "1", "2"])
  controller.abort()
  expect(await run).toBe(controller.signal.reason)
  expect(ended).toEqual(started)
})

test("task retains child result errors and thrown failures without dropping later children", async () => {
  registerChildren(async ({ prompt }) => {
    if (prompt === "result") return { text: "partial", error: "result failed" }
    if (prompt === "throw") throw new Error("child threw")
    return { text: "inspected" }
  })
  const result = JSON.parse(await taskTool.execute({ parallel: true, items: [{ task: "result" }, { task: "throw" }, { task: "ok" }, { task: "later" }] }) as string)
  expect(result.success).toBe(false)
  expect(result.results.map((child: { success: boolean }) => child.success)).toEqual([false, false, true, true])
  expect(result.results[0].error).toBe("result failed")
  expect(result.results[1].error).toBe("child threw")
})

test("a child AbortError cancels and drains siblings rather than becoming a result error", async () => {
  const fail = deferred()
  const ended: string[] = []
  const started: string[] = []
  const failure = new DOMException("child cancelled", "AbortError")
  registerChildren(async ({ prompt, signal }) => {
    started.push(prompt!)
    if (prompt === "0") {
      await fail.promise
      throw failure
    }
    await new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve(), { once: true }))
    ended.push(prompt!)
    return { text: "cancelled" }
  })
  const run = taskTool.execute({ parallel: true, items: Array.from({ length: 8 }, (_, index) => ({ task: String(index) })) }).catch((error) => error)
  expect(started).toEqual(["0", "1", "2"])
  fail.resolve()
  expect(await run).toBe(failure)
  expect(ended).toEqual(["1", "2"])
  expect(started).toEqual(["0", "1", "2"])
})

test("single delegate propagates cancellation and excludes recursive capabilities", async () => {
  const controller = new AbortController()
  let received: AbortSignal | undefined
  registerChildren(async ({ tools, signal, parentAgent }) => {
    received = signal
    expect(parentAgent).toBe("build")
    expect(tools).toHaveProperty("read_file")
    expect(tools).not.toHaveProperty("task")
    expect(tools).not.toHaveProperty("delegate")
    await new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve(), { once: true }))
    throw signal!.reason
  })
  const run = delegateTool.execute({ task: "inspect", agent: "general", tools: ["read_file", "task", "delegate"] }, { signal: controller.signal }).catch((error) => error)
  expect(received).toBe(controller.signal)
  controller.abort()
  expect(await run).toBe(controller.signal.reason)
})

for (const fixture of [
  { result: { text: "Partial investigation", finishReason: "tool-calls" }, error: "tool-step budget" },
  { result: { text: "Partial answer", finishReason: "length" }, error: "output limit" },
  { result: { text: "  ", finishReason: "stop" }, error: "empty summary" },
  { result: { text: "Partial answer", finishReason: "error" }, error: "ended with error" },
  { result: { text: "Partial answer", error: "explicit failure" }, error: "explicit failure" },
]) {
  test(`delegate and task report incomplete children without losing partial summaries (${fixture.error})`, async () => {
    registerChildren(async () => fixture.result)
    const delegated = JSON.parse(await delegateTool.execute({ task: "inspect" }) as string)
    const tasked = JSON.parse(await taskTool.execute({ items: [{ task: "inspect" }] }) as string)
    for (const result of [delegated, tasked.results[0]]) {
      expect(result.success).toBe(false)
      expect(result.error).toContain(fixture.error)
      expect(result.summary).toBe(fixture.result.text)
    }
    expect(tasked.success).toBe(false)
  })
}
