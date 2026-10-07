import { afterAll, beforeEach, expect, test } from "bun:test"

import { streamHarnessAgent, type HarnessAgentEvent } from "./agent"
import type { HarnessChatMessage, HarnessChatTool, HarnessStreamEvent } from "./client"
import type { ComposioTool } from "./composio-client"

const originalUrl = process.env.SUPERCODE_TERMINAL_API_URL
const tools: ComposioTool[] = [
  { name: "LINEAR_GET_WORKSPACE", displayName: "Get workspace", description: "Read workspace details", toolkit: "linear", parameters: { type: "object", properties: {} }, requiresApproval: false },
  { name: "LINEAR_LIST_TEAMS", displayName: "List teams", description: "Read teams", toolkit: "linear", parameters: { type: "object", properties: {} }, requiresApproval: false },
  { name: "LINEAR_UPDATE_ISSUE", displayName: "Update issue", description: "Change an issue", toolkit: "linear", parameters: { type: "object", properties: {} }, requiresApproval: true },
]

let catalog = tools
let catalogStatus = 200
let executionStatus = 200
let result: Record<string, unknown> = { successful: true, data: { workspace: { id: "workspace_1", name: "Connected Linear workspace" } } }
let responses: HarnessStreamEvent[][] = []
const chats: Array<{ messages: HarnessChatMessage[]; tools?: HarnessChatTool[] }> = []
const executions: Array<{ toolName: string; arguments: Record<string, unknown> }> = []
const authorizations: Array<string | null> = []

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    authorizations.push(request.headers.get("authorization"))
    const path = new URL(request.url).pathname
    const body = await request.json()
    if (path === "/api/composio/tools") return Response.json({ tools: catalog, error: "CLI tools unavailable" }, { status: catalogStatus })
    if (path === "/api/composio/execute") {
      executions.push(body as typeof executions[number])
      return Response.json(executionStatus === 200 ? result : { error: "Composio connection expired" }, { status: executionStatus })
    }
    if (path === "/api/ai/chat") {
      chats.push(body as typeof chats[number])
      const events = responses.shift() ?? [{ type: "error", message: "Unexpected extra model request" }]
      return new Response(events.map((event) => JSON.stringify(event)).join("\n") + "\n", {
        headers: { "Content-Type": "application/x-ndjson" },
      })
    }
    return Response.json({ error: "Unexpected endpoint" }, { status: 404 })
  },
})

beforeEach(() => {
  process.env.SUPERCODE_TERMINAL_API_URL = server.url.toString().replace(/\/$/, "")
  catalog = tools
  catalogStatus = 200
  executionStatus = 200
  result = { successful: true, data: { workspace: { id: "workspace_1", name: "Connected Linear workspace" } } }
  responses = []
  chats.length = 0
  executions.length = 0
  authorizations.length = 0
})

afterAll(() => {
  server.stop(true)
  if (originalUrl === undefined) delete process.env.SUPERCODE_TERMINAL_API_URL
  else process.env.SUPERCODE_TERMINAL_API_URL = originalUrl
})

async function collect(signal?: AbortSignal): Promise<HarnessAgentEvent[]> {
  const events: HarnessAgentEvent[] = []
  for await (const event of streamHarnessAgent({
    token: "authenticated-cli-account",
    provider: "supercode",
    model: "test-model",
    messages: [{ role: "system", content: "You are Nova" }, { role: "user", content: "Fetch my Linear workspace details" }],
    signal,
  })) events.push(event)
  return events
}

function call(name: string, id = "call_1", args: Record<string, unknown> = {}): HarnessStreamEvent {
  return { type: "tool-call", toolName: name, toolCallId: id, args }
}

