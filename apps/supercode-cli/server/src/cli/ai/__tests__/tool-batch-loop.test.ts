import { expect, test } from "bun:test"
import { tool } from "ai"
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test"
import { z } from "zod"
import { executeToolLoop } from "../tool-executor"

const usage = { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } }

test("compatibility loop overlaps reads, emits immediate results and retains transcript order across a write", async () => {
  let release!: () => void
  const fastEnded = new Promise<void>((resolve) => { release = resolve })
  const events: string[] = []
  const controller = new AbortController()
  const calls = [
    { toolName: "read_file", toolCallId: "slow", input: '{"path":"slow"}' },
    { toolName: "read_file", toolCallId: "fast", input: '{"path":"fast"}' },
    { toolName: "write_file", toolCallId: "write", input: '{"path":"write"}' },
    { toolName: "read_file", toolCallId: "after", input: '{"path":"after"}' },
  ]
  let steps = 0
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      steps++
      if (steps === 2) {
        const history = options.prompt.filter((message) => message.role === "tool")
        expect(history.flatMap((message) => message.content.flatMap((part) => part.type === "tool-result" ? [part.toolCallId] : []))).toEqual(calls.map((call) => call.toolCallId))
      }
      return { stream: convertArrayToReadableStream([
        ...(steps === 1 ? calls.map((call) => ({ type: "tool-call", ...call })) : [
          { type: "text-start", id: "answer" },
          { type: "text-delta", id: "answer", delta: "Verified fixtures." },
          { type: "text-end", id: "answer" },
        ]),
        { type: "finish", finishReason: { unified: steps === 1 ? "tool-calls" : "stop", raw: undefined }, usage },
      ] as any) }
    },
  })
  const definition = tool({
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }, options) => {
      expect(options.abortSignal).toBe(controller.signal)
      expect(options.toolCallId).toBe(path)
      events.push(`execute:${path}`)
      if (path === "slow") await fastEnded
      if (path === "write") {
        expect(events).toContain("end:slow")
        expect(events).toContain("end:fast")
        expect(events).not.toContain("execute:after")
        const results = options.messages.filter((message) => message.role === "tool")
        expect(results).toHaveLength(2)
      }
      return JSON.stringify({ success: true, data: { content: path } })
    },
  })
  const result = await executeToolLoop(model, [{ role: "user", content: "Inspect and update fixtures" }], undefined, {
    read_file: definition,
    write_file: definition,
  }, {
    signal: controller.signal,
    onToolResult: ({ id }) => {
      events.push(`end:${id}`)
      if (id === "fast") release()
    },
    onStepFinish: ({ toolResults }) => expect(toolResults.map((item) => (item.args as { path: string }).path)).toEqual(["slow", "fast", "write", "after"]),
  })
  expect(result.content).toBe("Verified fixtures.")
  expect(events.filter((event) => event.startsWith("end:"))).toEqual(["end:fast", "end:slow", "end:write", "end:after"])
})
