import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { Sandbox } from "@vercel/sandbox"
import { Sandbox as E2BSandbox } from "e2b"

import * as e2b from "./e2b"

type Row = Record<string, unknown>
let rows: Row[] = []
let runUpdates = 0
let sessionUpdates = 0
let settlements: string[] = []
let onSettlement = () => {}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Row[]).some((condition) => matches(row, condition))
    if (key === "AND") return (value as Row[]).every((condition) => matches(row, condition))
    const actual = row[key]
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === "not") return actual !== expected
        if (operator === "equals") return Number(actual) === Number(expected)
        if (operator === "lt") return actual !== null && Number(actual) < Number(expected)
        if (operator === "gt") return actual !== null && Number(actual) > Number(expected)
        throw new Error(`Unsupported test filter: ${operator}`)
      })
    }
    return value instanceof Date ? Number(actual) === Number(value) : actual === value
  })
}

const db = {
  novaSandboxSession: {
    findMany: async ({ where, take, orderBy }: { where: Row; take: number; orderBy: Row[] }) => rows
      .filter((row) => matches(row, where))
      .sort((a, b) => {
        for (const order of orderBy) {
          const key = Object.keys(order)[0]!
          const difference = key === "id" ? String(a[key]).localeCompare(String(b[key])) : Number(a[key]) - Number(b[key])
          if (difference) return difference
        }
        return 0
      }).slice(0, take).map((row) => ({ ...row })),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const selected = rows.filter((row) => matches(row, where))
      for (const row of selected) Object.assign(row, data)
      return { count: selected.length }
    },
  },
  agentRun: { updateMany: async () => { runUpdates++; return { count: 1 } } },
  agentSession: { updateMany: async () => { sessionUpdates++; return { count: 1 } } },
  novaArtifact: { deleteMany: async () => ({ count: 0 }) },
  $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db),
}

mock.module("@super/db", () => ({ default: db }))
mock.module("./billing", () => ({
  reserveSandboxCredits: async () => { throw new Error("Recovery must not reserve credits") },
  recoverSandboxCredits: async (_userId: string, runId: string) => { settlements.push(runId); onSettlement() },
}))
mock.module("@/modules/github/lib/github", () => ({ getGithubTokenForUser: async () => { throw new Error("Recovery must not fetch GitHub credentials") } }))
const { reconcileSandboxWorkspaces } = await import("./service")

function retained(id = "a"): Row {
  return {
    id, sandboxName: id, provider: "vercel", userId: "user", agentSessionId: "session",
    baseSha: "a".repeat(40), leaseRunId: `run-${id}`, leaseExpiresAt: new Date(0),
    expiresAt: new Date(Date.now() + 60_000), lastUsedAt: new Date(id.charCodeAt(0)), status: "running",
  }
}

let onGet: (name: string) => void = () => {}
let onNetwork = () => {}
let onStop = () => {}
let gets: string[] = []
let stops = 0
let deletes = 0
let pauses = 0
let pauseResult = true
beforeEach(() => {
  rows = [retained()]
  runUpdates = 0
  sessionUpdates = 0
  settlements = []
  gets = []
  stops = 0
  deletes = 0
  pauses = 0
  pauseResult = true
  onGet = () => {}
  onNetwork = () => {}
  onStop = () => {}
  onSettlement = () => {}
  spyOn(e2b, "e2bCredentials").mockReturnValue({ apiKey: "e2b_fixture" })
  spyOn(E2BSandbox, "getInfo").mockImplementation(async () => ({ state: "running" }) as Awaited<ReturnType<typeof E2BSandbox.getInfo>>)
  spyOn(E2BSandbox, "updateNetwork").mockImplementation(async () => { onNetwork() })
  spyOn(E2BSandbox, "pause").mockImplementation(async () => { pauses++; return pauseResult })
  spyOn(Sandbox, "get").mockImplementation(async (options) => {
    const name = String(options.name)
    gets.push(name)
    onGet(name)
    return {
      update: async () => { onNetwork() },
      stop: async () => { stops++; onStop() },
      delete: async () => { deletes++ },
      currentSnapshotId: "snapshot",
    } as unknown as Sandbox
  })
})

afterEach(() => {
  mock.restore()
})

test("concurrent reconcilers exclusively claim the same abandoned lease", async () => {
  await Promise.all([reconcileSandboxWorkspaces(), reconcileSandboxWorkspaces()])
  expect(gets).toEqual(["a"])
  expect(stops).toBe(1)
  expect(settlements).toEqual(["run-a"])
  expect(runUpdates).toBe(1)
  expect(sessionUpdates).toBe(1)
  expect(rows[0]?.leaseRunId).toBeNull()
})