test("fetches connected Linear data with the CLI token and feeds it back to the model", async () => {
  responses = [
    [call("LINEAR_GET_WORKSPACE"), { type: "finish", reason: "tool_calls" }],
    [{ type: "text", content: "Your Linear workspace is Connected Linear workspace." }, { type: "finish", reason: "stop" }],
  ]
  const events = await collect()
  expect(chats).toHaveLength(2)
  expect(chats[0]?.tools?.map((tool) => tool.function.name)).toEqual(["LINEAR_GET_WORKSPACE", "LINEAR_LIST_TEAMS"])
  expect(chats[0]?.tools?.[0]?.function.parameters).toEqual(tools[0]?.parameters)
  expect(chats[0]?.messages.some((message) => message.role === "system" && message.content.includes("Available read toolkits: linear"))).toBe(true)
  expect(executions).toEqual([{ toolName: "LINEAR_GET_WORKSPACE", arguments: {} }])
  const assistant = chats[1]?.messages.find((message) => message.tool_calls)
  const toolCalls = assistant?.tool_calls as Array<{ id: string; function: { name: string } }>
  const toolResult = chats[1]?.messages.find((message) => message.role === "tool")
  expect(toolCalls[0]?.function.name).toBe("LINEAR_GET_WORKSPACE")
  expect(toolResult?.tool_call_id).toBe(toolCalls[0]?.id)
  expect(JSON.parse(toolResult?.content ?? "{}").data.workspace.name).toBe("Connected Linear workspace")
  expect(authorizations.every((authorization) => authorization === "Bearer authenticated-cli-account")).toBe(true)
  expect(events.some((event) => event.type === "tool-result" && event.status === "completed")).toBe(true)
  expect(events.filter((event) => event.type === "text").map((event) => event.content).join("")).toContain("Connected Linear workspace")
  expect(events.filter((event) => event.type === "finish")).toHaveLength(1)
})

test("keeps multiple calls and their results paired across model rounds", async () => {
  responses = [
    [call("LINEAR_GET_WORKSPACE", "workspace"), call("LINEAR_LIST_TEAMS", "teams"), { type: "finish", reason: "tool_calls" }],
    [call("LINEAR_LIST_TEAMS", "teams", { limit: 1 }), { type: "finish", reason: "tool_calls" }],
    [{ type: "text", content: "Workspace and teams fetched." }, { type: "finish", reason: "stop" }],
  ]
  await collect()
  expect(executions).toHaveLength(3)
  const history = chats[2]?.messages ?? []
  const ids = history.filter((message) => message.role === "tool").map((message) => message.tool_call_id)
  expect(ids).toEqual(["0_workspace", "0_teams", "1_teams"])
  const callIds = history.flatMap((message) => (message.tool_calls as Array<{ id: string }> | undefined)?.map((tool) => tool.id) ?? [])
  expect(ids).toEqual(callIds)
})

test("does not expose or execute mutations or unconnected/local tools", async () => {
  responses = [
    [call("LINEAR_UPDATE_ISSUE", "write"), call("read_file", "local"), { type: "finish", reason: "tool_calls" }],
    [{ type: "text", content: "Those actions are unavailable on this web turn." }, { type: "finish", reason: "stop" }],
  ]
  const events = await collect()
  expect(executions).toHaveLength(0)
  expect(chats[0]?.tools?.some((tool) => tool.function.name === "LINEAR_UPDATE_ISSUE")).toBe(false)
  expect(events.filter((event) => event.type === "tool-result" && event.status === "denied")).toHaveLength(2)
  expect(chats[1]?.messages.filter((message) => message.role === "tool").every((message) => JSON.parse(message.content).denied === true)).toBe(true)
})

test("fails closed when approval metadata is absent", async () => {
  catalog = [{ ...tools[0]!, requiresApproval: undefined } as unknown as ComposioTool]
  responses = [[call("LINEAR_GET_WORKSPACE")], [{ type: "text", content: "Tool access is unavailable." }]]
  await collect()
  expect(chats[0]?.tools).toBeUndefined()
  expect(executions).toHaveLength(0)
})

test("passes HTTP and Composio tool failures back without fabricating data", async () => {
  executionStatus = 403
  responses = [[call("LINEAR_GET_WORKSPACE")], [{ type: "text", content: "Your connection needs attention." }]]
  const events = await collect()
  expect(events.some((event) => event.type === "tool-result" && event.status === "failed")).toBe(true)
  const toolResult = chats[1]?.messages.find((message) => message.role === "tool")
  expect(JSON.parse(toolResult?.content ?? "{}")).toEqual({ successful: false, error: "Composio connection expired" })
})

