import { expect, test } from "bun:test"
import type { Response } from "express"

import { serializeToolsForHttp, validateToolArgs } from "src/cli/ai/tools-util"
import { exaSearchTool } from "src/agents/tools/exa_search"
import { firecrawlSearchTool } from "src/agents/tools/firecrawl_search"

import { streamOpenAICompatibleChat } from "../openai-compatible-stream"

const sse = (delta: unknown, finish_reason: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`

async function readChunks(chunks: (string | Uint8Array)[]) {
  const events: any[] = []
  const callCountsBeforeRead: number[] = []
  let index = 0
  const result = await streamOpenAICompatibleChat({
    res: {
      write: (text: string) => {
        events.push(JSON.parse(text))
        return true
      },
    } as unknown as Response,
    reader: {
      read: async () => {
        callCountsBeforeRead.push(events.filter((event) => event.type === "tool-call").length)
        const chunk = chunks[index++]
        return chunk === undefined
          ? { done: true }
          : { done: false, value: typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk }
      },
    },
  })
  return { events, result, callCountsBeforeRead }
}

for (const finish of ["tool_calls", "eof"]) {
  test(`search arguments survive interleaved network chunks (${finish})`, async () => {
    const chunks = [
      sse({ tool_calls: [{ index: 0, id: "exa", function: { name: "exa_search", arguments: "" } }] }),
      sse({ tool_calls: [{ index: 1, id: "fc", function: { name: "firecrawl_search", arguments: "" } }] }),
      sse({ tool_calls: [{ index: 0, function: { arguments: '{"query":"gpt ' } }] }),
      sse({ tool_calls: [{ index: 1, function: { arguments: '{"query":"gpt 6 astra","includeDomains":[' } }] }),
      sse({ tool_calls: [{ index: 0, function: { arguments: '6 astra","maxResults":5}' } }] }),
      sse({ tool_calls: [{ index: 1, function: { arguments: '"example.com"]}' } }] }),
      ...(finish === "tool_calls" ? [sse({}, "tool_calls"), "data: [DONE]\n\n"] : []),
    ]
    const { events, callCountsBeforeRead } = await readChunks(chunks)
    expect(callCountsBeforeRead.slice(0, 7)).toEqual(Array(7).fill(0))
    const calls = events.filter((e) => e.type === "tool-call")
    expect(calls).toEqual([
      { type: "tool-call", toolName: "exa_search", toolCallId: "exa", args: { query: "gpt 6 astra", maxResults: 5 } },
      { type: "tool-call", toolName: "firecrawl_search", toolCallId: "fc", args: { query: "gpt 6 astra", includeDomains: ["example.com"] } },
    ])
    expect(validateToolArgs(exaSearchTool, calls[0].args).ok).toBe(true)
    expect(validateToolArgs(firecrawlSearchTool, calls[1].args).ok).toBe(true)
    const byteChunks = [...new TextEncoder().encode(chunks.join(""))].map((byte) => Uint8Array.of(byte))
    expect((await readChunks(byteChunks)).events.filter((e) => e.type === "tool-call")).toEqual(calls)
  })
}

test("unfinished arguments do not become an executable empty search", async () => {
  const { events } = await readChunks([
    sse({ tool_calls: [{ index: 0, id: "exa", function: { name: "exa_search", arguments: '{"query":' } }] }),
  ])
  expect(events.filter((e) => e.type === "tool-call")).toEqual([])
  expect(events.some((e) => e.type === "error" && e.message.includes("did not finish"))).toBe(true)
})

test("genuine zero-argument tools still flush at EOF", async () => {
  const { events } = await readChunks([
    sse({ tool_calls: [{ index: 0, id: "todo", function: { name: "todoread", arguments: "" } }] }),
  ])
  expect(events).toContainEqual({ type: "tool-call", toolName: "todoread", toolCallId: "todo", args: {} })
})

test("HTTP search schemas preserve required queries and reject absent queries", () => {
  const serialized = JSON.parse(JSON.stringify(serializeToolsForHttp({ exa_search: exaSearchTool, firecrawl_search: firecrawlSearchTool })))
  for (const [name, tool] of Object.entries({ exa_search: exaSearchTool, firecrawl_search: firecrawlSearchTool })) {
    expect(serialized[name].parameters.required).toContain("query")
    expect(serialized[name].parameters.properties.query.type).toBe("string")
    expect(validateToolArgs(tool, {}).ok).toBe(false)
    expect(validateToolArgs(tool, { query: "gpt 6 astra" })).toMatchObject({ ok: true, data: { query: "gpt 6 astra", maxResults: 10 } })
  }
})
