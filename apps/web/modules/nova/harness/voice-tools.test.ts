import { afterAll, expect, test } from "bun:test"

import { createVoiceReadTools } from "./voice-tools"

let catalogReads = 0
const executions: unknown[] = []
const originalUrl = process.env.SUPERCODE_TERMINAL_API_URL
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    expect(request.headers.get("authorization")).toBe("Bearer voice-token")
    if (new URL(request.url).pathname === "/api/composio/tools") {
      catalogReads++
      return Response.json({ tools: [
        { name: "LINEAR_GET_WORKSPACE", displayName: "Get workspace", description: "Read Linear workspace", toolkit: "linear", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, requiresApproval: false },
        { name: "LINEAR_DELETE_ISSUE", displayName: "Delete issue", description: "Delete Linear issue", toolkit: "linear", parameters: { type: "object" }, requiresApproval: true },
      ] })
    }
    executions.push(await request.json())
    return Response.json({ successful: true, data: { name: "Workspace" } })
  },
})

afterAll(() => {
  server.stop(true)
  if (originalUrl === undefined) delete process.env.SUPERCODE_TERMINAL_API_URL
  else process.env.SUPERCODE_TERMINAL_API_URL = originalUrl
})

test("voice loads app schemas only on discovery, and validates every read", async () => {
  process.env.SUPERCODE_TERMINAL_API_URL = server.url.toString().replace(/\/$/, "")
  const voice = createVoiceReadTools("voice-token")
  expect(catalogReads).toBe(0)
  await expect(voice.execute("read_connected_app", { toolName: "LINEAR_GET_WORKSPACE", arguments: { id: "workspace" } })).rejects.toThrow("Discover")
  const result = await voice.execute("find_connected_read_tools", { query: "Linear" }) as { tools: Array<{ name: string }> }
  expect(result.tools.map((tool) => tool.name)).toEqual(["LINEAR_GET_WORKSPACE"])
  expect(catalogReads).toBe(1)
  await expect(voice.execute("read_connected_app", { toolName: "LINEAR_DELETE_ISSUE", arguments: {} })).rejects.toThrow("Discover")
  await expect(voice.execute("read_connected_app", { toolName: "LINEAR_GET_WORKSPACE", arguments: { id: 4 } })).rejects.toThrow()
  expect(executions).toHaveLength(0)
  await voice.execute("read_connected_app", { toolName: "LINEAR_GET_WORKSPACE", arguments: { id: "workspace" } })
  expect(executions).toEqual([{ toolName: "LINEAR_GET_WORKSPACE", arguments: { id: "workspace" } }])
  await voice.execute("find_connected_read_tools", { query: "workspace" })
  expect(catalogReads).toBe(1)
})
