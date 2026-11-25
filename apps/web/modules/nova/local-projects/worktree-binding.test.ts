import { expect, test } from "bun:test"

import { Prisma } from "../../../../../packages/db/src/generated"

import {
  bindLocalWorktreeSchema,
  createLocalWorktreeBindingService,
  isLocalWorktreeRequestOrigin,
  localWorktreeBindingSchema,
  sameLocalWorktreeBinding,
  type LocalWorktreeBinding,
} from "./worktree-binding"

const binding: LocalWorktreeBinding = {
  workspaceId: "0123456789abcdef0123456789abcdef",
  projectId: "fedcba9876543210fedcba9876543210",
  sourceRef: "refs/heads/feature/local-workspace",
  baseSha: "a".repeat(40),
  mode: "worktree",
}

test("binding schema accepts only opaque identities and immutable Git provenance", () => {
  expect(localWorktreeBindingSchema.parse(binding)).toEqual(binding)
  for (const extra of [{ path: "/Users/local/repo" }, { token: "secret" }, { branch: "changed" }]) {
    expect(localWorktreeBindingSchema.safeParse({ ...binding, ...extra }).success).toBe(false)
  }
  for (const id of ["../repo", "/Users/repo", "file:///repo", "", "a b", "a".repeat(129)]) {
    expect(localWorktreeBindingSchema.safeParse({ ...binding, workspaceId: id }).success).toBe(false)
    expect(localWorktreeBindingSchema.safeParse({ ...binding, projectId: id }).success).toBe(false)
  }
  expect(bindLocalWorktreeSchema.safeParse({ binding, token: "secret" }).success).toBe(false)
})

test("only current checkout permits an unborn base commit", () => {
  expect(localWorktreeBindingSchema.safeParse({ ...binding, mode: "current", baseSha: "", sourceRef: "" }).success).toBe(true)
  expect(localWorktreeBindingSchema.safeParse({ ...binding, baseSha: "" }).success).toBe(false)
  expect(localWorktreeBindingSchema.safeParse({ ...binding, baseSha: "a".repeat(64) }).success).toBe(true)
  for (const baseSha of ["abc", "z".repeat(40), "a".repeat(41)]) {
    expect(localWorktreeBindingSchema.safeParse({ ...binding, baseSha }).success).toBe(false)
  }
})

test("source refs cannot contain absolute paths, revision expressions or control characters", () => {
  for (const sourceRef of ["/Users/repo", "C:\\repo", "main^{tree}", "main~1", "../main", "main\n", "https://token@host/repo", "--all"]) {
    expect(localWorktreeBindingSchema.safeParse({ ...binding, sourceRef }).success).toBe(false)
  }
})

test("equality compares all immutable fields independent of property order", () => {
  expect(sameLocalWorktreeBinding(binding, { mode: binding.mode, baseSha: binding.baseSha, sourceRef: binding.sourceRef, projectId: binding.projectId, workspaceId: binding.workspaceId })).toBe(true)
  for (const change of [{ workspaceId: "other" }, { projectId: "other" }, { sourceRef: "main" }, { baseSha: "b".repeat(40) }, { mode: "current" as const }]) {
    expect(sameLocalWorktreeBinding(binding, { ...binding, ...change })).toBe(false)
  }
})

test("PUT origin validation is exact and supports the known routing proxy hosts", () => {
  const request = (origin: string, extra: Record<string, string> = {}) => new Request("http://localhost:3003/api/test", { headers: { origin, ...extra } })
  expect(isLocalWorktreeRequestOrigin(request("http://localhost:3003"))).toBe(true)
  expect(isLocalWorktreeRequestOrigin(request("https://nova.supercodeai.tech", { "x-forwarded-host": "nova.supercodeai.tech", "x-forwarded-proto": "http" }))).toBe(true)
  for (const origin of ["null", "https://evil.example", "http://localhost:3003/", "http://localhost:3003.evil.example", "http://localhost:3000"]) {
    expect(isLocalWorktreeRequestOrigin(request(origin))).toBe(false)
  }
  expect(isLocalWorktreeRequestOrigin(new Request("http://localhost:3003/api/test"))).toBe(false)
  expect(isLocalWorktreeRequestOrigin(request("https://evil.example", { "x-forwarded-host": "evil.example" }))).toBe(false)
  expect(isLocalWorktreeRequestOrigin(request("http://nova.supercodeai.tech", { host: "nova.supercodeai.tech" }))).toBe(false)
})

