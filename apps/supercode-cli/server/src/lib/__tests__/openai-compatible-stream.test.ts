import { describe, expect, it } from "bun:test"
import {
  emitFromNonStreamingMessage,
  extractDeltaContent,
  extractDeltaReasoning,
  mergeKnownTools,
  serializeChatContent,
  streamOpenAICompatibleChat,
  writeFinish,
  type StreamReader,
} from "../openai-compatible-stream"

class FakeRes {
  events: string[] = []
  ended = false
  write(chunk: string): boolean {
    this.events.push(chunk)
    return true
  }
  end(): void {
    this.ended = true
  }
}

function readerFrom(chunks: string[]): StreamReader {
  let i = 0
  const encoder = new TextEncoder()
  return {
    read: async () =>
      i < chunks.length
        ? { done: false, value: encoder.encode(chunks[i++]) }
        : { done: true, value: undefined },
  }
}

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

async function runStream(chunks: string[]) {
  const res = new FakeRes()
  const result = await streamOpenAICompatibleChat({ res: res as never, reader: readerFrom(chunks) })
  const events = res.events.map((e) => JSON.parse(e))
  return { result, events }
}

describe("mergeKnownTools", () => {
  it("includes built-in tool names plus extras", () => {
    const set = mergeKnownTools(["my_mcp_tool", "", "read_file"])
    expect(set.has("run_command")).toBe(true)
    expect(set.has("my_mcp_tool")).toBe(true)
    expect(set.has("read_file")).toBe(true)
  })

  it("handles null/undefined extras", () => {
    expect(mergeKnownTools(null).has("web_search")).toBe(true)
    expect(mergeKnownTools(undefined).has("web_search")).toBe(true)
  })
})

describe("extractDeltaContent / extractDeltaReasoning", () => {
  it("extracts scalar content", () => {
    expect(extractDeltaContent({ content: "hi" })).toBe("hi")
    expect(extractDeltaContent({ content: 5 })).toBe("5")
    expect(extractDeltaContent(null)).toBe("")
    expect(extractDeltaContent({})).toBe("")
  })

  it("flattens AI-SDK content part arrays", () => {
    const delta = { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }
    expect(extractDeltaContent(delta)).toBe("ab")
  })

  it("reads reasoning from reasoning_content and reasoning", () => {
    expect(extractDeltaReasoning({ reasoning_content: "r1" })).toBe("r1")
    expect(extractDeltaReasoning({ reasoning: "r2" })).toBe("r2")
  })

  it("reads Ox Alpha reasoning_details array", () => {
    const delta = {
      reasoning_details: [{ text: "thinking" }, { summary: " more" }, { text: "" }],
    }
    expect(extractDeltaReasoning(delta)).toBe("thinking more")
  })

  it("prefers direct reasoning before details", () => {
    const delta = { reasoning_content: "direct", reasoning_details: [{ text: "detail" }] }
    expect(extractDeltaReasoning(delta)).toBe("directdetail")
  })

  it("serializeChatContent flattens content for upstream APIs", () => {
    expect(serializeChatContent("plain")).toBe("plain")
    expect(serializeChatContent([{ type: "text", text: "x" }, "y"])).toBe("xy")
    expect(serializeChatContent(null)).toBe("")
  })
})

