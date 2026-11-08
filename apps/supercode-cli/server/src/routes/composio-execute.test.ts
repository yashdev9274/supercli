import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import express from "express"
import type { Composio } from "@composio/core"
import { createMCPClient } from "@ai-sdk/mcp"

import { ServerComposioService } from "../lib/composio"
import { registerComposioRoutes } from "./composio"

const execute = mock(async (_name: string, _args: unknown) => ({ successful: true, data: { workspace: "Connected workspace" } }))
const reserveTool = mock(async (_userId: string, _toolName: string, _key?: string) => ({ id: "reservation-1", replayed: false }))
const settleTool = mock(async (_id: string, _toolName: string) => ({}))
const client = {
  connectedAccounts: { list: async () => ({ items: [{ id: "ca_linear", status: "ACTIVE", isDisabled: false, toolkit: { slug: "linear" } }], nextCursor: null }) },
  tools: {
    getRawComposioTools: async () => [{ slug: "LINEAR_GET_WORKSPACE", toolkit: { slug: "linear" }, version: "20261020_01" }],
    execute,
  },
} as unknown as Composio
const app = express()
app.use(express.json())
registerComposioRoutes(app, async (req) => req.get("Authorization") === "invalid" ? null : { id: "cli_user" }, new ServerComposioService(client), { reserveTool, settleTool })
const server = app.listen(0, "127.0.0.1")
await new Promise<void>((resolve) => server.once("listening", () => resolve()))
const address = server.address()
if (!address || typeof address === "string") throw new Error("No test server address")
const url = `http://127.0.0.1:${address.port}/api/composio/execute`
const mcpUrl = `http://127.0.0.1:${address.port}/api/composio/mcp`
afterAll(() => { server.closeAllConnections(); server.close() })

beforeEach(() => {
  execute.mockReset()
  execute.mockResolvedValue({ successful: true, data: { workspace: "Connected workspace" } })
  reserveTool.mockReset()
  reserveTool.mockResolvedValue({ id: "reservation-1", replayed: false })
  settleTool.mockReset()
  settleTool.mockResolvedValue({})
})

async function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })
}

test("accepts desktop’s toolName execute contract", async () => {
  const response = await post({ toolName: "LINEAR_GET_WORKSPACE", arguments: {} })
  expect(response.status).toBe(200)
  expect((await response.json()).successful).toBe(true)
  expect(execute).toHaveBeenCalledWith("LINEAR_GET_WORKSPACE", {
    userId: "cli_user", connectedAccountId: "ca_linear", arguments: {}, version: "20261020_01",
  })
  expect(reserveTool).toHaveBeenCalledWith("cli_user", "LINEAR_GET_WORKSPACE", expect.any(String))
  expect(settleTool).toHaveBeenCalledWith("reservation-1", "LINEAR_GET_WORKSPACE")
})

test("keeps name compatibility and rejects conflicting names", async () => {
  expect((await post({ name: "LINEAR_GET_WORKSPACE", arguments: {} })).status).toBe(200)
  expect((await post({ toolName: "LINEAR_GET_WORKSPACE", name: "OTHER_TOOL", arguments: {} })).status).toBe(400)
  expect((await post({ arguments: {} })).status).toBe(400)
})

test("reserves before upstream and settles after it with a caller idempotency key", async () => {
  const steps: string[] = []
  reserveTool.mockImplementation(async () => {
    steps.push("reserve")
    return { id: "reservation-key", replayed: false }
  })
  execute.mockImplementation(async () => {
    steps.push("execute")
    return { successful: true, data: { workspace: "Connected workspace" } }
  })
  settleTool.mockImplementation(async () => {
    steps.push("settle")
    return {}
  })
  expect((await post({ toolName: "LINEAR_GET_WORKSPACE" }, { "Idempotency-Key": "tool-attempt-1" })).status).toBe(200)
  expect(reserveTool).toHaveBeenCalledWith("cli_user", "LINEAR_GET_WORKSPACE", "tool-attempt-1")
  expect(settleTool).toHaveBeenCalledWith("reservation-key", "LINEAR_GET_WORKSPACE")
  expect(steps).toEqual(["reserve", "execute", "settle"])
})