function fixture(options: { owner?: string; active?: boolean; sideThread?: boolean; running?: boolean; stored?: LocalWorktreeBinding | null; race?: LocalWorktreeBinding | "run" } = {}) {
  let stored = options.stored ?? null
  let running = Boolean(options.running)
  const writes: unknown[] = []
  const reads: unknown[] = []
  type Repository = Parameters<typeof createLocalWorktreeBindingService>[0]
  const repository = {
    agentSession: {
      async findFirst(query: { where: { id: string; initiatorMembership: { userId: string; status: string }; organization: { memberships: { some: { userId: string; status: string } } } } }) {
        reads.push(query)
        if (query.where.id !== "session" || query.where.initiatorMembership.userId !== (options.owner ?? "owner") || options.active === false) return null
        return { localWorkspaceBinding: stored, activeRunId: running ? "run" : null, parentSessionId: options.sideThread ? "parent" : null }
      },
      async updateMany(query: { where: Record<string, unknown>; data: { localWorkspaceBinding: LocalWorktreeBinding } }) {
        writes.push(query)
        if (options.race === "run") running = true
        else if (options.race) stored = options.race
        if (stored || running) return { count: 0 }
        stored = query.data.localWorkspaceBinding
        return { count: 1 }
      },
    },
  } as unknown as Repository
  return { service: createLocalWorktreeBindingService(repository), writes, reads }
}

test("owner can read null or bind once; conditional write rechecks ownership and run state", async () => {
  const f = fixture()
  expect(await f.service.getLocalWorktreeBinding("owner", "session")).toBeNull()
  expect(await f.service.bindLocalWorktree("owner", "session", binding)).toEqual(binding)
  expect(await f.service.getLocalWorktreeBinding("owner", "session")).toEqual(binding)
  expect(f.writes).toEqual([{
    where: {
      id: "session",
      initiatorMembership: { userId: "owner", status: "active" },
      organization: { memberships: { some: { userId: "owner", status: "active" } } },
      activeRunId: null,
      parentSessionId: null,
      localWorkspaceBinding: { equals: Prisma.DbNull },
    },
    data: { localWorkspaceBinding: binding },
  }])
})

test("nonowners, inactive memberships and unknown sessions cannot read or bind", async () => {
  for (const [f, user, sessionId] of [[fixture(), "other", "session"], [fixture({ active: false }), "owner", "session"], [fixture(), "owner", "missing"]] as const) {
    await expect(f.service.getLocalWorktreeBinding(user, sessionId)).rejects.toThrow("Session not found")
    await expect(f.service.bindLocalWorktree(user, sessionId, binding)).rejects.toThrow("Session not found")
    expect(f.writes).toHaveLength(0)
  }
})

test("idempotent retries never write, even after a run starts", async () => {
  const f = fixture({ stored: binding, running: true })
  expect(await f.service.bindLocalWorktree("owner", "session", binding)).toEqual(binding)
  expect(f.writes).toHaveLength(0)
})

test("any change to an existing binding is rejected", async () => {
  const f = fixture({ stored: binding })
  for (const change of [{ workspaceId: "other" }, { projectId: "other" }, { sourceRef: "main" }, { baseSha: "b".repeat(40) }, { mode: "current" as const }]) {
    await expect(f.service.bindLocalWorktree("owner", "session", { ...binding, ...change })).rejects.toThrow("already bound")
  }
  expect(f.writes).toHaveLength(0)
})

test("active runs and side threads cannot acquire bindings", async () => {
  for (const f of [fixture({ running: true }), fixture({ sideThread: true })]) {
    await expect(f.service.bindLocalWorktree("owner", "session", binding)).rejects.toThrow()
    expect(f.writes).toHaveLength(0)
  }
})

test("a concurrent identical bind is idempotent; a different bind or new run conflicts", async () => {
  expect(await fixture({ race: binding }).service.bindLocalWorktree("owner", "session", binding)).toEqual(binding)
  for (const race of [{ ...binding, workspaceId: "other" }, "run"] as const) {
    await expect(fixture({ race }).service.bindLocalWorktree("owner", "session", binding)).rejects.toThrow("Session changed")
  }
})

test("invalid stored JSON fails closed rather than returning an unbound session", async () => {
  const f = fixture({ stored: { ...binding, path: "/private" } as LocalWorktreeBinding })
  await expect(f.service.getLocalWorktreeBinding("owner", "session")).rejects.toThrow()
})
