import { expect, test } from "bun:test"
import { streamOriginalHarness, type BridgeInput } from "./bridge"
import { createDurableJournal, InteractionPending, type Receipt } from "./durable"

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function handoff(id: string, name = "read", kind = "tool") {
  return { type: "handoff", id, hash: `hash-${id}`, kind, payload: { toolName: name, args: { id } } }
}

async function fixture(run: (context: {
  send: (event: unknown) => void
  close: () => void
  replies: Record<string, unknown>[]
  input: BridgeInput
  rejectReplies: () => void
}) => Promise<void>) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const ready = gate()
  let reject = false
  const replies: Record<string, unknown>[] = []
  const send = (event: unknown) => controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`))
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname.endsWith("/turn")) {
        return new Response(new ReadableStream<Uint8Array>({
          start(stream) {
            controller = stream
            send({ type: "bridge", version: "nova-cli-harness/1", runId: "run" })
            ready.resolve()
          },
        }), { headers: { "Content-Type": "application/x-ndjson" } })
      }
      replies.push(await request.json() as Record<string, unknown>)
      return Response.json({}, { status: reject ? 409 : 200 })
    },
  })
  const previous = process.env.SUPERCODE_TERMINAL_API_URL
  process.env.SUPERCODE_TERMINAL_API_URL = `http://127.0.0.1:${server.port}`
  const input: BridgeInput = {
    token: "test", messages: [], provider: "test", model: "test", mode: "agent",
    tools: ["read", "write", "execute", "state", "approval", "question"].map((name) => ({
      type: "function", access: ["write", "execute", "state"].includes(name) ? name as "write" | "execute" | "state" : "read",
      function: { name, description: name, parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    })),
    execute: async () => ({ success: true }),
  }
  try {
    await run({
      send: (event) => { void ready.promise.then(() => send(event)) },
      close: () => { void ready.promise.then(() => controller.close()).catch(() => {}) },
      replies, input, rejectReplies: () => { reject = true },
    })
  } finally {
    if (previous === undefined) delete process.env.SUPERCODE_TERMINAL_API_URL
    else process.env.SUPERCODE_TERMINAL_API_URL = previous
    await server.stop(true)
  }
}

async function collect(input: BridgeInput) {
  const events = []
  for await (const event of streamOriginalHarness(input)) events.push(event)
  return events
}

test("separately streamed read handoffs overlap and finish waits for replies", async () => {
  await fixture(async ({ input, send, close, replies }) => {
    const second = gate()
    input.execute = async (_, args) => {
      if (args.id === "1") {
        send(handoff("2"))
        await second.promise
      } else second.resolve()
      return args.id
    }
    const result = collect(input)
    send(handoff("1"))
    await second.promise
    send({ type: "finish" })
    close()
    expect(await result).toEqual([{ type: "finish" }])
    expect(replies.map((reply) => reply.id).sort()).toEqual(["1", "2"])
    expect(replies.every((reply) => reply.hash === `hash-${reply.id}`)).toBe(true)
  })
})

test("read concurrency is bounded at four and EOF drains pending replies", async () => {
  await fixture(async ({ input, send, close, replies }) => {
    const four = gate()
    const release = gate()
    let active = 0
    let maximum = 0
    input.execute = async () => {
      active++
      maximum = Math.max(maximum, active)
      if (active === 4) four.resolve()
      await release.promise
      active--
      return true
    }
    const result = collect(input)
    for (let i = 0; i < 9; i++) send(handoff(String(i)))
    close()
    await four.promise
    expect(maximum).toBe(4)
    release.resolve()
    await expect(result).rejects.toThrow("without a terminal outcome")
    expect(maximum).toBe(4)
    expect(replies).toHaveLength(9)
  })
})

for (const barrier of ["write", "execute", "state", "approval", "question", "unknown", "inference"]) {
  test(`${barrier} is a barrier between read groups`, async () => {
    await fixture(async ({ input, send, close }) => {
      const order: string[] = []
      const reads = gate()
      const release = gate()
      input.approvalTools = ["approval"]
      input.execute = async (name, args) => {
        order.push(`start:${args.id}`)
        if (args.id === "first") {
          reads.resolve()
          await release.promise
        }
        order.push(`end:${args.id}`)
        return name
      }
      input.chatTransport = async function* () {
        order.push("inference")
        yield { type: "finish" }
      }
      const result = collect(input)
      send(handoff("first"))
      if (barrier === "inference") send({ ...handoff("barrier", "", "inference"), payload: { messages: [], tools: [] } })
      else send(handoff("barrier", barrier))
      send(handoff("last"))
      send({ type: "finish" })
      close()
      await reads.promise
      expect(order).toEqual(["start:first"])
      release.resolve()
      await result
      expect(order.indexOf("start:last")).toBeGreaterThan(order.indexOf("end:first"))
      if (barrier === "inference") expect(order.indexOf("inference")).toBeLessThan(order.indexOf("start:last"))
      else if (barrier !== "unknown") {
        expect(order.indexOf("start:barrier")).toBeGreaterThan(order.indexOf("end:first"))
        expect(order.indexOf("end:barrier")).toBeLessThan(order.indexOf("start:last"))
      }
    })
  })
}