test("marks unsuccessful Composio results as failures", async () => {
  result = { successful: false, error: "Linear permission denied", data: null }
  responses = [[call("LINEAR_GET_WORKSPACE")], [{ type: "text", content: "I couldn't read that workspace." }]]
  const events = await collect()
  expect(events.some((event) => event.type === "tool-result" && event.status === "failed" && event.message === "Get workspace failed")).toBe(true)
  expect(JSON.parse(chats[1]?.messages.find((message) => message.role === "tool")?.content ?? "{}").error).toBe("Linear permission denied")
})

test("catalog failures stop the turn instead of claiming no integration exists", async () => {
  catalogStatus = 503
  await expect(collect()).rejects.toThrow("CLI tools unavailable")
  expect(chats).toHaveLength(0)
  expect(executions).toHaveLength(0)
})

test("tool-free accounts still support normal chat", async () => {
  catalog = []
  responses = [[{ type: "text", content: "Hello." }, { type: "finish", reason: "stop" }]]
  await collect()
  expect(chats).toHaveLength(1)
  expect(chats[0]?.tools).toBeUndefined()
  expect(chats[0]?.messages.some((message) => message.content.includes("Available read toolkits: none"))).toBe(true)
})

test("blocks repeated identical reads after two executions", async () => {
  responses = [[call("LINEAR_GET_WORKSPACE")], [call("LINEAR_GET_WORKSPACE")], [call("LINEAR_GET_WORKSPACE")], [{ type: "text", content: "I have the workspace details." }]]
  const events = await collect()
  expect(executions).toHaveLength(2)
  expect(events.some((event) => event.type === "tool-result" && event.status === "denied" && event.message.includes("Repeated"))).toBe(true)
})

test("deduplicates repeated stream events for the same tool-call ID", async () => {
  responses = [[call("LINEAR_GET_WORKSPACE"), call("LINEAR_GET_WORKSPACE")], [{ type: "text", content: "Fetched." }]]
  await collect()
  expect(executions).toHaveLength(1)
})

test("does not execute calls from a failed model stream", async () => {
  responses = [[call("LINEAR_GET_WORKSPACE"), { type: "error", message: "Upstream failed" }]]
  await expect(collect()).rejects.toThrow("Upstream failed")
  expect(executions).toHaveLength(0)
})

test("truncates oversized results and tells the model to narrow its query", async () => {
  result = { successful: true, data: "x".repeat(100_000) }
  responses = [[call("LINEAR_GET_WORKSPACE")], [{ type: "text", content: "The result was truncated." }]]
  await collect()
  const content = chats[1]?.messages.find((message) => message.role === "tool")?.content ?? "{}"
  expect(JSON.parse(content).truncated).toBe(true)
  expect(content.length).toBeLessThan(25_000)
})

test("bounds runaway tool rounds", async () => {
  responses = Array.from({ length: 8 }, (_, round) => [call("LINEAR_GET_WORKSPACE", "call", { page: round })])
  await expect(collect()).rejects.toThrow("tool-step budget")
  expect(executions).toHaveLength(8)
})

test("rejects oversized batches before executing any calls", async () => {
  responses = [Array.from({ length: 25 }, (_, index) => call("LINEAR_GET_WORKSPACE", `call_${index}`, { page: index }))]
  await expect(collect()).rejects.toThrow("tool-call budget")
  expect(executions).toHaveLength(0)
})

test("bounds accumulated tool-result context", async () => {
  result = { successful: true, data: "x".repeat(100_000) }
  responses = Array.from({ length: 8 }, (_, round) => [call("LINEAR_GET_WORKSPACE", "call", { page: round })])
  await expect(collect()).rejects.toThrow("tool-result context budget")
  expect(executions.length).toBeLessThan(8)
})

test("an error finish cannot turn a partial answer into a success", async () => {
  responses = [[{ type: "text", content: "Partial answer" }, { type: "finish", reason: "error" }]]
  await expect(collect()).rejects.toThrow("harness failed")
})

test("an aborted turn makes no CLI or Composio requests", async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(collect(controller.signal)).rejects.toThrow()
  expect(authorizations).toHaveLength(0)
})
