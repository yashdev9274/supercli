import { expect, test } from "bun:test"

import { GitWorkspaceClient, type GitWorkspace } from "./git-workspace"

test("saved worktree choices are scoped to the current account and valid thread keys", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const workspace: GitWorkspace = {
    id: "workspace",
    projectId: "project",
    threadId: "thread",
    path: "/fixture",
    sourceRef: "refs/heads/main",
    baseSha: "a".repeat(40),
    branch: null,
    mode: "worktree",
  }
  const records = new Map([
    ["nova:git-thread:owner:thread", JSON.stringify(workspace)],
    ["nova:git-thread:other:thread", JSON.stringify(workspace)],
    ["nova:git-thread:owner:thread:pending", JSON.stringify(workspace)],
    ["nova:git-thread:owner:broken", "not json"],
    ["nova:git-thread:owner:invalid", "{}"],
  ])
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      length: records.size,
      key: (index: number) => [...records.keys()][index] ?? null,
      getItem: (key: string) => records.get(key) ?? null,
    },
  })
  try {
    expect(new GitWorkspaceClient("owner").savedWorkspaces()).toEqual([
      workspace,
    ])
    expect(new GitWorkspaceClient("unrelated").savedWorkspaces()).toEqual([])
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous)
    else Reflect.deleteProperty(globalThis, "localStorage")
  }
})
