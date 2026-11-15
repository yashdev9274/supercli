import { expect, test } from "bun:test"
import { createBridgeFixture } from "./bridge-fixture.test-helper"
import type { BridgeInput } from "./bridge"
import type { DurableChatTransport } from "./client"
import { createNovaSessionTools } from "./session-tools"

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
      execute: async () => { throw new Error("No host tools should execute") },
    })
  } finally {
    if (previous === undefined) delete process.env.SUPERCODE_TERMINAL_API_URL
    else process.env.SUPERCODE_TERMINAL_API_URL = previous
    await server.stop(true)
  }
}

test("Nova graph refills read branches, joins before writers, and retains task order", async () => {
  await fixture(async (input) => {
    const release = Array.from({ length: 6 }, gate)
    const started = Array.from({ length: 6 }, gate)
    const ended = new Set<number>()
    const receipts = new Map<string, unknown>()
    let active = 0
    let maximum = 0
    let transports = 0
    input.chatTransport = async function* () { throw new Error("Parent transport must not be shared"); yield { type: "finish" } }
    const session = createNovaSessionTools(input, {
      saveState: async (key, value) => { receipts.set(key, value) },
      childTransport: async () => {
        transports++
        const transport: DurableChatTransport = async function* (request) {
          const index = Number(request.messages.find((message) => message.role === "user")?.content)
          if (index === 4) {
            expect(active).toBe(0)
            expect([...ended].sort()).toEqual([0, 1, 2, 3])
          }
          if (index === 5) expect(ended.has(4)).toBe(true)
          active++
          maximum = Math.max(maximum, active)
          started[index]!.resolve()
          await release[index]!.promise
          active--
          ended.add(index)
          yield { type: "text", content: `result-${index}` }
          yield { type: "finish", reason: "stop" }
        }
        return transport
      },
    })
    const result = session.execute("task", {
      parallel: true,
      items: Array.from({ length: 6 }, (_, index) => ({ task: String(index), agent: index === 4 ? "general" : "explore" })),
    })
    await Promise.all(started.slice(0, 3).map((item) => item.promise))
    expect(maximum).toBe(3)
    release[1]!.resolve()
    await started[3]!.promise
    expect(ended.has(0)).toBe(false)
    release[0]!.resolve()
    release[2]!.resolve()
    release[3]!.resolve()
    await started[4]!.promise
    release[4]!.resolve()
    await started[5]!.promise
    release[5]!.resolve()
    const outcome = await result as { parallel: boolean; results: Array<{ summary: string }> }
    expect(outcome.parallel).toBe(true)
    expect(outcome.results.map((child) => child.summary)).toEqual(Array.from({ length: 6 }, (_, index) => `result-${index}`))
    expect(maximum).toBe(3)
    expect(transports).toBe(6)
    expect(receipts.size).toBe(6)
  })
})

test("Nova sequential graphs run all eight children and reject exhausted budgets before work", async () => {
  await fixture(async (input) => {
    let active = 0
    let calls = 0
    const session = createNovaSessionTools(input, {
      childTransport: async () => async function* () {
        expect(active++).toBe(0)
        calls++
        await Promise.resolve()
        active--
        yield { type: "text", content: "done" }
        yield { type: "finish", reason: "stop" }
      },
    })
    const result = await session.execute("task", { parallel: false, items: Array.from({ length: 8 }, () => ({ task: "read" })) }) as { results: unknown[]; parallel: boolean }
    expect(result.results).toHaveLength(8)
    expect(result.parallel).toBe(false)
    await expect(session.execute("task", { items: [{ task: "must not run" }] })).rejects.toThrow("child budget")
    expect(calls).toBe(8)
  })
})

test("Nova rejects truncated child output instead of reporting graph success", async () => {
  await fixture(async (input) => {
    let saved = false
    const session = createNovaSessionTools(input, {
      saveState: async () => { saved = true },
      childTransport: async () => async function* () {
        yield { type: "text", content: "partial work" }
        yield { type: "finish", reason: "length" }
      },
    })
    await expect(session.execute("delegate", { task: "investigate" })).rejects.toThrow("before completing (length)")
    expect(saved).toBe(false)
  })
})

test("durable sessions do not acquire delegation capabilities", () => {
  const input = { journal: {} } as BridgeInput
  expect(createNovaSessionTools(input).tools.map((tool) => tool.function.name)).toEqual(["todowrite", "skill", "question"])
})
