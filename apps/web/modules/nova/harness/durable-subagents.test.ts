import { expect, test } from "bun:test"
import { streamHarnessAgent, type HarnessAgentEvent } from "./agent"
import type { BridgeInput } from "./bridge"
import { createBridgeFixture } from "./bridge-fixture.test-helper"
import type { DurableChatTransport } from "./client"
import { createDurableJournal, type JournalStore, type Receipt } from "./durable"
import { multiplexEvents } from "./event-stream"
import { createNovaSessionTools } from "./session-tools"
import { persistSubagentActivity, type SubagentActivityTransaction } from "./subagent-activity"
import { subagentEventSchema, type SubagentEvent } from "./subagent-events"

function memoryStore() {
  const rows = new Map<string, Receipt>()
  const store: JournalStore = {
    async reserve(key, hash) {
      if (!rows.has(key)) rows.set(key, { id: key, hash, status: "pending", result: null })
      return { ...rows.get(key)! }
    },
    async claim(id) {
      const row = rows.get(id)!
      if (row.status !== "pending") return false
      row.status = "executing"
      return true
    },
    async finish(id, result) { Object.assign(rows.get(id)!, { status: "completed", result }) },
    async wait() { throw new Error("Unexpected interaction") },
  }
  return { store, rows }
}

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

async function fixture(run: (input: BridgeInput) => Promise<void>) {
  const bridge = createBridgeFixture()
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      return await bridge(request, await request.json()) ?? new Response(null, { status: 404 })
    },
  })
  const previous = process.env.SUPERCODE_TERMINAL_API_URL
  process.env.SUPERCODE_TERMINAL_API_URL = `http://127.0.0.1:${server.port}`
  try {
    await run({
      token: "fixture", provider: "fixture", model: "fixture", mode: "agent", messages: [], tools: [],
      journal: createDurableJournal(memoryStore().store),
      execute: async () => { throw new Error("No host tools should execute") },
    })
  } finally {
    if (previous === undefined) delete process.env.SUPERCODE_TERMINAL_API_URL
    else process.env.SUPERCODE_TERMINAL_API_URL = previous
    await server.stop(true)
  }
}

test("forks isolate concurrent receipts and replay without retrying uncertain parent tools", async () => {
  const { store, rows } = memoryStore()
  const journal = createDurableJournal(store)
  await Promise.all(["a", "b"].map((key) => journal.fork(key).inference({ key }, async () => ({ events: [{ type: "text", content: key }] }))))
  expect(rows.size).toBe(2)
  const replay = createDurableJournal(store)
  expect(await replay.fork("a").inference({ key: "a" }, async () => { throw new Error("Must replay") })).toEqual({ events: [{ type: "text", content: "a" }] })
  await expect(journal.tool("task", { items: [{ task: "read" }] }, false, false, async () => { throw new Error("lost") })).rejects.toThrow("lost")
  await expect(createDurableJournal(store).tool("task", { items: [{ task: "read" }] }, false, false, async () => { throw new Error("Must not retry") })).rejects.toThrow("uncertain")
})

test("main journal enables explore and denies all general children before any execution", async () => {
  const input = { journal: createDurableJournal(memoryStore().store) } as BridgeInput
  const events: SubagentEvent[] = []
  let transports = 0
  const session = createNovaSessionTools(input, {
    onSubagentEvent: async (event) => { events.push(event) },
    childTransport: async () => { transports++; throw new Error("Must not execute") },
  })
  expect(session.tools.map((tool) => tool.function.name)).toEqual(["todowrite", "skill", "question", "delegate", "task"])
  await expect(session.execute("task", { parallel: true, items: [{ task: "read" }, { task: "write", agent: "general" }] })).rejects.toThrow("read-only explore")
  expect(events).toEqual([])
  expect(transports).toBe(0)
})

test("stateful parent without an independent factory never offers delegation", async () => {
  const chatTransport: DurableChatTransport = async function* () { yield { type: "finish" } }
  const input = { chatTransport, journal: createDurableJournal(memoryStore().store) } as BridgeInput
  const session = createNovaSessionTools(input)
  expect(session.tools.map((tool) => tool.function.name)).not.toContain("task")
  await expect(session.execute("delegate", { task: "read" })).rejects.toThrow("Independent child inference")
})

