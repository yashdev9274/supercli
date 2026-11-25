import { beforeEach, expect, mock, test } from "bun:test"

const source = { repositoryFullName: "fork/repo", branch: "feature/topic", sha: "a".repeat(40) }
let parent: Record<string, unknown> | null = null
let project: Record<string, unknown> | null = null
let session: Record<string, unknown> = {}
let resolutions: unknown[] = []
const db = {
  organizationMembership: { findUnique: async () => ({ id: "m", status: "active" }) },
  agentSession: {
    findFirst: async () => parent,
    create: async ({ data }: { data: Record<string, unknown> }) => { session = { ...data, id: "s", status: "active", activeRunId: null, updatedAt: new Date() }; return session },
    findUniqueOrThrow: async () => ({ ...session, surfaces: [] }),
  },
  webLocalProject: { findFirst: async () => project, update: async () => ({}) },
  sessionSurface: { create: async () => ({ id: "surface" }) },
  agentActivity: { create: async () => ({}) },
  novaAuditEvent: { create: async () => ({}) },
  $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db),
}
mock.module("@super/db", () => ({ default: db }))
mock.module("@/modules/integrations/lib/org", () => ({ ensureUserOrganization: async () => "org" }))
mock.module("@/modules/nova/local-projects/github", () => ({ resolveGithubSource: async (...args: unknown[]) => { resolutions.push(args); return source } }))
const { createAgentSession } = await import("./service")

beforeEach(() => { parent = null; project = { id: "p", repositoryFullName: "fork/repo" }; session = {}; resolutions = [] })

test("explicit branch resolution is persisted and serialized, not trusted from the client", async () => {
  const summary = await createAgentSession({ userId: "u", objective: "work", localProjectId: "p", githubBranch: "feature/topic" })
  expect(resolutions).toEqual([["u", "fork/repo", "feature/topic"]])
  expect(session.policySnapshot).toEqual({ githubSource: source })
  expect(summary.githubSource).toEqual(source)
})

test("legacy or companion sessions without a branch remain unpinned", async () => {
  expect((await createAgentSession({ userId: "u", objective: "work", localProjectId: "p" })).githubSource).toBeUndefined()
  expect(resolutions).toHaveLength(0)
})

test("side threads inherit the immutable SHA even if branch head advances", async () => {
  parent = { id: "parent", localProjectId: "p", policySnapshot: { githubSource: source } }
  expect((await createAgentSession({ userId: "u", objective: "side", parentSessionId: "parent" })).githubSource).toEqual(source)
  expect(resolutions).toHaveLength(0)
  await expect(createAgentSession({ userId: "u", objective: "side", parentSessionId: "parent", githubBranch: "other" })).rejects.toThrow("inherit")
  project = { id: "p", repositoryFullName: "upstream/repo" }
  await expect(createAgentSession({ userId: "u", objective: "side", parentSessionId: "parent" })).rejects.toThrow("immutable")
})

test("branch selection requires an authorized connected project", async () => {
  project = null
  await expect(createAgentSession({ userId: "u", objective: "work", localProjectId: "not-owned", githubBranch: "topic" })).rejects.toThrow("connected GitHub project")
  await expect(createAgentSession({ userId: "u", objective: "work", githubBranch: "topic" })).rejects.toThrow("connected GitHub project")
  expect(resolutions).toHaveLength(0)
})
