import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { APIError, Sandbox } from "@vercel/sandbox"

let row: Record<string, unknown> | null = null
let busy = 0
let membership = "active"
let projectUser = "u"
let connected = true
const updates: Array<Record<string, unknown>> = []
const runUpdates: Array<Record<string, unknown>> = []
const db = {
  $queryRaw: async () => [],
  agentSession: {
    findUnique: async () => ({ organizationId: "o", localProject: { repositoryFullName: "owner/repo", status: "active", userId: projectUser, organizationId: "o" } }),
    updateMany: async () => ({ count: 1 }),
  },
  organizationMembership: { findUnique: async () => ({ status: membership }) },
  repository: { findFirst: async () => connected ? { fullName: "owner/repo" } : null },
  novaSandboxSession: {
    count: async () => busy,
    findUnique: async () => row,
    findMany: async () => row ? [row] : [],
    updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { count: 1 } },
  },
  agentRun: {
    update: async () => ({}),
    updateMany: async ({ data }: { data: Record<string, unknown> }) => { runUpdates.push(data); return { count: 1 } },
  },
  novaUsageLedger: { upsert: async () => ({}) },
  novaArtifact: { deleteMany: async () => ({ count: 0 }) },
  $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db),
}
mock.module("@super/db", () => ({ default: db }))
mock.module("@/modules/github/lib/github", () => ({ getGithubTokenForUser: async () => "fixture-token" }))
const { openSandboxWorkspace, reconcileSandboxWorkspaces, sandboxEligibility, stopSandbox } = await import("./service")
const originalEnabled = process.env.NOVA_SANDBOX_ENABLED
const originalUsers = process.env.NOVA_SANDBOX_USER_IDS
const originalOrganizations = process.env.NOVA_SANDBOX_ORGANIZATION_IDS
beforeEach(() => {
  process.env.NOVA_SANDBOX_ENABLED = "true"
  delete process.env.NOVA_SANDBOX_USER_IDS
  delete process.env.NOVA_SANDBOX_ORGANIZATION_IDS
  row = null
  busy = 0
  membership = "active"
  projectUser = "u"
  connected = true
  updates.length = 0
  runUpdates.length = 0
})
afterEach(() => {
  mock.restore()
  for (const [key, value] of Object.entries({ NOVA_SANDBOX_ENABLED: originalEnabled, NOVA_SANDBOX_USER_IDS: originalUsers, NOVA_SANDBOX_ORGANIZATION_IDS: originalOrganizations })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
const input = () => ({ userId: "u", organizationId: "o", sessionId: "s", runId: "r", repositoryFullName: "owner/repo", signal: new AbortController().signal })
const retained = () => ({ id: "registry", sandboxName: "nova-fixture", baseSha: "a".repeat(40), expiresAt: new Date(Date.now() + 60_000), leaseRunId: null, leaseExpiresAt: null, status: "stopped", snapshotId: "snapshot", agentSessionId: "s" })

test("eligibility checks active membership, project ownership and repository binding", async () => {
  expect(await sandboxEligibility("u", "s")).toEqual({ organizationId: "o", repositoryFullName: "owner/repo" })
  membership = "inactive"
  await expect(sandboxEligibility("u", "s")).rejects.toThrow("access denied")
  membership = "active"
  projectUser = "someone-else"
  await expect(sandboxEligibility("u", "s")).rejects.toThrow("access denied")
  projectUser = "u"
  connected = false
  await expect(sandboxEligibility("u", "s")).rejects.toThrow("Connect")
})

test("busy and expired workspaces never reach provider acquisition", async () => {
  const get = spyOn(Sandbox, "get")
  row = { ...retained(), leaseRunId: "other" }
  await expect(openSandboxWorkspace(input())).rejects.toThrow("busy")
  row = { ...retained(), expiresAt: new Date(0) }
  await expect(openSandboxWorkspace(input())).rejects.toThrow("retention expired")
  row = retained()
  busy = 2
  await expect(openSandboxWorkspace(input())).rejects.toThrow("concurrency")
  expect(get).not.toHaveBeenCalled()
})

test("stop is attempted even when removing the network policy fails", async () => {
  let stopped = false
  const sandbox = { update: async () => { throw new Error("provider failure") }, stop: async () => { stopped = true } } as unknown as Sandbox
  await expect(stopSandbox(sandbox)).rejects.toThrow("cleanup requires recovery")
  expect(stopped).toBe(true)
})

test("resume preserves base and dirty workspace; failed stop can be retried", async () => {
  row = retained()
  let stops = 0
  let failStop = true
  const sandbox = {
    update: async () => {},
    stop: async () => { stops++; if (failStop) throw new Error("temporary stop failure") },
    currentSession: () => ({ sessionId: "provider-session" }),
    currentSnapshotId: "snapshot",
    runCommand: async () => ({
      async *logs() { yield { stream: "stdout", data: "" } },
      wait: async () => ({ exitCode: 0 }),
      kill: async () => {},
    }),
  } as unknown as Sandbox
  spyOn(Sandbox, "get").mockResolvedValue(sandbox)
  const create = spyOn(Sandbox, "create")
  const workspace = await openSandboxWorkspace(input())
  expect(create).not.toHaveBeenCalled()
  await expect(workspace.close()).rejects.toThrow("temporary")
  expect(updates.some((data) => data.leaseRunId === null)).toBe(false)
  failStop = false
  await workspace.close()
  await workspace.close()
  expect(stops).toBe(2)
  expect(updates.some((data) => data.status === "stopped" && data.leaseRunId === null)).toBe(true)
})

test("confirmed missing provider releases abandoned lease and fails the run", async () => {
  row = { ...retained(), leaseRunId: "r", leaseExpiresAt: new Date(0) }
  spyOn(Sandbox, "get").mockRejectedValue(new APIError(new Response(null, { status: 404 })))
  await reconcileSandboxWorkspaces()
  expect(updates.some((data) => data.status === "expired" && data.leaseRunId === null)).toBe(true)
  expect(runUpdates.some((data) => data.status === "failed")).toBe(true)
})

test("ambiguous provider failure keeps the lease for retry", async () => {
  row = { ...retained(), leaseRunId: "r", leaseExpiresAt: new Date(0) }
  spyOn(Sandbox, "get").mockRejectedValue(new Error("timeout"))
  await reconcileSandboxWorkspaces()
  expect(updates.some((data) => data.leaseRunId === null)).toBe(false)
  expect(runUpdates).toHaveLength(0)
})
