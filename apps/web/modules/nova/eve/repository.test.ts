import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { signNovaScope, type NovaScope } from "@super/nova-runtime/scope"

type Row = Record<string, unknown>
type Query = { where: Row; data?: Row }
const scope: NovaScope = {
  organizationId: "org", userId: "user", membershipId: "member", novaSessionId: "session",
  provider: "codex", connectionId: "connection", model: "gpt-5.4-mini", repositoryRunId: "parent",
}
const secret = "repository-test-secret-at-least-32-bytes"
let receipts: Row[] = []
let children: Row[] = []
let events: string[] = []
let opens = 0
let closes = 0
let closeFails = false
let memberActive = true
let digest = "a".repeat(64)
let artifactCount = 0
let admittedScope = { ...scope }
let runtimeSessionId = "eve_session"
const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([key, value]) => {
  if (key === "result") return (row.result as { success?: boolean } | undefined)?.success === true
  return row[key] === value
})
const dbMethods = {
  $queryRaw: async () => [],
  agentSession: {
    findUniqueOrThrow: async () => ({ activeRunId: "parent" }),
    findUnique: async () => ({ localProjectId: "project" }),
  },
  agentRun: {
    findUniqueOrThrow: async () => ({ status: "executing", cancellationAt: null }),
    findUnique: async () => ({ status: "executing", cancellationAt: null }),
    create: async ({ data }: { data: Row }) => {
      const child = { id: `child_${children.length + 1}`, ...data }
      children.push(child)
      return child
    },
    update: async ({ where, data }: Query) => {
      events.push("child_completed")
      const child = children.find((row) => matches(row, where))!
      Object.assign(child, data)
      return child
    },
    updateMany: async ({ where, data }: Query) => {
      children.filter((row) => matches(row, where)).forEach((row) => Object.assign(row, data))
      return { count: 1 }
    },
  },
  toolInvocation: {
    findUnique: async ({ where }: Query) => receipts.find((row) => matches(row, where)) ?? null,
    findFirst: async ({ where }: Query) => [...receipts].reverse().find((row) => matches(row, where)) ?? null,
    count: async ({ where }: Query) => receipts.filter((row) => matches(row, where)).length,
    create: async ({ data }: { data: Row }) => {
      const receipt = { id: `receipt_${receipts.length + 1}`, ...data }
      receipts.push(receipt)
      events.push("receipt_stored")
      return receipt
    },
    update: async ({ where, data }: Query) => {
      events.push("receipt_completed")
      const receipt = receipts.find((row) => matches(row, where))!
      Object.assign(receipt, data)
      return receipt
    },
  },
}
const db = { ...dbMethods, $transaction: async <T>(fn: (tx: typeof dbMethods) => Promise<T>): Promise<T> => fn(dbMethods) }
mock.module("@super/db", () => ({ default: db }))
mock.module("@super/nova-runtime/store", () => ({
  createPrismaScopeStore: () => ({
    findSession: async () => ({ id: "session", organizationId: "org", initiatorMembership: { id: "member", organizationId: "org", userId: "user", status: memberActive ? "active" : "inactive" } }),
    findConnection: async () => ({ ...scope, status: "connected", enabled: true }),
  }),
}))
class EveAdmissionError extends Error {
  constructor(message: string, public statusCode: number) { super(message) }
}
mock.module("./admission", () => ({
  EveAdmissionError,
  getEveAdmission: async (userId: string, sessionId: string, runId: string) => {
    expect([userId, sessionId, runId]).toEqual(["user", "session", "parent"])
    return {
      arguments: { scope: admittedScope, expiresAt: new Date(Date.now() + 900_000).toISOString(), repository: { repositoryFullName: "owner/repo", projectId: "project", sandboxProvider: "vercel", validationCommands: ["bun test"] } },
      result: { runtimeSessionId },
    }
  },
}))
mock.module("../sandbox/policy", () => ({ sandboxProvider: () => "vercel" }))
mock.module("../sandbox/service", () => ({
  sandboxEligibility: async () => ({ organizationId: "org", repositoryFullName: "owner/repo" }),
  openSandboxWorkspace: async (input: { runId: string; sessionId: string }) => {
    opens++
    events.push("open")
    expect(input.sessionId).toBe("session")
    const receipt = receipts.at(-1)!
    expect(receipt.status).toBe("executing")
    expect((receipt.arguments as Row).childId).toBe(input.runId)
    expect(children.at(-1)).toMatchObject({ id: input.runId, parentRunId: "parent" })
    return {
      execute: async (name: string, args: Row) => {
        events.push(name)
        if (name === "run_command") return { success: true, successful: true, exitCode: 0, stdout: String(args.command), truncated: false }
        return { success: true, data: { content: "retained file", version: digest } }
      },
      inspectChanges: async () => ({ digest, status: " M file.ts", diff: "actual retained diff" }),
      savePatch: async (expectedDigest: string) => {
        expect(expectedDigest).toBe(digest)
        artifactCount++
        return "Download patch: artifact_1"
      },
      close: async () => {
        closes++
        events.push("close")
        if (closeFails) throw new Error("snapshot stop uncertain")
      },
    }
  },
}))
const { repositoryToolRequest } = await import("./repository")
const originalEnv = Object.fromEntries(["NOVA_EVE_REPOSITORY_ENABLED", "NOVA_EVE_REPOSITORY_USER_IDS", "NOVA_EVE_ENABLED", "NOVA_EVE_SPECIALISTS_ENABLED", "NOVA_SANDBOX_ENABLED", "NOVA_EVE_SCOPE_SECRET"].map((key) => [key, process.env[key]]))
beforeEach(() => {
  receipts = []; children = []; events = []; opens = 0; closes = 0; closeFails = false
  memberActive = true; digest = "a".repeat(64); artifactCount = 0
  admittedScope = { ...scope }; runtimeSessionId = "eve_session"
  process.env.NOVA_EVE_REPOSITORY_ENABLED = "true"
  process.env.NOVA_EVE_REPOSITORY_USER_IDS = "user"
  process.env.NOVA_EVE_ENABLED = "true"
  process.env.NOVA_SANDBOX_ENABLED = "true"
  process.env.NOVA_EVE_SCOPE_SECRET = secret
  process.env.NOVA_EVE_SPECIALISTS_ENABLED = "true"
})
afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
function request(callId = "call_1", name = "read_file", args: Row = { path: "file.ts" }, selected: NovaScope = scope, runtime = "eve_session", specialistRole?: string) {
  return repositoryToolRequest(new Request("http://localhost/api/repository", {
    method: "POST", headers: { authorization: `Bearer ${signNovaScope(selected, { secret })}` },
    body: JSON.stringify({ callId, runtimeSessionId: runtime, name, args, specialistRole }),
  }))
}