test("does not dispatch without credits, even with BYOK credentials", async () => {
  reserveTool.mockRejectedValueOnce(Object.assign(new Error("Insufficient credits"), { statusCode: 402 }))
  const response = await post({ name: "LINEAR_GET_WORKSPACE", apiKey: "user-owned-key" }, { "X-API-Key": "user-owned-key" })
  expect(response.status).toBe(402)
  expect(execute).not.toHaveBeenCalled()
  expect(settleTool).not.toHaveBeenCalled()
})

test("rejects replayed executions without calling upstream or settling again", async () => {
  reserveTool.mockResolvedValueOnce({ id: "reservation-old", replayed: true })
  expect((await post({ name: "LINEAR_GET_WORKSPACE" }, { "Idempotency-Key": "used-key" })).status).toBe(409)
  expect(execute).not.toHaveBeenCalled()
  expect(settleTool).not.toHaveBeenCalled()
})

test("settles attempted upstream calls on exceptions and unsuccessful results", async () => {
  execute.mockRejectedValueOnce(new Error("Upstream unavailable"))
  expect((await post({ name: "LINEAR_GET_WORKSPACE" })).status).toBe(502)
  expect(settleTool).toHaveBeenCalledTimes(1)
  execute.mockResolvedValueOnce({ successful: false, data: { workspace: "" } })
  expect((await post({ name: "LINEAR_GET_WORKSPACE" })).status).toBe(200)
  expect(settleTool).toHaveBeenCalledTimes(2)
})

test("fails closed on billing failures before or after upstream", async () => {
  reserveTool.mockRejectedValueOnce(new Error("Ledger unavailable"))
  expect((await post({ name: "LINEAR_GET_WORKSPACE" })).status).toBe(502)
  expect(execute).not.toHaveBeenCalled()
  settleTool.mockRejectedValueOnce(new Error("Settlement unavailable"))
  expect((await post({ name: "LINEAR_GET_WORKSPACE" })).status).toBe(502)
  expect(execute).toHaveBeenCalledTimes(1)
})

test("rejects invalid or unauthenticated requests before reserving", async () => {
  expect((await post({ name: "LINEAR_GET_WORKSPACE" }, { Authorization: "invalid" })).status).toBe(401)
  expect((await post({ name: "LINEAR_GET_WORKSPACE" }, { "Idempotency-Key": "x".repeat(257) })).status).toBe(400)
  expect((await post({ arguments: {} })).status).toBe(400)
  expect(reserveTool).not.toHaveBeenCalled()
})

test("generates a fresh key for each request without one", async () => {
  await post({ name: "LINEAR_GET_WORKSPACE" })
  await post({ name: "LINEAR_GET_WORKSPACE" })
  const first = reserveTool.mock.calls[0]?.[2]
  const second = reserveTool.mock.calls[1]?.[2]
  expect(first).toMatch(/^[0-9a-f-]{36}$/)
  expect(second).not.toBe(first)
})

async function rpc(body: unknown, headers: Record<string, string> = {}) {
  return fetch(mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

test("supports stateless MCP initialization, notifications, ping, and scoped tool discovery", async () => {
  const response = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })
  expect(await response.json()).toMatchObject({
    jsonrpc: "2.0", id: 1,
    result: { protocolVersion: "2025-03-26", capabilities: { tools: {} } },
  })
  expect((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202)
  expect(await (await rpc({ jsonrpc: "2.0", id: "ping-1", method: "ping" })).json()).toEqual({ jsonrpc: "2.0", id: "ping-1", result: {} })
  const tools = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json()
  expect(tools.result.tools).toEqual([{ name: "LINEAR_GET_WORKSPACE", inputSchema: { type: "object", properties: {} } }])
  expect(reserveTool).not.toHaveBeenCalled()
  expect(execute).not.toHaveBeenCalled()
})

test("rejects unauthorized, malformed, and unknown MCP methods without execution", async () => {
  expect((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "LINEAR_GET_WORKSPACE" } }, { Authorization: "invalid" })).status).toBe(401)
  expect((await rpc({ jsonrpc: "2.0", method: "tools/call", params: { name: "LINEAR_GET_WORKSPACE" } })).status).toBe(400)
  expect((await rpc([{ jsonrpc: "2.0", id: 1, method: "tools/call" }])).status).toBe(400)
  expect(await (await rpc({ jsonrpc: "2.0", id: 7, method: "unknown" })).json()).toMatchObject({ id: 7, error: { code: -32601 } })
  expect((await fetch(mcpUrl)).status).toBe(405)
  expect(reserveTool).not.toHaveBeenCalled()
  expect(execute).not.toHaveBeenCalled()
})

