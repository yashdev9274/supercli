import { afterAll, beforeEach, expect, mock, test } from "bun:test"

let primary: any
let run: any
let session: any
let events: Map<string, any>
let usage: Map<string, any>
let messages: any[]
let batches: any[]
let submissions: string[]
let controls: string[]
let rejectControl = false
let rejectAck = false
let repositoryProof: any = null

const invocation = {
  findFirst: async () => repositoryProof,
  findFirstOrThrow: async () => ({ ...primary, run }),
  findUniqueOrThrow: async () => ({ ...primary, run }),
  findUnique: async ({ where }: any) => where.id ? primary : events.get(where.idempotencyKey) ?? null,
  create: async ({ data }: any) => { if (events.has(data.idempotencyKey)) throw new Error("duplicate event"); events.set(data.idempotencyKey, data); return data },
  upsert: async ({ where, create }: any) => { if (!events.has(where.idempotencyKey)) events.set(where.idempotencyKey, create); return events.get(where.idempotencyKey) },
  update: async ({ data }: any) => { if (rejectAck && data.result?.runtimeSessionId) { rejectAck = false; throw new Error("simulated lost local acknowledgement") }; Object.assign(primary, data); return primary },
  updateMany: async ({ data }: any) => { Object.assign(primary, data); return { count: 1 } },
}
const db: any = {
  toolInvocation: invocation,
  agentRun: {
    findUniqueOrThrow: async () => run,
    update: async ({ data }: any) => { Object.assign(run, data); return run },
    updateMany: async ({ data }: any) => { Object.assign(run, data); return { count: 1 } },
  },
  agentSession: {
    update: async () => ({ nextSequence: ++session.nextSequence }),
    updateMany: async ({ where, data }: any) => { if (session.activeRunId === where.activeRunId) Object.assign(session, data); return { count: 1 } },
  },
  agentSessionMessage: { create: async ({ data }: any) => { messages.push(data); return data } },
  agentActivity: { create: async ({ data }: any) => data },
  novaUsageLedger: { upsert: async ({ where, create }: any) => { if (!usage.has(where.reservationKey)) usage.set(where.reservationKey, create); return create } },
  $queryRaw: async () => [],
  $transaction: async (fn: any) => fn(db),
}
mock.module("@super/db", () => ({ default: db }))
mock.module("@super/nova-runtime/remote", () => ({
  remoteConfig: () => ({ origin: "https://eve.example.test", secret: "synthetic-only" }),
  submitRemoteTurn: async (_config: any, _scope: any, _content: any, operation: string) => { submissions.push(operation); return "remote" },
  readRemoteBatch: async () => batches.shift() ?? { events: [], nextLine: 0, nextIndex: -1 },
  controlRemoteTurn: async (_config: any, _scope: any, _id: any, action: string) => { controls.push(action); if (rejectControl) throw new Error("unreachable") },
}))
const { dispatchEveRun, observeEveRun, failEveRun } = await import("./worker")
const oldFlag = process.env.NOVA_EVE_CANARY_ENABLED
const oldUsers = process.env.NOVA_EVE_CANARY_USER_IDS

beforeEach(() => {
  process.env.NOVA_EVE_CANARY_ENABLED = "true"
  process.env.NOVA_EVE_CANARY_USER_IDS = "user"
  run = { id: "run", agentSessionId: "session", status: "queued", cancellationAt: null }
  session = { activeRunId: "run", nextSequence: 5 }
  primary = { id: "invocation", runId: "run", startedAt: null, status: "pending", result: { runtimeSessionId: null, nextLine: 0, replyParts: {} }, arguments: { scope: { userId: "user", organizationId: "org", membershipId: "member", novaSessionId: "session", provider: "codex", model: "fixture", connectionId: "connection" }, content: "question", history: [], surfaceId: "surface", expiresAt: new Date(Date.now() + 60_000).toISOString() } }
  events = new Map(); usage = new Map(); messages = []; batches = []; submissions = []; controls = []
  rejectAck = false; rejectControl = false
  repositoryProof = null
})
afterAll(() => {
  if (oldFlag === undefined) delete process.env.NOVA_EVE_CANARY_ENABLED; else process.env.NOVA_EVE_CANARY_ENABLED = oldFlag
  if (oldUsers === undefined) delete process.env.NOVA_EVE_CANARY_USER_IDS; else process.env.NOVA_EVE_CANARY_USER_IDS = oldUsers
})
const event = (index: number, type: string, data: any) => ({ type, data, meta: { position: { line: 0, index }, at: new Date().toISOString() } })