test("read-only scope and disabled feature are rejected before acquisition", async () => {
  const { repositoryRunId: _, ...readOnly } = scope
  await expect(request("call_1", "read_file", {}, readOnly)).rejects.toMatchObject({ statusCode: 403 })
  process.env.NOVA_EVE_REPOSITORY_ENABLED = "false"
  await expect(request()).rejects.toMatchObject({ statusCode: 403 })
  expect(opens).toBe(0)
})

test("recorded specialists can read but cannot mutate, execute, verify or finalize", async () => {
  receipts.push({ id: "specialist", runId: "parent", capability: "nova-eve:specialist", idempotencyKey: "nova-eve:specialist:parent:child_eve", arguments: { role: "explorer", parentRuntimeSessionId: "eve_session" } })
  expect(await request("read", "read_file", { path: "file.ts" }, scope, "child_eve", "explorer")).toMatchObject({ success: true })
  for (const name of ["write_file", "edit_file", "run_command", "repository_verify", "repository_finish"]) await expect(request("forbidden", name, {}, scope, "child_eve", "explorer")).rejects.toMatchObject({ statusCode: 403 })
  await expect(request("role_forgery", "read_file", { path: "file.ts" }, scope, "child_eve", "verifier")).rejects.toMatchObject({ statusCode: 403 })
  await expect(request("root_forgery", "read_file", { path: "file.ts" }, scope, "child_eve")).rejects.toMatchObject({ statusCode: 409 })
  expect(opens).toBe(1)
})