describe("streamOpenAICompatibleChat — content and events", () => {
  it("stops line processing in the current read batch at [DONE] but keeps reading the stream", async () => {
    // [DONE] only cuts off the current read() batch's remaining lines. The
    // next read() starts a fresh buffer, and trailing bytes are drained at
    // EOF, so events that arrive in later chunks ARE processed.
    const batch = "data: [DONE]\n\n" + sse({ choices: [{ delta: { content: "after done" } }] })
    const { result, events } = await runStream([
      sse({ choices: [{ delta: { content: "Hel" } }] }),
      sse({ choices: [{ delta: { content: "lo" } }] }),
      batch,
      sse({ choices: [{ delta: { content: "next batch" } }] }),
    ])
    expect(result.fullContent).toBe("Hellonext batch")
    expect(events.some((e) => e.type === "text" && e.content.includes("after done"))).toBe(false)
  })

  it("handles a partial data: line split across reads", async () => {
    const payload = sse({ choices: [{ delta: { content: "split here" } }] })
    const mid = Math.floor(payload.length / 2)
    const { result } = await runStream([payload.slice(0, mid), payload.slice(mid)])
    expect(result.fullContent).toBe("split here")
  })

  it("surfaces reasoning events and falls back to text when no visible content", async () => {
    const { result, events } = await runStream([
      sse({ choices: [{ delta: { reasoning_content: "thinking hard" } }] }),
      sse({ choices: [{ delta: { reasoning_details: [{ text: " and more" }] } }] }),
    ])
    expect(result.reasoningContent).toBe("thinking hard and more")
    // Empty-visible response: reasoning is emitted as text, never an error.
    expect(result.fullContent).toBe(result.reasoningContent)
    expect(events.some((e) => e.type === "error")).toBe(false)
    expect(events.filter((e) => e.type === "text").pop()?.content).toBe(result.reasoningContent)
  })

  it("emits the empty-response error when nothing came back", async () => {
    const { result, events } = await runStream([sse({ choices: [{}] })])
    expect(result.fullContent).toBe("")
    expect(events).toEqual([
      {
        type: "error",
        message: "Model returned an empty response. Try again or switch models with /model.",
      },
    ])
  })

  it("skips blank, non-data, and malformed lines", async () => {
    const { result, events } = await runStream([
      "event: message\n",
      "data: not-json\n\n",
      "\n",
      sse({ choices: [{ delta: { content: "ok" } }] }),
    ])
    expect(result.fullContent).toBe("ok")
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("text")
  })

  it("writes an error event for upstream stream errors and keeps going", async () => {
    const { result, events } = await runStream([
      sse({ error: { message: "billing failed" } }),
      sse({ choices: [{ delta: { content: "still works" } }] }),
    ])
    expect(events.map((e) => e.type)).toEqual(["error", "text"])
    expect(events[0].message).toBe("billing failed")
    expect(result.fullContent).toBe("still works")
  })

  it("handles string errors in choices[0].error", async () => {
    const { events } = await runStream([sse({ choices: [{ error: "boom" }] })])
    expect(events[0]).toEqual({ type: "error", message: "boom" })
  })

  it("records usage from the final chunk", async () => {
    const { result } = await runStream([
      sse({ choices: [{ delta: { content: "x" } }], usage: { prompt_tokens: 11, completion_tokens: 7 } }),
    ])
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 })
  })

  it("writes an Upstream failure error when the reader throws", async () => {
    const res = new FakeRes()
    const reader: StreamReader = {
      read: async () => {
        throw new Error("socket closed")
      },
    }
    const result = await streamOpenAICompatibleChat({ res: res as never, reader })
    expect(result.fullContent).toBe("")
    expect(JSON.parse(res.events[0]!)).toEqual({
      type: "error",
      message: "Upstream failure: socket closed",
    })
  })
})

describe("streamOpenAICompatibleChat — structured tool calls", () => {
  it("assembles streaming tool_calls split across reads (regression: premature flush)", async () => {
    const { result, events } = await runStream([
      sse({
        choices: [
          {
            delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "run_command", arguments: "" } }] },
            finish_reason: null,
          },
        ],
      }),
      sse({
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "{\"co" } }] }, finish_reason: null }],
      }),
      sse({
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { arguments: "mmand\":\"git status\"}" } }] }, finish_reason: "tool_calls" },
        ],
      }),
    ])
    expect(result.emittedToolCalls).toBe(true)
    const calls = events.filter((e) => e.type === "tool-call")
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      type: "tool-call",
      toolName: "run_command",
      args: { command: "git status" },
      toolCallId: "call_1",
    })
    expect(events.some((e) => e.type === "error")).toBe(false)
  })

  it("flushes pending tool calls at EOF without finish_reason", async () => {
    const { result, events } = await runStream([
      sse({
        choices: [
          { delta: { tool_calls: [{ index: 0, id: "call_2", function: { name: "web_search", arguments: "{\"query\":\"x\"}" } }] }, finish_reason: null },
        ],
      }),
    ])
    expect(result.emittedToolCalls).toBe(true)
    expect(events.filter((e) => e.type === "tool-call")).toHaveLength(1)
  })

  it("dedupes identical tool calls", async () => {
    const call = {
      index: 0,
      id: "call_3",
      function: { name: "run_command", arguments: "{\"command\":\"ls\"}" },
    }
    const { events } = await runStream([
      sse({ choices: [{ delta: { tool_calls: [call] }, finish_reason: "tool_calls" }] }),
      sse({ choices: [{ delta: { content: "[TOOL_CALL]\nrun_command --command=\"ls\"\n[/TOOL_CALL]" } }] }),
    ])
    expect(events.filter((e) => e.type === "tool-call")).toHaveLength(1)
  })

  it("skips malformed pending args", async () => {
    const { result, events } = await runStream([
      sse({
        choices: [
          { delta: { tool_calls: [{ index: 0, id: "call_4", function: { name: "run_command", arguments: "not json" } }] }, finish_reason: "tool_calls" },
        ],
      }),
    ])
    expect(result.emittedToolCalls).toBe(false)
    expect(events.some((e) => e.type === "tool-call")).toBe(false)
  })
})