test("main agent streams actual child lifecycle while its durable task handoff is pending", async () => {
  await fixture(async (input) => {
    const release = gate()
    const events: HarnessAgentEvent[] = []
    let parentCalls = 0
    let childCalls = 0
    let ended = false
    const chatTransport: DurableChatTransport = async function* () {
      if (parentCalls++ === 0) {
        yield { type: "tool-call", toolName: "task", toolCallId: "children", args: { items: [{ task: "Read the source" }], parallel: true } }
        yield { type: "finish", reason: "tool_calls" }
      } else {
        yield { type: "text", content: "Parent summary" }
        yield { type: "finish", reason: "stop" }
      }
    }
    const stream = streamHarnessAgent({
      ...input, mode: "agent", skipConnectedTools: true, chatTransport,
      messages: [{ role: "user", content: "Investigate with a child" }],
      childTransport: async () => async function* () {
        childCalls++
        await release.promise
        yield { type: "reasoning", content: "PRIVATE_REASONING" }
        yield { type: "text", content: "Source findings" }
        yield { type: "finish", reason: "stop" }
      },
    })
    let working = false
    try {
      for await (const event of stream) {
        events.push(event)
        if (event.type === "subagent" && event.status === "working") {
          working = true
          expect(ended).toBe(false)
          expect(parentCalls).toBe(1)
          release.resolve()
        }
      }
      ended = true
      expect(working).toBe(true)
      expect(childCalls).toBe(1)
      const children = events.filter((event): event is SubagentEvent => event.type === "subagent")
      expect(children.map((event) => event.status)).toEqual(["queued", "working", "done"])
      expect(children.at(-1)?.message).toBe("Source findings")
      expect(children.every((event) => subagentEventSchema.safeParse(event).success)).toBe(true)
      expect(JSON.stringify(events)).not.toContain("PRIVATE_REASONING")
    } finally {
      release.resolve()
      await stream.return(undefined)
    }
  })
}, 15_000)

test("completed parent receipt replay emits no duplicate child lifecycle and preserves next child index", async () => {
  await fixture(async (input) => {
    const { store } = memoryStore()
    const firstJournal = createDurableJournal(store)
    const events: SubagentEvent[] = []
    const adapters = {
      onSubagentEvent: async (event: SubagentEvent) => { events.push(event) },
      childTransport: async () => async function* () { yield { type: "text" as const, content: "done" }; yield { type: "finish" as const, reason: "stop" } },
    }
    const first = createNovaSessionTools({ ...input, journal: firstJournal }, adapters)
    const args = { task: "first" }
    await firstJournal.tool("delegate", args, false, false, () => first.execute("delegate", args))
    expect(events.map((event) => event.index)).toEqual([1, 1, 1])
    events.length = 0
    const replayJournal = createDurableJournal(store)
    const replay = createNovaSessionTools({ ...input, journal: replayJournal }, adapters)
    await replayJournal.tool("delegate", args, false, false, () => replay.execute("delegate", args))
    expect(events).toEqual([])
    await replayJournal.tool("delegate", { task: "second" }, false, false, () => replay.execute("delegate", { task: "second" }))
    expect(events.map((event) => event.index)).toEqual([2, 2, 2])
    expect(new Set(events.map((event) => event.childId)).size).toBe(1)
  })
})

test("child failure cancels queued siblings and publishes bounded messages without error dumps", async () => {
  await fixture(async (input) => {
    const events: SubagentEvent[] = []
    const session = createNovaSessionTools(input, {
      onSubagentEvent: async (event) => { events.push(event) },
      childTransport: async () => { throw new Error("PRIVATE_PROVIDER_DUMP") },
    })
    await expect(session.execute("task", { items: [{ task: "first" }, { task: "second" }] })).rejects.toThrow("PRIVATE_PROVIDER_DUMP")
    expect(events.filter((event) => event.status === "failed").map((event) => event.index)).toEqual([1])
    expect(events.filter((event) => event.status === "cancelled").map((event) => event.index)).toEqual([2])
    expect(JSON.stringify(events)).not.toContain("PRIVATE_PROVIDER_DUMP")
  })
})

