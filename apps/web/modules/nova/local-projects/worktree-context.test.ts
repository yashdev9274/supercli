import { describe, expect, test } from "bun:test"

import {
  assertWorktreeContext,
  formatWorktreeContext,
  worktreeContextSchema,
} from "./worktree-context"

describe("local worktree context", () => {
  test("bound threads cannot fall back to cloud or substitute another starting commit", () => {
    const binding = { sourceRef: "refs/heads/local", baseSha: "a".repeat(40) }
    expect(() => assertWorktreeContext(binding)).toThrow("cloud fallback is disabled")
    expect(() => assertWorktreeContext(binding, { ...binding, baseSha: "b".repeat(40), paths: [] })).toThrow("Reconnect")
    expect(() => assertWorktreeContext(null, { ...binding, paths: [] })).toThrow("Bind")
    expect(() => assertWorktreeContext(binding, { ...binding, paths: [] })).not.toThrow()
    expect(() => assertWorktreeContext(null)).not.toThrow()
  })
  test("validates an exact source snapshot without remote-default fallback", () => {
    const context = worktreeContextSchema.parse({
      sourceRef: "refs/heads/unpushed-local",
      baseSha: "a".repeat(40),
      paths: ["src/main.ts"],
    })
    const prompt = formatWorktreeContext(context)
    expect(prompt).toContain("not the GitHub default branch")
    expect(prompt).toContain("refs/heads/unpushed-local")
    expect(prompt).toContain("separate explicit confirmation")
  })
  test("rejects escaping paths and Git metadata", () => {
    for (const path of [
      "/etc/passwd",
      "../outside",
      ".git/config",
      "src/../../outside",
    ])
      expect(
        worktreeContextSchema.safeParse({
          sourceRef: "main",
          baseSha: "a".repeat(40),
          paths: [path],
        }).success,
      ).toBe(false)
  })
  test("supports an explicitly selected unborn current checkout", () => {
    expect(
      formatWorktreeContext(
        worktreeContextSchema.parse({ sourceRef: "", baseSha: "", paths: [] }),
      ),
    ).toContain("no commits yet")
  })
})
