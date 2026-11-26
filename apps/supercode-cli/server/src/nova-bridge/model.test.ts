import { expect, test } from "bun:test"

import { createBridgeModel } from "./model"

const options = {
  prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "What is Vercel?" }] }],
}

test("recovers a reasoning-only response once without allowing new tool execution", async () => {
  const requests: Record<string, unknown>[] = []
  const model = createBridgeModel(async (_, payload) => {
    requests.push(payload)
    return requests.length === 1
      ? [{ type: "reasoning", content: "Need provide a final answer." }, { type: "finish", reason: "stop" }]
      : [{ type: "text", content: "Vercel hosts web applications." }, { type: "finish", reason: "stop" }]
  })
  const result = await model.doStream(options)
  const reader = result.stream.getReader()
  let text = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value.type === "text-delta") text += value.delta
  }
  expect(requests).toHaveLength(2)
  expect(requests[1]?.tools).toEqual([])
  expect(text).toBe("Vercel hosts web applications.")
})

test("never retries an executed tool call or an explicit provider failure", async () => {
  for (const events of [
    [{ type: "tool-call", toolCallId: "call", toolName: "search", args: {} }, { type: "finish", reason: "tool_calls" }],
    [{ type: "error", message: "Provider unavailable" }],
  ]) {
    let requests = 0
    const model = createBridgeModel(async () => { requests++; return events })
    try { await model.doStream(options) } catch {}
    expect(requests).toBe(1)
  }
})

test("a second empty response fails instead of inventing success or retrying forever", async () => {
  let requests = 0
  const model = createBridgeModel(async () => { requests++; return [{ type: "finish", reason: "stop" }] })
  await expect(model.doStream(options)).rejects.toThrow("Harness returned an empty response")
  expect(requests).toBe(2)
})
