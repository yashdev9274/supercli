import { expect, test } from "bun:test"
import { tool } from "ai"
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test"
import { z } from "zod"
import { runAgent } from "../agents/lib/harness"
import { getAgent } from "../agents"

const usage = { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } }

for (const fails of [false, true]) {
  test(`harness emits each result immediately, including thrown errors (${fails})`, async () => {
    const events: string[] = []
    let release!: () => void
    const fastEnded = new Promise<void>((resolve) => { release = resolve })
    const model = new MockLanguageModelV3({
      doStream: async () => ({ stream: convertArrayToReadableStream([
        { type: "tool-call", toolCallId: "slow", toolName: "read_file", input: '{"path":"slow"}' },
        { type: "tool-call", toolCallId: "fast", toolName: "read_file", input: '{"path":"fast"}' },
        { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
      ] as any) }),
    })
    await runAgent(getAgent("explore")!, {
      model, budget: 1, prompt: "Inspect fixtures", system: "Inspect only.",
      tools: {
        read_file: tool({ inputSchema: z.object({ path: z.string() }), execute: async ({ path }) => {
          if (path === "slow") await fastEnded
          events.push(`execute:${path}`)
          if (path === "fast" && fails) throw new Error("fixture failure")
          return { success: true, data: { content: path } }
        } }),
      },
      onToolCall: ({ id }) => { events.push(`start:${id}`) },
      onToolResult: ({ id, result }) => {
        events.push(`end:${id}`)
        if (id === "fast") {
          if (fails) expect(result).toMatchObject({ success: false, error: "fixture failure" })
          release()
        }
      },
    })
    expect(events.filter((e) => e.startsWith("end:"))).toEqual(["end:fast", "end:slow"])
    expect(events.indexOf("end:fast")).toBeLessThan(events.indexOf("execute:slow"))
  })
}
test("harness retains history after empty results and emits start before execution", async () => {
  let step = 0
  const events: string[] = []
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      step++
      if (step === 2) {
        const prompt = JSON.stringify(options.prompt)
        expect(prompt).toContain("Inspect the fixture")
        expect(prompt).toContain("fixture-call")
        expect(prompt).toContain("SYSTEM NOTICE")
      }
      const parts: any[] = step === 1 ? [
        { type: "tool-call", toolCallId: "fixture-call", toolName: "read_file", input: '{"path":"fixture"}' },
      ] : [
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: "The fixture is empty." },
        { type: "text-end", id: "answer" },
      ]
      return { stream: convertArrayToReadableStream([
        ...parts,
        { type: "finish", finishReason: { unified: step === 1 ? "tool-calls" : "stop", raw: undefined }, usage },
      ]) }
    },
  })
  const result = await runAgent(getAgent("explore")!, {
    model,
    prompt: "Inspect the fixture",
    system: "Inspect only.",
    tools: {
      read_file: tool({
        inputSchema: z.object({ path: z.string() }),
        execute: async () => {
          events.push("execute")
          return JSON.stringify({ success: true, data: { content: "" } })
        },
      }),
    },
    onToolCall: () => { events.push("start") },
    onToolResult: () => { events.push("end") },
  })
  expect(result.error).toBeUndefined()
  expect(result.text).toBe("The fixture is empty.")
  expect(events).toEqual(["start", "execute", "end"])
  expect(result.tokens).toEqual({ input: 10, output: 6 })
  expect(result.filesChanged).toEqual([])
})
