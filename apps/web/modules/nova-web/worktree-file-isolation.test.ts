import { expect, test } from "bun:test"

import { GitWorkspaceClient, type GitWorkspace } from "./git-workspace"
import {
  activateManagedWorkspace,
  ensureLocalWorkspaceWritable,
  getLocalWorkspace,
  localWorkspaceStatusMessage,
  readLocalWorkspaceFile,
  searchLocalWorkspaceFiles,
  writeLocalWorkspaceFile,
} from "./local-workspace"

test("managed file search and reads cannot fall back to the original folder", async () => {
  const reads: string[] = []
  const release = activateManagedWorkspace({
    projectId: "project",
    rootName: "feature-worktree",
    paths: ["src/feature.ts"],
    read: async (path) => {
      reads.push(path)
      return "export const branch = 'feature'"
    },
  })
  try {
    expect(getLocalWorkspace()?.entries.map((entry) => entry.path)).toEqual(["src/feature.ts"])
    expect(searchLocalWorkspaceFiles("feature").map((file) => file.label)).toEqual(["src/feature.ts"])
    expect(searchLocalWorkspaceFiles("main-only")).toEqual([])
    expect(localWorkspaceStatusMessage()).toContain("feature-worktree")
    const result = await readLocalWorkspaceFile("src/feature.ts")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.attachment.text).toContain("'feature'")
    expect((await readLocalWorkspaceFile("src/main-only.ts")).ok).toBe(false)
    expect(reads).toEqual(["src/feature.ts"])
    expect((await writeLocalWorkspaceFile("src/feature.ts", "wrong checkout")).ok).toBe(false)
    expect((await ensureLocalWorkspaceWritable()).ok).toBe(false)
  } finally {
    release()
  }
  expect(getLocalWorkspace()?.rootName).not.toBe("feature-worktree")
})

test("a previous thread cleanup cannot clear the newly active worktree", () => {
  const first = activateManagedWorkspace({ projectId: null, rootName: "first", paths: [], read: async () => "" })
  const second = activateManagedWorkspace({ projectId: null, rootName: "second", paths: [], read: async () => "" })
  try {
    first()
    expect(getLocalWorkspace()?.rootName).toBe("second")
  } finally {
    second()
  }
})

test("packing rereads overlapping attachments from the selected worktree", async () => {
  const reads: string[] = []
  const client = new GitWorkspaceClient("isolation", async (url, init) => {
    if (url.endsWith("/pair")) return Response.json({ token: "x".repeat(40), expiresAt: new Date(Date.now() + 60_000).toISOString() })
    if (url.endsWith("/files")) return Response.json({ paths: ["README.md", "src/feature.ts"] })
    const input = JSON.parse(String(init?.body))
    expect(input.workspaceId).toBe("selected-worktree")
    reads.push(input.path)
    return Response.json({ content: "selected branch contents" })
  })
  await client.pair(47832, "code")
  const workspace: GitWorkspace = { id: "selected-worktree", projectId: "project", threadId: "thread", path: "/worktree", sourceRef: "refs/heads/feature", baseSha: "a".repeat(40), branch: "feature", mode: "worktree" }
  const packed = await client.pack(workspace, "README", [{ id: "original", name: "README.md", kind: "text", mediaType: "text/plain", size: 18, text: "original checkout" }])
  expect(packed.find((file) => file.name === "README.md")?.text).toBe("selected branch contents")
  expect(reads).toContain("README.md")
  expect(packed.filter((file) => file.name === "README.md")).toHaveLength(1)
})