describe("streamOpenAICompatibleChat — embedded minimax tool calls", () => {
  it("recovers square-bracket tool calls from content", async () => {
    const { result, events } = await runStream([
      sse({ choices: [{ delta: { content: 'I\'ll check.[TOOL_CALL]\nrun_command --command="git diff"\n[/TOOL_CALL]' } }] }),
    ])
    expect(result.fullContent).toBe("I'll check.")
    const calls = events.filter((e) => e.type === "tool-call")
    expect(calls).toHaveLength(1)
    expect(calls[0].toolName).toBe("run_command")
    expect(calls[0].args).toEqual({ command: "git diff" })
  })

  it("accepts request-scoped tool names via knownTools", async () => {
    const res = new FakeRes()
    const chunks = [
      sse({
        choices: [
          { delta: { content: '{"name":"my_mcp_tool","parameters":{"server":"math"}}' } },
        ],
      }),
    ]
    const result = await streamOpenAICompatibleChat({
      res: res as never,
      reader: readerFrom(chunks),
      knownTools: new Set(["my_mcp_tool"]),
    })
    const calls = res.events.map((e) => JSON.parse(e)).filter((e) => e.type === "tool-call")
    expect(calls).toHaveLength(1)
    expect(calls[0].toolName).toBe("my_mcp_tool")
    expect(calls[0].args).toEqual({ server: "math" })
    expect(result.emittedToolCalls).toBe(true)
  })
})

describe("emitFromNonStreamingMessage", () => {
  it("emits content and structured tool calls", () => {
    const res = new FakeRes()
    const out = emitFromNonStreamingMessage(res as never, {
      content: "Doing it.",
      tool_calls: [
        { id: "c1", function: { name: "write_file", arguments: '{"path":"/a","content":"b"}' } },
        { id: "c2", function: { name: "read_file", arguments: {} } },
      ],
    } as never)
    const events = res.events.map((e) => JSON.parse(e))
    expect(out.fullContent).toBe("Doing it.")
    expect(out.emittedToolCalls).toBe(true)
    expect(events).toHaveLength(3)
    expect(events[1].toolName).toBe("write_file")
    expect(events[1].args).toEqual({ path: "/a", content: "b" })
  })

  it("uses the reasoning fallback when there is no content", () => {
    const res = new FakeRes()
    const out = emitFromNonStreamingMessage(res as never, { reasoning_content: "" }, "fallback text")
    expect(out.fullContent).toBe("fallback text")
  })

  it("reports tool-only messages without content", () => {
    const res = new FakeRes()
    const out = emitFromNonStreamingMessage(res as never, {
      tool_calls: [{ function: { name: "code_exec", arguments: '{"code":"1+1"}' } }],
    } as never)
    expect(out.fullContent).toBe("")
    expect(out.emittedToolCalls).toBe(true)
  })
})

describe("writeFinish", () => {
  it("writes finish with tool_calls reason when calls were emitted", () => {
    const res = new FakeRes()
    writeFinish(res as never, { emittedToolCalls: true, inputTokens: 3, outputTokens: 4 })
    const evt = JSON.parse(res.events[0]!)
    expect(evt.type).toBe("finish")
    expect(evt.reason).toBe("tool_calls")
    expect(evt.usage.totalTokens).toBe(7)
    expect(evt.usage.outputTokens).toBe(4)
    expect(evt.usage.inputTokens).toBe(3)
    expect(res.ended).toBe(true)
  })

  it("writes finish with stop reason when no calls were emitted", () => {
    const res = new FakeRes()
    writeFinish(res as never, { emittedToolCalls: false, inputTokens: 0, outputTokens: 0 })
    expect(JSON.parse(res.events[0]!).reason).toBe("stop")
  })
})
