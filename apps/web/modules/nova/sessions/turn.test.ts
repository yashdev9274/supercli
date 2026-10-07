import { afterAll, expect, mock, test } from "bun:test"

const originalUrl = process.env.SUPERCODE_TERMINAL_API_URL
let sequence = 2
const activities: Array<Record<string, unknown>> = []
const runUpdates: Array<Record<string, unknown>> = []
const prisma = {
  agentSession: {
    findUniqueOrThrow: async () => ({ objective: "Read Linear workspace", nextSequence: sequence }),
    update: async () => ({ nextSequence: ++sequence }),
    updateMany: async () => ({ count: 1 }),
  },
  agentSessionMessage: {
    findMany: async () => [{ sequence: 1, role: "user", content: "Fetch my Linear workspace details" }],
  },
  agentActivity: {
    findMany: async () => [],
    create: async ({ data }: { data: Record<string, unknown> }) => {
      activities.push(data)
      return { ...data, id: `activity_${activities.length}`, createdAt: new Date() }
    },
  },
  agentRun: {
    updateMany: async ({ data }: { data: Record<string, unknown> }) => { runUpdates.push(data); return { count: 1 } },
  },
  $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(prisma),
}
mock.module("@super/db", () => ({ default: prisma }))
mock.module("./service", () => ({
  postSessionMessage: async () => ({
    message: { id: "message_1", sessionId: "session_1", surfaceId: "surface_web", sequence: 1, role: "user", content: "Fetch my Linear workspace details", senderType: "member", senderId: "web_user", createdAt: new Date().toISOString() },
    runId: "run_1", surfaceId: "surface_web", latestSequence: 1,
  }),
}))

let rounds = 0
let executions = 0
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    const body = await request.json()
    expect(request.headers.get("authorization")).toBe("Bearer cli-session")
    if (path === "/api/composio/tools") {
      return Response.json({ tools: [{ name: "LINEAR_GET_WORKSPACE", displayName: "Get workspace", description: "Read workspace", toolkit: "linear", parameters: { type: "object", properties: {} }, requiresApproval: false }] })
    }
    if (path === "/api/composio/execute") {
      executions++
      expect(body).toEqual({ toolName: "LINEAR_GET_WORKSPACE", arguments: {} })
      return Response.json({ successful: true, data: { name: "Verified fixture workspace" } })
    }
    if (path === "/api/ai/chat") {
      rounds++
      expect(body.tools[0].function.name).toBe("LINEAR_GET_WORKSPACE")
      if (rounds === 1) {
        return new Response(JSON.stringify({ type: "tool-call", toolName: "LINEAR_GET_WORKSPACE", toolCallId: "call_1", args: {} }) + "\n" + JSON.stringify({ type: "finish", reason: "tool_calls" }) + "\n")
      }
      expect(body.messages.some((message: { role: string; content: string }) => message.role === "tool" && message.content.includes("Verified fixture workspace"))).toBe(true)
      return new Response(JSON.stringify({ type: "text", content: "Your Linear workspace is Verified fixture workspace." }) + "\n" + JSON.stringify({ type: "finish", reason: "stop" }) + "\n")
    }
    return Response.json({ error: "Unexpected endpoint" }, { status: 404 })
  },
})
process.env.SUPERCODE_TERMINAL_API_URL = server.url.toString().replace(/\/$/, "")
afterAll(() => {
  server.stop(true)
  if (originalUrl === undefined) delete process.env.SUPERCODE_TERMINAL_API_URL
  else process.env.SUPERCODE_TERMINAL_API_URL = originalUrl
})

const { runWebTurn } = await import("./turn")

test("the web turn executes Composio reads, persists tool activity, and returns the grounded answer", async () => {
  const events = []
  for await (const event of runWebTurn({
    userId: "web_user", sessionId: "session_1", content: "Fetch my Linear workspace details", harnessToken: "cli-session", model: "deepseek-v4-flash", provider: "supercode",
  })) events.push(event)
  expect(rounds).toBe(2)
  expect(executions).toBe(1)
  expect(activities.some((activity) => activity.type === "tool_result" && activity.status === "completed")).toBe(true)
  expect(activities.find((activity) => activity.type === "response")?.body).toBe("Your Linear workspace is Verified fixture workspace.")
  expect(runUpdates.some((update) => update.status === "completed")).toBe(true)
  expect(events.some((event) => event.type === "finish" && event.reason === "stop")).toBe(true)
  expect(events.some((event) => event.type === "error")).toBe(false)
})
