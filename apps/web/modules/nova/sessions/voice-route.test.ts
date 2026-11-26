import { beforeEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

const turns: Record<string, unknown>[] = []
let result: Array<Record<string, unknown>> = []

mock.module("server-only", () => ({}))
mock.module("@super/auth/server", () => ({ auth: { api: { getSession: async () => ({ user: { id: "voice-user", email: "voice@example.test", name: "Voice" }, session: { id: "web-session" } }) } } }))
mock.module("@super/db", () => ({ default: {} }))
mock.module("@/modules/nova/harness/auth", () => ({ ensureHarnessToken: async () => ({ token: "harness-token" }) }))
mock.module("@/modules/nova/sessions/service", () => ({ createAgentSession: async () => ({ id: "voice-thread" }) }))
mock.module("@/modules/nova/sessions/turn", () => ({
  runWebTurn: async function* (input: Record<string, unknown>) {
    turns.push(input)
    for (const event of result) yield event
  },
}))

const { POST } = await import("../../../app/api/nova/voice/turn/route")

beforeEach(() => {
  turns.length = 0
  result = [{ type: "text", content: "Vercel hosts Next.js applications." }, { type: "finish", reason: "stop" }]
})

function request(content: string, sessionId?: string, selection?: { provider: string; model: string; effort?: string }) {
  return new NextRequest("http://localhost/api/nova/voice/turn", {
    method: "POST",
    headers: { Authorization: "Bearer device-token", "Content-Type": "application/json" },
    body: JSON.stringify({ content, sessionId, ...selection }),
  })
}

test("spoken questions use compact chat turns and preserve the Nova thread", async () => {
  const response = await POST(request("What is Vercel?"))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ sessionId: "voice-thread", summary: "Vercel hosts Next.js applications." })
  expect(turns[0]).toMatchObject({ sessionId: "voice-thread", mode: "chat", effort: "low", responseStyle: "voice", harnessToken: "harness-token" })
})

test("mutation requests retain agent mode instead of losing their capabilities", async () => {
  await POST(request("Create a Linear issue", "existing-thread"))
  expect(turns[0]).toMatchObject({ sessionId: "existing-thread", mode: "agent" })
})

test("the explicit cloud model selection reaches the harness unchanged", async () => {
  const response = await POST(request("What is Vercel?", "existing-thread", { provider: "supercode", model: "minimax-m3", effort: "medium" }))
  expect(response.status).toBe(200)
  expect(turns[0]).toMatchObject({ provider: "supercode", model: "minimax-m3", effort: "medium" })
})

test("an unsupported coding agent cannot silently fall back to cloud", async () => {
  const response = await POST(request("What is Vercel?", undefined, { provider: "unsupported", model: "some-model" }))
  expect(response.status).toBe(400)
  expect(turns).toHaveLength(0)
})

test("an empty answer returns the thread id and an error, never a fake completion", async () => {
  result = [{ type: "finish", reason: "stop" }]
  const response = await POST(request("What is Vercel?", "existing-thread"))
  expect(response.status).toBe(502)
  expect(await response.json()).toMatchObject({ sessionId: "existing-thread", error: expect.any(String) })
})

test("pending approvals are spoken as pending rather than completed", async () => {
  result = [{ type: "finish", reason: "awaiting_input" }]
  const response = await POST(request("Create an issue"))
  expect((await response.json()).summary).toContain("approval before continuing")
})
