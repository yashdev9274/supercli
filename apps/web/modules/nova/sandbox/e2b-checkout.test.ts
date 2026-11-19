import { expect, spyOn, test } from "bun:test"

import { checkoutE2B } from "./e2b-checkout"
import type { E2BWorkspace } from "./e2b"

test("E2B archive request uses the exact commit rather than a branch or default", async () => {
  const sha = "a".repeat(40)
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
  const commands: unknown[] = []
  const workspace = {
    sandbox: { files: { write: async () => {} } },
    runBounded: async (...args: unknown[]) => { commands.push(args); return { successful: true } },
  } as unknown as E2BWorkspace
  try {
    await checkoutE2B(workspace, "fork/repo", "fixture", new AbortController().signal, sha)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(`https://api.github.com/repos/fork/repo/tarball/${sha}`)
    expect(commands).toHaveLength(2)
    await expect(checkoutE2B(workspace, "fork/repo", "fixture", new AbortController().signal, "main")).rejects.toThrow("Invalid")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  } finally {
    fetchSpy.mockRestore()
  }
})

test("archive authorization failures report only the safe HTTP status and checkout phase", async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }))
  const stages: string[] = []
  const workspace = { sandbox: { files: { write: async () => {} } }, runBounded: async () => ({ successful: true }) } as unknown as E2BWorkspace
  try {
    await expect(checkoutE2B(workspace, "owner/private-repo", "fixture", new AbortController().signal, undefined, (stage) => stages.push(stage)))
      .rejects.toThrow("HTTP 403")
    expect(stages).toEqual(["requesting GitHub archive"])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  } finally {
    fetchSpy.mockRestore()
  }
})