test("dispatch reuses its recorded Eve session and crash retries preserve the remote operation ID", async () => {
  rejectAck = true
  await expect(dispatchEveRun("run")).rejects.toThrow("lost local")
  await dispatchEveRun("run")
  await dispatchEveRun("run")
  expect(submissions).toEqual(["nova-eve:run", "nova-eve:run"])
  expect(primary.result.runtimeSessionId).toBe("remote")
  expect(run.status).toBe("executing")
})

test("overlapping event batches create one reply and one zero-credit usage assessment", async () => {
  await dispatchEveRun("run")
  const prefix = [event(0, "content.delta", { partId: "reply", kind: "text", delta: "Hello" }), event(1, "content.completed", { partId: "reply", kind: "text", phase: "reply", value: "Hello" }), event(2, "usage.recorded", { usage: { inputTokens: 10, outputTokens: 3, cacheReadTokens: 0 } })]
  batches.push({ events: prefix, nextLine: 0, nextIndex: 2 }, { events: [...prefix, event(3, "turn.settled", { outcome: "completed" })], nextLine: 1, nextIndex: -1 })
  expect((await observeEveRun("run")).terminal).toBe(false)
  expect((await observeEveRun("run")).terminal).toBe(true)
  await observeEveRun("run")
  expect(messages).toHaveLength(1)
  expect(messages[0].content).toBe("Hello")
  expect(usage.size).toBe(1)
  expect([...usage.values()][0]).toMatchObject({ quantity: 0, unit: "credits" })
  expect(run.status).toBe("completed")
  expect(session.activeRunId).toBeNull()
  expect([...events.values()].filter((row) => row.result?.type === "finish")).toHaveLength(1)
})

test("explicit cancellation reaches Eve and is not reported completed until a terminal event", async () => {
  await dispatchEveRun("run")
  run.cancellationAt = new Date()
  batches.push({ events: [], nextLine: 0, nextIndex: -1 })
  expect((await observeEveRun("run")).terminal).toBe(false)
  expect(run.status).toBe("executing")
  batches.push({ events: [event(0, "turn.settled", { outcome: "cancelled" })], nextLine: 1, nextIndex: -1 })
  expect((await observeEveRun("run")).terminal).toBe(true)
  expect(controls).toContain("cancel")
  expect(run.status).toBe("cancelled")
  expect(messages).toHaveLength(0)
})

test("uncertain admission after cancellation is reported as failed rather than falsely claiming cancellation", async () => {
  primary.startedAt = new Date()
  run.cancellationAt = new Date()
  await expect(dispatchEveRun("run")).rejects.toThrow("uncertain")
  await failEveRun("run")
  expect(submissions).toHaveLength(0)
  expect(run.status).toBe("failed")
  expect(session.activeRunId).toBeNull()
  expect([...events.values()].some((row) => row.result?.message?.includes("uncertain"))).toBe(true)
})

test("unreachable cancellation never fabricates a stopped run", async () => {
  await dispatchEveRun("run")
  run.cancellationAt = new Date()
  rejectControl = true
  await expect(observeEveRun("run")).rejects.toThrow("unreachable")
  expect(run.status).toBe("executing")
  expect(messages).toHaveLength(0)
})

test("an unverified model completion cannot report repository success", async () => {
  primary.arguments.repository = { repositoryFullName: "owner/repo", validationCommands: ["bun test"] }
  await dispatchEveRun("run")
  batches.push({ events: [event(0, "content.completed", { partId: "reply", kind: "text", phase: "reply", value: "Claimed implementation" }), event(1, "turn.settled", { outcome: "completed" })], nextLine: 1, nextIndex: -1 })
  expect((await observeEveRun("run")).terminal).toBe(true)
  expect(run.status).toBe("failed")
  expect(messages).toHaveLength(0)
  expect([...events.values()].some((row) => row.result?.message?.includes("not finalized"))).toBe(true)
})

test("successful repository completion attaches control-plane verification and patch evidence", async () => {
  primary.arguments.repository = { repositoryFullName: "owner/repo", validationCommands: ["bun test"] }
  repositoryProof = { result: { success: true, data: { digest: "a".repeat(64), artifact: "Verified patch link", diff: "not copied into final response" } } }
  await dispatchEveRun("run")
  batches.push({ events: [event(0, "content.completed", { partId: "reply", kind: "text", phase: "reply", value: "Implemented" }), event(1, "turn.settled", { outcome: "completed" })], nextLine: 1, nextIndex: -1 })
  expect((await observeEveRun("run")).terminal).toBe(true)
  expect(run.status).toBe("completed")
  expect(messages[0].content).toContain("Verified patch link")
  expect(messages[0].content).toContain("a".repeat(64))
  expect(messages[0].content).not.toContain("not copied")
})
