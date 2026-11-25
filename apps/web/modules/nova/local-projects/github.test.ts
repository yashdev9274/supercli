import { beforeEach, expect, mock, test } from "bun:test"

let connected = true
let pages = 2
let session: Record<string, unknown> | null = null
let content = "pinned"
const calls: Array<{ method: string; input: Record<string, unknown> }> = []
const sha = "b".repeat(40)
const rest = {
  repos: {
    get: async (input: Record<string, unknown>) => { calls.push({ method: "repo", input }); return { data: { default_branch: "trunk" } } },
    listBranches: async (input: Record<string, unknown>) => {
      calls.push({ method: "branches", input })
      return { data: [{ name: input.page === 1 ? "trunk" : "feature/slashes", commit: { sha } }], headers: { link: Number(input.page) < pages ? '<next>; rel="next"' : undefined } }
    },
    getBranch: async (input: Record<string, unknown>) => {
      calls.push({ method: "branch", input })
      if (input.branch === "deleted") throw new Error("not found")
      return { data: { name: input.branch, commit: { sha } } }
    },
    getContent: async (input: Record<string, unknown>) => { calls.push({ method: "content", input }); return { data: { type: "file", content: Buffer.from(content).toString("base64"), encoding: "base64", size: Buffer.byteLength(content) } } },
  },
  git: { getTree: async (input: Record<string, unknown>) => { calls.push({ method: "tree", input }); return { data: { tree: [{ type: "blob", path: "src/pinned.ts" }] } } } },
}
mock.module("octokit", () => ({ Octokit: class { rest = rest } }))
mock.module("@super/db", () => ({ default: {
  repository: { findFirst: async () => connected ? { owner: "fork-owner", name: "repo", fullName: "fork-owner/repo" } : null },
  agentSession: { findFirst: async (input: Record<string, unknown>) => { calls.push({ method: "session", input }); return session } },
} }))
mock.module("@/modules/github/lib/github", () => ({ getGithubTokenForUser: async () => "fixture" }))
const { githubSourceFilePathSchema, listGithubBranches, resolveGithubSource, readSessionGithubSourceFile } = await import("./github")
const { packGithubProjectForTurn } = await import("./pack")

beforeEach(() => { calls.length = 0; pages = 2; connected = true; session = null; content = "pinned" })

test("discovery paginates the connected fork and marks its actual default", async () => {
  const result = await listGithubBranches("u", "fork-owner/repo")
  expect(result).toEqual({ defaultBranch: "trunk", truncated: false, branches: [{ name: "trunk", sha, isDefault: true }, { name: "feature/slashes", sha, isDefault: false }] })
  expect(calls.filter((call) => call.method === "branches").map((call) => call.input.page)).toEqual([1, 2])
  expect(calls.every((call) => call.input.owner === "fork-owner")).toBe(true)
})

test("discovery is bounded and reports truncation", async () => {
  pages = 11
  expect((await listGithubBranches("u", "fork-owner/repo")).truncated).toBe(true)
  expect(calls.filter((call) => call.method === "branches")).toHaveLength(10)
})

test("authorization precedes GitHub calls for both discovery and resolution", async () => {
  connected = false
  await expect(listGithubBranches("other", "fork-owner/repo")).rejects.toThrow("not connected")
  await expect(resolveGithubSource("other", "fork-owner/repo", "feature/slashes")).rejects.toThrow("not connected")
  expect(calls).toHaveLength(0)
})

test("resolving slash branches freezes their SHA and never falls back on deleted branches", async () => {
  expect(await resolveGithubSource("u", "fork-owner/repo", "feature/slashes")).toEqual({ repositoryFullName: "fork-owner/repo", branch: "feature/slashes", sha })
  await expect(resolveGithubSource("u", "fork-owner/repo", "deleted")).rejects.toThrow("not found")
  expect(calls.some((call) => call.method === "repo")).toBe(false)
})

test("fallback indexes and reads exact commit, discarding original folder text", async () => {
  const project = { repositoryFullName: "fork-owner/repo", paths: ["wrong.ts"] }
  const source = { repositoryFullName: "fork-owner/repo", branch: "feature/slashes", sha }
  const result = await packGithubProjectForTurn("u", project as never, "pinned", [
    { id: "local", kind: "text", name: "src/pinned.ts", size: 5, mediaType: "text/plain", text: "wrong" },
    { id: "requirements", kind: "text", name: "requirements.txt", size: 4, mediaType: "text/plain", text: "spec" },
  ], source)
  expect(result.map((file) => file.text)).toEqual(["spec", "pinned"])
  expect(calls.find((call) => call.method === "tree")?.input.tree_sha).toBe(sha)
  expect(calls.find((call) => call.method === "content")?.input.ref).toBe(sha)
  await expect(packGithubProjectForTurn("u", { repositoryFullName: "upstream/repo" } as never, "", [], source)).rejects.toThrow("immutable")
})

test("source file reads require an active owner and matching project, and use the frozen SHA", async () => {
  const source = { repositoryFullName: "fork-owner/repo", branch: "feature/slashes", sha }
  session = { organizationId: "o", policySnapshot: { githubSource: source }, localProject: { status: "active", userId: "u", organizationId: "o", repositoryFullName: source.repositoryFullName } }
  expect(await readSessionGithubSourceFile("u", "s", "src/pinned.ts")).toEqual({ path: "src/pinned.ts", text: "pinned", githubSource: source })
  expect(calls.find((call) => call.method === "content")?.input.ref).toBe(sha)
  expect(calls.find((call) => call.method === "session")?.input.where).toEqual({ id: "s", initiatorMembership: { userId: "u", status: "active" }, organization: { memberships: { some: { userId: "u", status: "active" } } } })
  expect(await readSessionGithubSourceFile("u", "s")).toEqual({ paths: ["src/pinned.ts"], truncated: false, githubSource: source })
  expect(calls.find((call) => call.method === "tree")?.input.tree_sha).toBe(sha)
  calls.length = 0
  expect(await readSessionGithubSourceFile("other", "s", "src/pinned.ts")).toBeNull()
  expect(calls.some((call) => call.method === "content")).toBe(false)
  session = null
  expect(await readSessionGithubSourceFile("u", "missing", "src/pinned.ts")).toBeNull()
})

test("source file reads reject binary, oversized files, repository drift and unsafe paths", async () => {
  const source = { repositoryFullName: "fork-owner/repo", branch: "feature/slashes", sha }
  session = { organizationId: "o", policySnapshot: { githubSource: source }, localProject: { status: "active", userId: "u", organizationId: "o", repositoryFullName: source.repositoryFullName } }
  content = "binary\0file"
  await expect(readSessionGithubSourceFile("u", "s", "src/pinned.ts")).rejects.toThrow("bounded text")
  content = "x".repeat(65_537)
  await expect(readSessionGithubSourceFile("u", "s", "src/pinned.ts")).rejects.toThrow("bounded text")
  session.localProject = { status: "active", userId: "u", organizationId: "o", repositoryFullName: "upstream/repo" }
  await expect(readSessionGithubSourceFile("u", "s", "src/pinned.ts")).rejects.toThrow("immutable")
  for (const path of ["", "/absolute", "../escape", "foo/../escape", "a\\b", ".git/config", "a\n"]) expect(githubSourceFilePathSchema.safeParse(path).success).toBe(false)
})