test("denials and tool errors preserve handoff identity without executing denied tools", async () => {
  await fixture(async ({ input, send, close, replies }) => {
    input.mode = "chat"
    const calls: string[] = []
    input.execute = async (name) => { calls.push(name); throw new Error("read failed") }
    const result = collect(input)
    send(handoff("denied", "write"))
    send(handoff("missing", "unknown"))
    send(handoff("failed"))
    send({ type: "finish" })
    close()
    await result
    expect(calls).toEqual(["read"])
    expect(replies.find((reply) => reply.id === "denied")?.value).toMatchObject({ denied: true })
    expect(replies.find((reply) => reply.id === "missing")?.value).toMatchObject({ denied: true })
    expect(replies.find((reply) => reply.id === "failed")?.error).toBe("read failed")
  })
})

for (const failure of ["replay", "identity", "server", "reply", "cancel", "dispose"]) {
  test(`${failure} cancels in-flight reads safely`, async () => {
    await fixture(async ({ input, send, close, replies, rejectReplies }) => {
      const started = gate()
      const aborted = gate()
      const calls: unknown[] = []
      const cancellation = new AbortController()
      input.signal = cancellation.signal
      input.execute = async (_, args, signal) => {
        calls.push(args.id)
        if (args.id === "quick") return true
        started.resolve()
        await new Promise<void>((_, reject) => {
          signal!.addEventListener("abort", () => { aborted.resolve(); reject(new Error("aborted")) }, { once: true })
        })
      }
      const iterator = streamOriginalHarness(input)
      const next = iterator.next()
      send(handoff("slow"))
      await started.promise
      if (failure === "dispose") {
        send({ type: "status", message: "ready" })
        await next
        await iterator.return(undefined)
      } else {
        if (failure === "replay") send(handoff("slow"))
        if (failure === "identity") send({ ...handoff("bad"), hash: null })
        if (failure === "identity" || failure === "replay") send(handoff("must-not-run"))
        if (failure === "server") send({ type: "error", message: "server failed" })
        if (failure === "reply") { rejectReplies(); send(handoff("quick")) }
        if (failure === "cancel") cancellation.abort()
        await expect(next).rejects.toThrow()
      }
      await aborted.promise
      expect(replies.some((reply) => reply.id === "slow")).toBe(false)
      expect(calls).not.toContain("must-not-run")
      close()
    })
  })
}

test("journal receipts stay ordered, replay, and stop at approval", async () => {
  const rows = new Map<string, Receipt>()
  const order: string[] = []
  const journal = () => createDurableJournal({
    async reserve(key, hash, name) {
      const slot = Number(key.split(":")[1])
      if (slot > 0) expect(rows.get(`primary:${slot - 1}`)?.status).toBe("completed")
      order.push(name)
      if (!rows.has(key)) rows.set(key, { id: key, hash, status: "pending", result: null })
      return { ...rows.get(key)! }
    },
    async claim(id) { rows.get(id)!.status = "executing"; return true },
    async finish(id, result) { Object.assign(rows.get(id)!, { status: "completed", result }) },
    async wait(id) { rows.get(id)!.status = "awaiting_input" },
  })
  let calls = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    await fixture(async ({ input, send, close }) => {
      input.journal = journal()
      input.approvalTools = ["approval"]
      input.execute = async () => { calls++; return true }
      const result = collect(input)
      send(handoff("1"))
      send(handoff("2"))
      send(handoff("3", "approval"))
      send(handoff("4", "write"))
      close()
      await expect(result).rejects.toBeInstanceOf(InteractionPending)
    })
  }
  expect(calls).toBe(2)
  expect(order).toEqual(["read", "read", "approval", "read", "read", "approval"])
  expect([...rows.keys()]).toEqual(["primary:0", "primary:1", "primary:2"])
})
