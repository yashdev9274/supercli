import { afterAll, beforeEach, expect, mock, test } from "bun:test"

const originalUrl = process.env.SUPERCODE_TERMINAL_API_URL
let signedIn = true
let upstreamStatus = 200
const calls: Array<{ path: string; method: string; authorization: string | null; body: Record<string, unknown> }> = []

mock.module("@super/auth/server", () => ({
  auth: { api: { getSession: async () => signedIn ? { user: { id: "web_user", email: "nova@example.com", name: "Nova" } } : null } },
}))
mock.module("./auth", () => ({
  ensureHarnessToken: async () => ({ token: "cli-session-for-nova", setCookie: "nova_harness_token=test-only; HttpOnly; Path=/" }),
}))

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    calls.push({ path, method: request.method, authorization: request.headers.get("authorization"), body: await request.json() as Record<string, unknown> })
    if (upstreamStatus !== 200) return Response.json({ error: "CLI service unavailable" }, { status: upstreamStatus })
    switch (path) {
      case "/api/composio/apps": return Response.json({ apps: [{ slug: "googlecalendar", connected: true, connectedAccountId: "ca_cli" }] })
      case "/api/composio/session": return Response.json({ url: "https://mcp.composio.dev/session_1", sessionId: "session_1", headers: { "x-mcp-secret": "must-not-reach-browser" } })
      case "/api/composio/tools": return Response.json({ tools: [{ name: "GOOGLECALENDAR_LIST_EVENTS" }] })
      case "/api/composio/connect": return Response.json({ redirectUrl: "https://connect.composio.dev/link", connectedAccountId: "ca_new" })
      case "/api/composio/disconnect": return Response.json({ success: true })
      default: return Response.json({ error: "Unexpected dashboard request" }, { status: 500 })
    }
  },
})
process.env.SUPERCODE_TERMINAL_API_URL = server.url.toString().replace(/\/$/, "")

const apps = await import("../../../app/api/nova/composio/apps/route")
const tools = await import("../../../app/api/nova/composio/tools/route")
const connect = await import("../../../app/api/nova/composio/connect/route")
const disconnect = await import("../../../app/api/nova/composio/disconnect/route")

beforeEach(() => { calls.length = 0; signedIn = true; upstreamStatus = 200 })
afterAll(() => {
  server.stop(true)
  if (originalUrl === undefined) delete process.env.SUPERCODE_TERMINAL_API_URL
  else process.env.SUPERCODE_TERMINAL_API_URL = originalUrl
})

test("Nova loads apps and MCP from the CLI server, without exposing MCP headers", async () => {
  const response = await apps.GET(new Request("http://nova.localhost:3003/api/nova/composio/apps"))
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.apps[0].connectedAccountId).toBe("ca_cli")
  expect(body.mcp).toEqual({ url: "https://mcp.composio.dev/session_1", sessionId: "session_1", hasHeaders: true })
  expect(JSON.stringify(body)).not.toContain("must-not-reach-browser")
  expect(calls.map((call) => call.path).sort()).toEqual(["/api/composio/apps", "/api/composio/session"])
  expect(calls.every((call) => call.method === "POST" && call.authorization === "Bearer cli-session-for-nova")).toBe(true)
  expect(response.headers.get("set-cookie")).toContain("nova_harness_token=")
})

test("Nova tools, connect, and disconnect use desktop’s CLI endpoints", async () => {
  await tools.GET(new Request("http://nova.localhost:3003/api/nova/composio/tools"))
  const connected = await connect.POST(new Request("http://nova.localhost:3003/api/nova/composio/connect", {
    method: "POST", body: JSON.stringify({ slug: "googlecalendar" }),
  }))
  expect((await connected.json()).connectedAccountId).toBe("ca_new")
  await disconnect.POST(new Request("http://nova.localhost:3003/api/nova/composio/disconnect", {
    method: "POST", body: JSON.stringify({ connectedAccountId: "ca_cli" }),
  }))
  expect(calls.map((call) => call.path)).toEqual(["/api/composio/tools", "/api/composio/connect", "/api/composio/disconnect"])
  expect(calls[1]?.body).toEqual({ slug: "googlecalendar", returnTo: "nova" })
  expect(calls[2]?.body).toEqual({ connectedAccountId: "ca_cli" })
})

test("Nova requires login and propagates CLI failures without falling back to Review", async () => {
  signedIn = false
  expect((await tools.GET(new Request("http://nova.localhost:3003/api/nova/composio/tools"))).status).toBe(401)
  expect(calls).toHaveLength(0)
  signedIn = true
  upstreamStatus = 503
  const response = await tools.GET(new Request("http://nova.localhost:3003/api/nova/composio/tools"))
  expect(response.status).toBe(503)
  expect((await response.json()).error).toBe("CLI service unavailable")
  expect(calls.map((call) => call.path)).toEqual(["/api/composio/tools"])
})