test("meters MCP calls and rejects exhausted credits and replays before upstream", async () => {
  const call = { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "LINEAR_GET_WORKSPACE", arguments: {} } }
  reserveTool.mockRejectedValueOnce(Object.assign(new Error("Monthly product credits exhausted"), { statusCode: 402 }))
  const exhausted = await rpc(call)
  expect(exhausted.status).toBe(402)
  expect(await exhausted.json()).toMatchObject({ id: 10, error: { data: { statusCode: 402 } } })
  reserveTool.mockResolvedValueOnce({ id: "old-reservation", replayed: true })
  expect((await rpc(call, { "Idempotency-Key": "used-tool-key" })).status).toBe(409)
  expect(execute).not.toHaveBeenCalled()
  expect(settleTool).not.toHaveBeenCalled()
  const successful = await rpc(call, { "Idempotency-Key": "new-tool-key" })
  expect(successful.status).toBe(200)
  expect(await successful.json()).toMatchObject({ id: 10, result: { isError: false, content: [{ type: "text", text: expect.any(String) }] } })
  expect(reserveTool).toHaveBeenCalledWith("cli_user", "LINEAR_GET_WORKSPACE", "new-tool-key")
  expect(settleTool).toHaveBeenCalledWith("reservation-1", "LINEAR_GET_WORKSPACE")
})

test("settles MCP upstream failures without returning a successful result", async () => {
  execute.mockRejectedValueOnce(new Error("Upstream failed"))
  const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "LINEAR_GET_WORKSPACE" } })
  expect(response.status).toBe(502)
  expect(await response.json()).toMatchObject({ id: 1, error: { data: { statusCode: 502 } } })
  expect(settleTool).toHaveBeenCalledWith("reservation-1", "LINEAR_GET_WORKSPACE")
})

test("the real MCP HTTP SDK discovers and executes tools through the metered proxy", async () => {
  const originalServerUrl = process.env.BETTER_AUTH_URL
  let session: { url: string; headers: Record<string, string> }
  try {
    process.env.BETTER_AUTH_URL = new URL(mcpUrl).origin
    const response = await fetch(new URL("/api/composio/session", mcpUrl), { method: "POST", headers: { Authorization: "Bearer cli_user" } })
    expect(response.status).toBe(200)
    session = await response.json()
  } finally {
    if (originalServerUrl === undefined) delete process.env.BETTER_AUTH_URL
    else process.env.BETTER_AUTH_URL = originalServerUrl
  }
  expect(session.url).toBe(mcpUrl)
  expect(session.headers).toEqual({ Authorization: "Bearer cli_user" })
  const mcp = await createMCPClient({ transport: { type: "http", ...session } })
  try {
    expect((await mcp.listTools()).tools[0]?.name).toBe("LINEAR_GET_WORKSPACE")
    const result = await mcp.callTool({ name: "LINEAR_GET_WORKSPACE", arguments: {} })
    expect(result).toMatchObject({ isError: false, content: [{ type: "text", text: expect.stringContaining("Connected workspace") }] })
    expect(reserveTool).toHaveBeenCalledTimes(1)
    expect(settleTool).toHaveBeenCalledTimes(1)
    reserveTool.mockRejectedValueOnce(Object.assign(new Error("Monthly product credits exhausted"), { statusCode: 402 }))
    await expect(mcp.callTool({ name: "LINEAR_GET_WORKSPACE" })).rejects.toThrow()
    reserveTool.mockResolvedValueOnce({ id: "old-reservation", replayed: true })
    await expect(mcp.callTool({ name: "LINEAR_GET_WORKSPACE" })).rejects.toThrow()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(settleTool).toHaveBeenCalledTimes(1)
  } finally {
    await mcp.close()
  }
})
