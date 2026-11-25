import { expect, test } from "bun:test"

import { createSession, listGithubProjectBranches } from "./api"
import { GitWorkspaceClient, type GitProject } from "./git-workspace"
import { matchWorkspaceProject } from "./workspace-discovery"

const projects: GitProject[] = [
  {
    id: "one",
    name: "app",
    path: "/first/app",
    repositoryFullName: "owner/app",
    isGit: true,
  },
  {
    id: "two",
    name: "backend",
    path: "/second/backend",
    repositoryFullName: "owner/backend",
    isGit: true,
  },
]

test("local discovery matches the selected repository or unique folder instead of the first approved root", () => {
  expect(
    matchWorkspaceProject(projects, { repositoryFullName: "OWNER/BACKEND" })
      ?.id,
  ).toBe("two")
  expect(matchWorkspaceProject(projects, { rootName: "backend" })?.id).toBe(
    "two",
  )
  expect(
    matchWorkspaceProject(projects, { repositoryFullName: "owner/missing" }),
  ).toBeUndefined()
  expect(
    matchWorkspaceProject(projects, { rootName: "missing" }),
  ).toBeUndefined()
  expect(
    matchWorkspaceProject(projects, { projectId: "missing" }),
  ).toBeUndefined()
  expect(matchWorkspaceProject(projects, {})).toBeUndefined()
  expect(
    matchWorkspaceProject(
      [
        ...projects,
        { ...projects[1]!, id: "duplicate", path: "/third/backend" },
      ],
      { rootName: "backend" },
    ),
  ).toBeUndefined()
})

test("GitHub branch discovery needs no pairing and selected branch is included in session creation", async () => {
  const original = globalThis.fetch
  const calls: Array<{ url: string; body?: unknown }> = []
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    if (String(input).endsWith("/branches"))
      return Response.json({
        defaultBranch: "trunk",
        branches: [
          { name: "trunk", sha: "a".repeat(40), isDefault: true },
          { name: "feature/selected", sha: "b".repeat(40), isDefault: false },
        ],
        truncated: false,
      })
    return Response.json({ session: { id: "new-thread" } })
  }) as unknown as typeof fetch
  try {
    expect(new GitWorkspaceClient("unpaired").connected).toBe(false)
    expect((await listGithubProjectBranches("project/id")).defaultBranch).toBe(
      "trunk",
    )
    await createSession("Fix selected branch", {
      localProjectId: "project/id",
      githubBranch: "feature/selected",
    })
    expect(calls.map((call) => call.url)).toEqual([
      "/api/nova/local-projects/project%2Fid/branches",
      "/api/nova/sessions",
    ])
    expect(calls[1]?.body).toMatchObject({
      githubBranch: "feature/selected",
      localProjectId: "project/id",
    })
  } finally {
    globalThis.fetch = original
  }
})

test("GitHub authorization failures are reported instead of falling back to local pairing", async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    Response.json(
      { error: "Repository access denied" },
      { status: 403 },
    )) as unknown as typeof fetch
  try {
    await expect(listGithubProjectBranches("project")).rejects.toThrow(
      "Repository access denied",
    )
  } finally {
    globalThis.fetch = original
  }
})
