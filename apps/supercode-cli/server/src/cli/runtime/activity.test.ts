import { expect, test } from "bun:test"
import { runProviderStreamTurn } from "./provider-bridge"
import { createEventBus, type TurnEvent } from "./event-bus"
import { delegateActivityCallbacks } from "src/agents/tools/delegate"
import { TOOL_CATEGORY_FIXTURES } from "src/cli/utils/tool-category-fixtures"
import { ToolTranscript } from "src/cli/utils/tool-presentation"
import type { AIProvider } from "src/cli/ai/provider"

test("proxy forwards every category and keeps status heartbeats out of analysis", async () => {
  const bus = createEventBus()
  const events: TurnEvent[] = []
  bus.subscribe((event) => events.push(event))
  const abort = new AbortController()
  const provider: AIProvider = {
    name: "fixture", modelName: "fixture", connectionType: "proxy",
    sendMessage: async (_messages, onChunk, _tools, onToolCall, _signal, onReasoning, onToolResult) => {
      onReasoning?.("[status] connecting")
      for (const [toolName] of TOOL_CATEGORY_FIXTURES) {
        const params = { toolName, id: toolName, args: { path: "fixture" } }
        onToolCall?.(params)
        onToolResult?.({ ...params, result: JSON.stringify({ success: true }) })
      }
      onChunk?.("Fixture answer.")
      abort.abort()
      return { content: "Fixture answer.", finishReason: "stop", usage: {} as Awaited<ReturnType<AIProvider["sendMessage"]>>["usage"] }
    },
  }
  const result = await runProviderStreamTurn({ provider, messages: [], bus, signal: abort.signal })
  expect(events.filter((e) => e.type === "reasoning")).toEqual([])
  expect(events).toContainEqual({ type: "status", message: "connecting" })
  const tools = events.filter((e) => e.type === "tool_start" || e.type === "tool_end")
  expect(tools).toHaveLength(TOOL_CATEGORY_FIXTURES.length * 2)
  expect(tools.map((e) => e.type)).toEqual(TOOL_CATEGORY_FIXTURES.flatMap(() => ["tool_start", "tool_end"]))
  expect(result.finishReason).toBe("cancelled")
  expect(events.at(-1)).toMatchObject({ type: "finish", finishReason: "cancelled" })
})

test("delegated calls with identical SDK IDs retain separate results", () => {
  const transcript = new ToolTranscript()
  const rt = {
    onToolCall: (p: { toolName: string; args?: unknown; id?: string }) => { transcript.start(p.toolName, p.args, p.id) },
    onToolResult: (p: { toolName: string; args?: unknown; id?: string; result?: unknown }) => { transcript.finish(p.toolName, p.args, p.result, p.id) },
  }
  const a = delegateActivityCallbacks(rt)
  const b = delegateActivityCallbacks(rt)
  const call = { toolName: "read_file", args: { path: "fixture" }, id: "same" }
  a.onToolCall(call)
  b.onToolCall(call)
  b.onToolResult({ ...call, result: "B" })
  a.onToolResult({ ...call, result: "A" })
  expect(transcript.calls.map((c) => c.output)).toEqual(["A", "B"])
  expect(new Set(transcript.calls.map((c) => c.id)).size).toBe(2)
})
