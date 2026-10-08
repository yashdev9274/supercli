import { afterAll, beforeEach, expect, mock, test } from "bun:test"

const originalUrl = process.env.SUPERCODE_TERMINAL_API_URL
let sequence = 2
const activities: Array<Record<string, unknown>> = []
const db = {
  agentSession: {
    findUniqueOrThrow: async () => ({ objective: "Review attached files", nextSequence: sequence }),
    update: async () => ({ nextSequence: ++sequence }),
    updateMany: async () => ({ count: 1 }),
  },
  agentSessionMessage: {
    findMany: async () => [{ sequence: 1, role: "user", content: "Explain the attached file" }],
  },
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
    message: {
      id: "message_1",
      sessionId: "session_1",
      surfaceId: "surface_web",
      sequence: 1,
      role: "user",
      content: "Explain the attached file",
      senderType: "member",
      senderId: "web_user",
      createdAt: new Date().toISOString(),
      localAttachments: [
        { id: "file_1", name: "util.ts", mediaType: "text/plain", size: 32 },
      ],
    },
    runId: "run_1",
    surfaceId: "surface_web",
    latestSequence: 1,
  }
})

mock.module("@super/db", () => ({ default: db }))
mock.module("./service", () => ({ postSessionMessage: postMessage }))

const requests: Array<{
  path: string
  body: { messages?: Array<{ role: string; content: string | Array<{ type?: string; text?: string; image?: string }> }> }
}> = []
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    const body = await request.json()
    requests.push({ path, body })
    if (path === "/api/composio/tools") return Response.json({ tools: [] })
    return new Response(
      JSON.stringify({ type: "text", content: "The attached util exports add()." }) +
        "\n" +
        JSON.stringify({ type: "finish", reason: "stop" }) +
        "\n",
    )
  },
})

beforeEach(() => {
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

test("local attachments reach the harness and metadata-only tags reach message persistence", async () => {
  const events = []
  for await (const event of runWebTurn({
    userId: "user_1",
    sessionId: "session_1",
    content: "Explain the attached file",
    harnessToken: "cli-session",
    localAttachments: [
      {
        id: "file_1",
        kind: "text",
        name: "util.ts",
        mediaType: "text/plain",
        size: 32,
        text: "export function add(a: number, b: number) { return a + b }",
      },
      {
        id: "img_1",
        kind: "image",
        name: "ui.png",
        mediaType: "image/png",
        size: 12,
        dataBase64: "aGVsbG8=",
      },
    ],
  })) {
    events.push(event)
  }

  const userMessage = requests
    .find((request) => request.path === "/api/ai/chat")
    ?.body.messages?.find((message) => message.role === "user")
  const content = userMessage?.content
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part: { type?: string; text?: string }) => part.text ?? "").join("\n")
      : ""

  expect(text).toContain("<nova_local_files>")
  expect(text).toContain("export function add")
  expect(text).toContain("util.ts")
  expect(text).toContain("untrusted user-provided")
  expect(text).toContain("vision inputs")
  expect(Array.isArray(content)).toBe(true)
  expect(content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "image", image: "data:image/png;base64,aGVsbG8=" }),
    ]),
  )
  expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
    localAttachments: [
      {
        id: "file_1",
        kind: "text",
        name: "util.ts",
      },
      {
        id: "img_1",
        kind: "image",
        name: "ui.png",
      },
    ],
  })
  expect(events.some((event) => event.type === "finish" && event.reason === "stop")).toBe(true)
})

test("oversized local attachment batches fail before the harness is called", async () => {
  const events = []
  for await (const event of runWebTurn({
    userId: "user_1",
    sessionId: "session_1",
    content: "Explain the attached file",
    harnessToken: "cli-session",
    localAttachments: Array.from({ length: 9 }, (_, i) => ({
      id: `f${i}`,
      kind: "text" as const,
      name: `f${i}.ts`,
      mediaType: "text/plain",
      size: 1,
      text: "x",
    })),
  })) {
    events.push(event)
  }

  expect(events.some((event) => event.type === "error")).toBe(true)
  expect(postMessage).not.toHaveBeenCalled()
  expect(requests).toHaveLength(0)
})
