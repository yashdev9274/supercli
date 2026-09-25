import { expect, test } from "bun:test"
import { tool } from "ai"
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test"
import { z } from "zod"
import { executeToolLoop } from "../tool-executor"

const usage = { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } }
test("BYOK executes once, retains call/result IDs and counts the final response usage", async () => {
  let calls = 0
  let steps = 0
  const controller = new AbortController()
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      steps++
      if (steps === 2) {
        const history = JSON.stringify(options.prompt)
        expect(history).toContain("call-1")
        expect(history).toContain("fixture evidence")
      }
      const parts: any[] = steps === 1 ? [
        { type: "tool-call", toolCallId: "call-1", toolName: "inspect", input: "{}" },
      ] : [
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "Verified fixture." },
        { type: "text-end", id: "text-1" },
      ]
      return { stream: convertArrayToReadableStream([
        ...parts,
        { type: "finish", finishReason: { unified: steps === 1 ? "tool-calls" : "stop", raw: undefined }, usage },
      ]) }
    },
  })
  const result = await executeToolLoop(model, [{ role: "user", content: "Inspect fixture" }], undefined, {
    inspect: tool({
      inputSchema: z.object({}),
      execute: async (_input, options) => {
        calls++
        expect(options.abortSignal).toBe(controller.signal)
        return JSON.stringify({ success: true, data: { content: "fixture evidence" } })
      },
    }),
  }, { signal: controller.signal })
  expect(calls).toBe(1)
  expect(steps).toBe(2)
  expect(result.content).toBe("Verified fixture.")
  expect((await result.usage).inputTokens).toBe(10)
})
