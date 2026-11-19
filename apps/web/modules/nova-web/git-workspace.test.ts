import { describe, expect, test } from "bun:test"

import { GitWorkspaceClient, workspacePublishIntent } from "./git-workspace"

describe("workspace publishing intent", () => {
  test("only direct delivery requests open confirmation", () => {
    expect(workspacePublishIntent("commit and create pr")).toBe("pr")
    expect(workspacePublishIntent("please push these changes")).toBe("push")
    expect(workspacePublishIntent("open a pull request")).toBe("pr")
    expect(workspacePublishIntent("commit this change")).toBe("commit")
    for (const text of [
      "how do I commit?",
      "explain git push",
      "do not commit",
      "fix the push button",
      "should we create a PR?",
    ])
      expect(workspacePublishIntent(text)).toBeNull()
  })
})

describe("workspace companion client", () => {
  test("does not contact a local endpoint before pairing", async () => {
    let calls = 0
    const client = new GitWorkspaceClient("fixture", async () => {
      calls++
      return Response.json({})
    })
    await expect(client.projects()).rejects.toThrow("Pair")
    expect(calls).toBe(0)
    for (const port of [0, 80, 65536, 2.5])
      await expect(client.pair(port, "code")).rejects.toThrow("port")
    expect(calls).toBe(0)
  })

  test("binds every operation to its paired loopback endpoint", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const client = new GitWorkspaceClient("fixture", async (url, init) => {
      requests.push({ url: String(url), init })
      if (String(url).endsWith("/pair"))
        return Response.json({
          token: "x".repeat(40),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        })
      return Response.json({
        projects: [
          {
            id: "project",
            name: "fixture",
            path: "/fixture",
            repositoryFullName: null,
            isGit: true,
          },
        ],
      })
    })
    await client.pair(47832, "code")
    expect((await client.projects())[0]?.id).toBe("project")
    expect(requests[1]?.url).toBe("http://127.0.0.1:47832/projects")
    expect(
      (requests[1]?.init?.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${"x".repeat(40)}`)
    expect(requests[1]?.init?.credentials).toBe("omit")
    client.disconnect()
    await expect(client.projects()).rejects.toThrow("Pair")
  })

  test("never falls back to another workspace when the companion is offline", async () => {
    const client = new GitWorkspaceClient("fixture", async (url) => {
      if (String(url).endsWith("/pair"))
        return Response.json({
          token: "x".repeat(40),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        })
      throw new Error("Offline")
    })
    await client.pair(47832, "code")
    await expect(client.get("worktree")).rejects.toThrow("not fall back")
  })
})