test("a factory cannot return the stateful parent continuation as a child", async () => {
  await fixture(async (input) => {
    let calls = 0
    const parent: DurableChatTransport = async function* () { calls++; yield { type: "finish" } }
    const session = createNovaSessionTools({ ...input, chatTransport: parent }, { childTransport: async () => parent })
    await expect(session.execute("delegate", { task: "read" })).rejects.toThrow("independent of its parent")
    expect(calls).toBe(0)
  })
})

test("durable explore workers roll at three, exclude writers, and publish tool names without payloads", async () => {
  await fixture(async (input) => {
    const release = Array.from({ length: 4 }, gate)
    const started = Array.from({ length: 4 }, gate)
    const events: SubagentEvent[] = []
    let active = 0
    let maximum = 0
    let transports = 0
    let reads = 0
    input.tools = ["read_source", "write_source"].map((name) => ({
      type: "function", access: name === "read_source" ? "read" : "write",
      function: { name, description: name, parameters: { type: "object", properties: { secret: { type: "string" } }, required: ["secret"] } },
    }))
    input.execute = async (name) => { expect(name).toBe("read_source"); reads++; return { body: "PRIVATE_TOOL_RESULT" } }
    const session = createNovaSessionTools(input, {
      onSubagentEvent: async (event) => { events.push(event) },
      childTransport: async () => {
        const index = transports++
        let round = 0
        return async function* (request) {
          expect(request.tools?.map((tool) => tool.function.name)).toEqual(["read_source"])
          if (round++ < 6) {
            if (round === 1) {
              active++
              maximum = Math.max(maximum, active)
              started[index]!.resolve()
              await release[index]!.promise
              active--
            }
            yield { type: "tool-call", toolName: "read_source", toolCallId: "read-a", args: { secret: `PRIVATE_TOOL_ARGS_${round}` } }
            yield { type: "tool-call", toolName: "read_source", toolCallId: "read-b", args: { secret: `PRIVATE_TOOL_ARGS_OTHER_${round}` } }
            yield { type: "finish", reason: "tool_calls" }
          } else {
            yield { type: "text", content: "Verified source finding" }
            yield { type: "finish", reason: "stop" }
          }
        }
      },
    })
    const task = session.execute("task", { parallel: true, items: Array.from({ length: 4 }, () => ({ task: "read", budget: 10 })) })
    try {
      await Promise.all(started.slice(0, 3).map((item) => item.promise))
      expect(maximum).toBe(3)
      release[1]!.resolve()
      await started[3]!.promise
      expect(active).toBe(3)
      for (const item of release) item.resolve()
      await task
      expect(reads).toBe(48)
      expect(events.some((event) => event.message === "Using read_source")).toBe(true)
      expect(events.some((event) => event.message === "read_source completed")).toBe(true)
      expect(JSON.stringify(events)).not.toContain("PRIVATE_TOOL")
      for (let index = 1; index <= 4; index++) {
        const childEvents = events.filter((event) => event.index === index)
        const activities = childEvents.filter((event) => event.message === "Using read_source" || event.message === "read_source completed")
        expect(activities).toHaveLength(8)
        expect(activities.every((event, offset) => offset === 0 || event.message !== activities[offset - 1]?.message)).toBe(true)
        expect(childEvents.at(-1)?.status).toBe("done")
        expect(childEvents.at(-1)?.message).toBe("Verified source finding")
        expect(childEvents).toHaveLength(11)
      }
    } finally {
      for (const item of release) item.resolve()
      await task.catch(() => undefined)
    }
  })
}, 15_000)