test("fresh recovery claims are excluded and stale claims can be retried", async () => {
  rows[0]!.status = "recovering"
  rows[0]!.leaseExpiresAt = new Date(Date.now() + 120_000)
  expect((await reconcileSandboxWorkspaces()).inspected).toBe(0)
  expect(gets).toEqual([])
  rows[0]!.leaseExpiresAt = new Date(0)
  await reconcileSandboxWorkspaces()
  expect(stops).toBe(1)
  expect(settlements).toEqual(["run-a"])
})

test("retention cleanup also excludes an unexpired recovery claim", async () => {
  Object.assign(rows[0]!, { leaseRunId: null, expiresAt: new Date(0), status: "recovering", leaseExpiresAt: new Date(Date.now() + 120_000) })
  expect((await reconcileSandboxWorkspaces()).inspected).toBe(0)
  rows[0]!.leaseExpiresAt = new Date(0)
  await reconcileSandboxWorkspaces()
  expect(deletes).toBe(1)
  expect(rows[0]!.status).toBe("expired")
})

test("lost ownership before stopping cannot interrupt a reopened run", async () => {
  onGet = () => { Object.assign(rows[0]!, { status: "running", leaseRunId: "new-run" }) }
  await reconcileSandboxWorkspaces()
  expect(stops).toBe(0)
  expect(settlements).toEqual([])
  expect(runUpdates).toBe(0)
  expect(rows[0]!.leaseRunId).toBe("new-run")
})

test("ownership is rechecked between network cleanup and stop", async () => {
  onNetwork = () => { rows[0]!.leaseExpiresAt = new Date(0) }
  await reconcileSandboxWorkspaces()
  expect(stops).toBe(0)
  expect(settlements).toEqual([])
})

test("lost ownership after provider cleanup prevents credit settlement", async () => {
  onStop = () => { rows[0]!.leaseExpiresAt = new Date(0) }
  await reconcileSandboxWorkspaces()
  expect(settlements).toEqual([])
  expect(runUpdates).toBe(0)
  expect(rows[0]!.leaseRunId).toBe("run-a")
})

test("final ownership loss cannot update the run or clear a new lease", async () => {
  onSettlement = () => { Object.assign(rows[0]!, { status: "running", leaseRunId: "new-run" }) }
  await reconcileSandboxWorkspaces()
  expect(settlements).toEqual(["run-a"])
  expect(runUpdates).toBe(0)
  expect(sessionUpdates).toBe(0)
  expect(rows[0]!.leaseRunId).toBe("new-run")
})

test("failed cleanup rotates behind other eligible work and preserves its run lease", async () => {
  rows = [retained("a"), retained("b"), retained("c")]
  onGet = (name) => { if (name !== "c") throw new Error("Provider unavailable") }
  await reconcileSandboxWorkspaces()
  expect(gets).toEqual(["a", "b"])
  for (const row of rows.slice(0, 2)) {
    expect(row.status).toBe("recovering")
    expect(row.leaseRunId).toBe(`run-${row.id}`)
    row.leaseExpiresAt = new Date(0)
  }
  await reconcileSandboxWorkspaces()
  expect(gets.slice(2)[0]).toBe("c")
  expect(rows[2]!.status).toBe("stopped")
})

test("E2B recovery uses verified filesystem pause before releasing its lease", async () => {
  Object.assign(rows[0]!, { provider: "e2b", providerSandboxId: "sandbox-fixture" })
  await reconcileSandboxWorkspaces()
  expect(pauses).toBe(1)
  expect(settlements).toEqual(["run-a"])
  expect(rows[0]!.status).toBe("stopped")
})

test("E2B pause refusal keeps the lease and skips settlement", async () => {
  Object.assign(rows[0]!, { provider: "e2b", providerSandboxId: "sandbox-fixture" })
  pauseResult = false
  await reconcileSandboxWorkspaces()
  expect(pauses).toBe(1)
  expect(settlements).toEqual([])
  expect(rows[0]!.leaseRunId).toBe("run-a")
  expect(rows[0]!.status).toBe("recovering")
})

test("E2B rechecks ownership before pausing after network cleanup", async () => {
  Object.assign(rows[0]!, { provider: "e2b", providerSandboxId: "sandbox-fixture" })
  onNetwork = () => { rows[0]!.leaseExpiresAt = new Date(0) }
  await reconcileSandboxWorkspaces()
  expect(pauses).toBe(0)
  expect(settlements).toEqual([])
})
