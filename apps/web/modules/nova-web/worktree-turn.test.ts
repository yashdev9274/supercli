import { expect, spyOn, test } from "bun:test"
import { streamTurn } from "./api"
import type { WorktreeContext } from "../nova/local-projects/worktree-context"

test("normal turns preserve the typed local worktree identity and path index", async () => {
  const localWorktree: WorktreeContext = { sourceRef: "refs/heads/feature", baseSha: "a".repeat(40), paths: ["src/feature.ts"] }
  let payload: Record<string, unknown> | undefined
  const fetcher = spyOn(globalThis, "fetch").mockImplementation((async (url, init) => {
    expect(String(url)).toBe("/api/nova/sessions/session/turn")
    payload = JSON.parse(String(init?.body))
    return new Response('{"type":"finish","reason":"stop"}\n', { headers: { "Content-Type": "application/x-ndjson" } })
  }) as typeof fetch)
  try {
    for await (const _event of streamTurn("session", "Explain the selected file", { provider: "codex", model: "account-model", mode: "chat", localWorktree })) {}
    expect(payload?.localWorktree).toEqual(localWorktree)
    expect(payload?.provider).toBe("codex")
    expect(localWorktree.paths).toEqual(["src/feature.ts"])
  } finally { fetcher.mockRestore() }
})

test("ordinary cloud turns do not acquire or serialize a local worktree", async () => {
  let payload: Record<string, unknown> | undefined
  const fetcher = spyOn(globalThis, "fetch").mockImplementation((async (_url, init) => {
    payload = JSON.parse(String(init?.body))
    return new Response('{"type":"finish","reason":"stop"}\n')
  }) as typeof fetch)
  try {
    for await (const _event of streamTurn("session", "Question", { mode: "chat" })) {}
    expect(payload).not.toHaveProperty("localWorktree")
  } finally { fetcher.mockRestore() }
})
