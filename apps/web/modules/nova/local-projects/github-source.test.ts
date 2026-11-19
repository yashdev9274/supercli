import { expect, test } from "bun:test"

import { agentSessionSummarySchema } from "@super/nova"
import { assertGithubSourceRepository, githubSourceFromPolicy, githubSourceSchema } from "./github-source"
import { createLocalWorktreeBindingService } from "./worktree-binding"

const source = { repositoryFullName: "owner/repo", branch: "feature/slashes", sha: "a".repeat(40) }

test("immutable source requires a repository, branch and actual commit, with no credentials or extras", () => {
  expect(githubSourceFromPolicy({ githubSource: source })).toEqual(source)
  expect(githubSourceFromPolicy({ mode: "legacy" })).toBeUndefined()
  for (const change of [{ repositoryFullName: "https://token@github.com/owner/repo" }, { sha: "main" }, { branch: "" }, { branch: "main\n" }, { token: "secret" }]) {
    expect(githubSourceSchema.safeParse({ ...source, ...change }).success).toBe(false)
    expect(() => githubSourceFromPolicy({ githubSource: { ...source, ...change } })).toThrow()
  }
  expect(agentSessionSummarySchema.shape.githubSource.parse(source)).toEqual(source)
})

test("a different fork or missing project cannot silently replace the source", () => {
  expect(() => assertGithubSourceRepository(source, "OWNER/REPO")).not.toThrow()
  expect(() => assertGithubSourceRepository(source, "other/repo")).toThrow("immutable")
  expect(() => assertGithubSourceRepository(source, null)).toThrow("immutable")
})

test("pinned GitHub sessions cannot acquire a second local source", async () => {
  let writes = 0
  const service = createLocalWorktreeBindingService({ agentSession: {
    findFirst: async () => ({ policySnapshot: { githubSource: source }, localWorkspaceBinding: null, activeRunId: null, parentSessionId: null }),
    updateMany: async () => { writes++; return { count: 1 } },
  } } as never)
  await expect(service.bindLocalWorktree("u", "s", { workspaceId: "w", projectId: "p", sourceRef: "main", baseSha: source.sha, mode: "worktree" })).rejects.toThrow("cannot bind")
  expect(writes).toBe(0)
})
