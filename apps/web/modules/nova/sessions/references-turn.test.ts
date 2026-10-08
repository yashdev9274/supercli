import { afterAll, beforeEach, expect, mock, test } from "bun:test"

const originalUrl = process.env.SUPERCODE_TERMINAL_API_URL
let allowed = true
let sequence = 2
const activities: Array<Record<string, unknown>> = []
const db = {
  user: { findUnique: async () => ({ organizationId: "org_1", email: "user@example.com" }) },
  organizationMembership: { findUnique: async () => ({ status: "active" }) },
  repository: { findFirst: async () => allowed ? { id: "repo_1", owner: "nova", name: "example", fullName: "nova/example" } : null },
  agentSession: {
    findUniqueOrThrow: async () => ({ objective: "Explain referenced code", nextSequence: sequence }),
    update: async () => ({ nextSequence: ++sequence }),
    updateMany: async () => ({ count: 1 }),
  },
  agentSessionMessage: { findMany: async () => [{ sequence: 1, role: "user", content: "Explain this file" }] },
  agentActivity: {
    findMany: async () => [],
    create: async ({ data }: { data: Record<string, unknown> }) => {
      activities.push(data)
      return { ...data, id: `activity_${activities.length}`, createdAt: new Date() }
    },
  },
  agentRun: { updateMany: async () => ({ count: 1 }) },
  $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db),
}
const postMessage = mock(async (input: unknown) => {
  if (!input || typeof input !== "object") throw new Error("Missing message input")
  return {
    message: { id: "message_1", sessionId: "session_1", surfaceId: "surface_web", sequence: 1, role: "user", content: "Explain this file", senderType: "member", senderId: "web_user", createdAt: new Date().toISOString() },
    runId: "run_1", surfaceId: "surface_web", latestSequence: 1,
  }
})

mock.module("@super/db", () => ({ default: db }))
mock.module("./service", () => ({ postSessionMessage: postMessage }))
mock.module("@/modules/github/lib/github", () => ({ getGithubTokenForUser: async () => "fixture-token" }))
mock.module("octokit", () => ({ Octokit: class {
  rest = { repos: { getContent: async () => ({ data: { type: "file", size: 50, content: Buffer.from("export function verifySession() { return 'verified' }").toString("base64"), encoding: "base64", sha: "fixture-file-sha" } }) } }
} }))

const requests: Array<{ path: string; body: { messages?: Array<{ role: string; content: string }> } }> = []
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    const body = await request.json()
    requests.push({ path, body })
    if (path === "/api/composio/tools") return Response.json({ tools: [] })
    return new Response(JSON.stringify({ type: "text", content: "The referenced file verifies a session." }) + "\n" + JSON.stringify({ type: "finish", reason: "stop" }) + "\n")
  },
})
beforeEach(() => {
  allowed = true
  sequence = 2
  activities.length = 0
  requests.length = 0
  postMessage.mockClear()
  process.env.SUPERCODE_TERMINAL_API_URL = server.url.toString().replace(/\/$/, "")
})
afterAll(() => {
  server.stop(true)
  if (originalUrl === undefined) delete process.env.SUPERCODE_TERMINAL_API_URL
  else process.env.SUPERCODE_TERMINAL_API_URL = originalUrl
})
const { runWebTurn } = await import("./turn")

test("resolved file references reach the harness and canonical tags reach message persistence", async () => {
  const events = []
  for await (const event of runWebTurn({ userId: "user_1", sessionId: "session_1", content: "Explain this file", harnessToken: "cli-session", references: [{ kind: "files", id: "repo_1:src/auth.ts" }] })) events.push(event)
  const context = requests.find((request) => request.path === "/api/ai/chat")?.body.messages?.map((message) => message.content).join("\n") ?? ""
  expect(context).toContain("verifySession")
  expect(context).toContain("fixture-file-sha")
  expect(context).toContain("untrusted context")
  expect(postMessage.mock.calls[0]?.[0]).toMatchObject({ references: [{ kind: "files", id: "repo_1:src/auth.ts", label: "src/auth.ts", description: "nova/example" }] })
  expect(events.some((event) => event.type === "finish" && event.reason === "stop")).toBe(true)
})

test("a revoked reference fails before saving a message or calling the harness", async () => {
  allowed = false
  const events = []
  for await (const event of runWebTurn({ userId: "user_1", sessionId: "session_1", content: "Explain this file", harnessToken: "cli-session", references: [{ kind: "files", id: "repo_1:src/auth.ts" }] })) events.push(event)
  expect(events.some((event) => event.type === "error" && event.message.includes("unavailable"))).toBe(true)
  expect(postMessage).not.toHaveBeenCalled()
  expect(requests).toHaveLength(0)
})