test("real child cancellation closes active and queued lifecycles", async () => {
  await fixture(async (input) => {
    const cancellation = new AbortController()
    const started = gate()
    const events: SubagentEvent[] = []
    const session = createNovaSessionTools(input, {
      onSubagentEvent: async (event) => { events.push(event) },
      childTransport: async () => async function* (request) {
        started.resolve()
        await new Promise<void>((resolve) => { request.signal!.addEventListener("abort", () => resolve(), { once: true }) })
        request.signal!.throwIfAborted()
        yield { type: "finish" }
      },
    })
    const task = session.execute("task", { items: [{ task: "active" }, { task: "queued" }] }, cancellation.signal)
    await started.promise
    cancellation.abort()
    await expect(task).rejects.toThrow()
    expect(events.filter((event) => event.status === "cancelled").map((event) => event.index)).toEqual([1, 2])
    expect(events.some((event) => event.status === "done")).toBe(false)
  })
})

test("child transport preparation receives graph cancellation", async () => {
  await fixture(async (input) => {
    const cancellation = new AbortController()
    const started = gate()
    const session = createNovaSessionTools(input, {
      childTransport: async (signal) => {
        expect(signal).toBeDefined()
        started.resolve()
        await new Promise<void>((resolve) => { signal!.addEventListener("abort", () => resolve(), { once: true }) })
        signal!.throwIfAborted()
        throw new Error("Must not complete transport preparation")
      },
    })
    const task = session.execute("delegate", { task: "read" }, cancellation.signal)
    await started.promise
    cancellation.abort()
    await expect(task).rejects.toThrow()
  })
})

test("multiplexer cancels producers and drains child cancellation before propagating failure", async () => {
  const cancellation = new AbortController()
  const stream = multiplexEvents<string>(async function* (emit, signal) {
    await emit("working")
    await new Promise<void>((resolve) => { signal.addEventListener("abort", () => resolve(), { once: true }) })
    await emit("cancelled")
    throw new Error("cancelled source")
  }, cancellation.signal)
  expect(await stream.next()).toEqual({ done: false, value: "working" })
  cancellation.abort()
  expect(await stream.next()).toEqual({ done: false, value: "cancelled" })
  await expect(stream.next()).rejects.toThrow("cancelled source")
  let stopped = false
  const early = multiplexEvents<string>(async function* (_, signal) {
    try {
      yield "first"
      await new Promise<void>((resolve) => { signal.addEventListener("abort", () => resolve(), { once: true }) })
    } finally { stopped = true }
  })
  await early.next()
  await early.return(undefined)
  expect(stopped).toBe(true)
})

test("child lifecycle persistence binds session, surface, run and sequence in one transaction", async () => {
  let nextSequence = 10
  let transactions = 0
  const rows: Array<Awaited<ReturnType<SubagentActivityTransaction["agentActivity"]["create"]>>> = []
  const scope = { sessionId: "session-a", surfaceId: "web-a", runId: "run-a" }
  const transaction = async <T>(run: (tx: SubagentActivityTransaction) => Promise<T>): Promise<T> => {
    transactions++
    let sequence = nextSequence
    const result = await run({
      agentSession: {
        async update(input) {
          expect(input.where.id).toBe(scope.sessionId)
          sequence += input.data.nextSequence.increment
          return { nextSequence: sequence }
        },
      },
      agentActivity: {
        async create({ data }) {
          expect(data.agentSessionId).toBe(scope.sessionId)
          expect(data.surfaceId).toBe(scope.surfaceId)
          expect(data.runId).toBe(scope.runId)
          const row = { ...data, id: `event-${rows.length}`, createdAt: new Date() }
          rows.push(row)
          return row
        },
      },
    })
    nextSequence = sequence
    return result
  }
  for (const status of ["queued", "working", "failed", "cancelled"] as const) {
    const event: SubagentEvent = {
      type: "subagent", childId: "child-a", index: 1, title: "Read", prompt: "Read source",
      agent: "explore", provider: "fixture", model: "fixture", status, timestamp: new Date().toISOString(),
    }
    const activity = await persistSubagentActivity(transaction, scope, event)
    expect(activity.sessionId).toBe(scope.sessionId)
    expect(activity.type).toBe("subagent")
    expect(JSON.parse(activity.body!)).toEqual(event)
  }
  expect(transactions).toBe(4)
  expect(rows.map((row) => row.sequence)).toEqual([10, 11, 12, 13])
  await expect(persistSubagentActivity(transaction, scope, { type: "subagent" } as SubagentEvent)).rejects.toThrow()
  expect(transactions).toBe(4)
})