test("same child-local call ID has independent receipts across specialist sessions", async () => {
  for (const id of ["child_one", "child_two"]) {
    receipts.push({ id, runId: "parent", capability: "nova-eve:specialist", idempotencyKey: `nova-eve:specialist:parent:${id}`, arguments: { role: "explorer", parentRuntimeSessionId: "eve_session" } })
    expect(await request("same_call", "read_file", { path: "file.ts" }, scope, id, "explorer")).toMatchObject({ success: true })
  }
  expect(opens).toBe(2)
})

test("revoked membership, changed signed grant and wrong Eve identity are denied", async () => {
  memberActive = false
  await expect(request()).rejects.toMatchObject({ statusCode: 403 })
  memberActive = true
  admittedScope = { ...scope, model: "other" }
  await expect(request()).rejects.toMatchObject({ statusCode: 403 })
  admittedScope = { ...scope }
  await expect(request("call_1", "read_file", {}, scope, "other_eve")).rejects.toMatchObject({ statusCode: 409 })
  expect(opens).toBe(0)
})

test("completed call replays its result without reopening and rejects changed args", async () => {
  admittedScope = Object.fromEntries(Object.entries(scope).reverse()) as unknown as NovaScope
  const first = await request()
  expect(await request()).toEqual(first)
  await expect(request("call_1", "read_file", { path: "other.ts" })).rejects.toMatchObject({ statusCode: 409 })
  expect(opens).toBe(1)
  expect(closes).toBe(1)
})

test("a newer failed validation invalidates an older successful verification", async () => {
  expect(await request("verify", "repository_verify", {})).toMatchObject({ success: true })
  receipts.push({ id: "newer_failed_validation", runId: "parent", capability: "nova-eve:repository", toolName: "repository_verify", status: "completed", result: { success: false, error: "validation failed" } })
  expect(await request("finish", "repository_finish", {})).toMatchObject({ success: false })
  expect(artifactCount).toBe(0)
})

test("stable child and executing receipt exist before open; success follows close", async () => {
  expect(await request()).toMatchObject({ success: true })
  expect(events).toEqual(["receipt_stored", "open", "read_file", "close", "receipt_completed", "child_completed"])
  expect(children[0]).toMatchObject({ status: "completed", parentRunId: "parent" })
  expect(receipts[0].status).toBe("completed")
})

test("failed cleanup retains uncertain receipt and blocks replay and new operations", async () => {
  closeFails = true
  await expect(request()).rejects.toMatchObject({ statusCode: 409 })
  expect(receipts[0].status).toBe("executing")
  expect(children[0].status).toBe("failed")
  expect(events).not.toContain("receipt_completed")
  await expect(request()).rejects.toMatchObject({ statusCode: 409 })
  await expect(request("call_2")).rejects.toMatchObject({ statusCode: 409 })
  expect(opens).toBe(1)
})

test("verification proof authorizes matching final patch and blocks later operations", async () => {
  expect(await request("verify", "repository_verify", {})).toMatchObject({ success: true, data: { verifiedDigest: digest } })
  expect(await request("finish", "repository_finish", {})).toMatchObject({ success: true, data: { artifact: "Download patch: artifact_1", diff: "actual retained diff" } })
  expect(artifactCount).toBe(1)
  expect(opens).toBe(2)
  expect(closes).toBe(2)
  await expect(request("after_finish")).rejects.toMatchObject({ statusCode: 409 })
  expect(opens).toBe(2)
})

test("missing verification cannot produce a completed task proof", async () => {
  expect(await request("finish", "repository_finish", {})).toMatchObject({ success: false, error: "Successful repository verification is required" })
  expect(artifactCount).toBe(0)
  expect(children[0].status).toBe("failed")
  expect(closes).toBe(1)
})

test("changed retained contents invalidate an earlier verification", async () => {
  await request("verify", "repository_verify", {})
  digest = "b".repeat(64)
  expect(await request("finish", "repository_finish", {})).toMatchObject({ success: false, error: "Repository verification is stale; verify again" })
  expect(artifactCount).toBe(0)
})
